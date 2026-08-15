// Live loop + console notifier CLI.
//
// Live:     npm run bot
//           (uses config/board.resolved.json: leagueId, draftId, myUserId)
// Dry run:  npm run bot -- --dry-run --fixtures fixtures/lads/2024 --slot 1 --speed 60
//           replays a fixture through the REAL poller/state machine on an
//           accelerated clock. --stall-my-picks 100 delays my own picks (in
//           draft-seconds) so escalation paths fire.
//
// Crash safety: every message is keyed (kind, pickNo) in
// .draftbot/sent-log.<draftId>.json; kill -9 and restart never re-spams.

import * as fs from 'fs'
import * as path from 'path'
import { runBot, BotOptions, DEFAULT_BOT_OPTIONS, Feed, SentLog } from '../helpers/draft/bot'
import { ConsoleNotifier } from '../helpers/draft/notifier'
import { buildMarketFixture, marketConfig, userForSlot } from '../helpers/draft/marketBoard'
import { DEFAULT_SIM_OPTS } from '../helpers/draft/survival'
import {
  PlayerMap,
  ResolvedBoard,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
} from '../helpers/draft/types'

const ROOT = path.join(__dirname, '..')
const API = 'https://api.sleeper.app/v1'

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  // A following flag is not a value: `--slot --speed 60` used to read slot as
  // "--speed" and then NaN it silently.
  if (!next || next.indexOf('--') === 0) return null
  return next
}
function flag(name: string): boolean {
  return process.argv.indexOf(`--${name}`) !== -1
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

// ---------------------------------------------------------------------------
// Sent-log: atomic-ish file persistence (write tmp, rename).
// ---------------------------------------------------------------------------

class FileSentLog implements SentLog {
  private file: string
  private data: Record<string, { at: string; ids?: string[] }>

  constructor(file: string) {
    this.file = file
    this.data = fs.existsSync(file) ? readJson(file) : {}
  }

  has(key: string): boolean {
    return !!this.data[key]
  }

  get(key: string): string[] | null {
    const entry = this.data[key]
    return entry && entry.ids ? entry.ids : null
  }

  set(key: string, ids?: string[]): Promise<void> {
    this.data[key] = { at: new Date().toISOString(), ids }
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1))
    fs.renameSync(tmp, this.file)
    return Promise.resolve()
  }
}

// The draftable pool is exactly players.trim.json's keys, and the stash rule
// reads its injury designations, so a stale snapshot silently hides anyone
// signed since it was taken and treats a since-injured player as healthy. The
// bot would cheerfully instruct a pick that is out for the season.
const MAX_PLAYER_MAP_AGE_HOURS = 48

function assertPlayerMapIsFresh(): void {
  const metaFile = path.join(ROOT, 'fixtures', 'players.trim.meta.json')
  if (!fs.existsSync(metaFile)) {
    throw new Error(
      'fixtures/players.trim.meta.json is missing, so the player map has no known age. ' +
        'Run `npm run fixtures` before drafting.'
    )
  }
  const meta = readJson<{ fetchedAt?: string }>(metaFile)
  const fetchedAt = meta.fetchedAt ? Date.parse(meta.fetchedAt) : NaN
  if (!isFinite(fetchedAt)) {
    throw new Error('fixtures/players.trim.meta.json has no usable fetchedAt — run `npm run fixtures`')
  }
  const ageHours = (Date.now() - fetchedAt) / 3600000
  if (ageHours > MAX_PLAYER_MAP_AGE_HOURS) {
    throw new Error(
      `player map is ${Math.round(ageHours)}h old (limit ${MAX_PLAYER_MAP_AGE_HOURS}h). ` +
        'Run `npm run fixtures` to refresh it — late signings would be undraftable and ' +
        'preseason injuries invisible to the stash rule.'
    )
  }
  // eslint-disable-next-line no-console
  console.log(`player map age: ${Math.round(ageHours)}h (limit ${MAX_PLAYER_MAP_AGE_HOURS}h) — OK`)
}

// ---------------------------------------------------------------------------
// Live feed
// ---------------------------------------------------------------------------

class HttpFeed implements Feed {
  constructor(private leagueId: string, private draftId: string) {}

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  getLeague(): Promise<SleeperLeague> {
    return this.getJson(`${API}/league/${this.leagueId}`) as Promise<SleeperLeague>
  }
  getDraft(): Promise<SleeperDraft> {
    return this.getJson(`${API}/draft/${this.draftId}`) as Promise<SleeperDraft>
  }
  getPicks(): Promise<SleeperPick[]> {
    return this.getJson(`${API}/draft/${this.draftId}/picks`) as Promise<SleeperPick[]>
  }
  getTradedPicks(): Promise<SleeperTradedPick[]> {
    return this.getJson(`${API}/draft/${this.draftId}/traded_picks`) as Promise<SleeperTradedPick[]>
  }
}

// ---------------------------------------------------------------------------
// Dry-run feed: replays a fixture on an accelerated clock through the real
// poller. Picks release every BASE_PICK_MS of draft time; my own picks can be
// stalled to exercise escalations.
// ---------------------------------------------------------------------------

const BASE_PICK_MS = 12000

class FixtureFeed implements Feed {
  private league: SleeperLeague
  private draft: SleeperDraft
  private picks: SleeperPick[]
  private traded: SleeperTradedPick[]
  private start: number
  private speed: number
  private stallMs: number
  private mySlot: number

  constructor(dir: string, speed: number, stallDraftSeconds: number, mySlot: number) {
    this.league = readJson<SleeperLeague>(path.join(dir, 'league.json'))
    this.draft = readJson<SleeperDraft>(path.join(dir, 'draft.json'))
    this.picks = readJson<SleeperPick[]>(path.join(dir, 'picks.json')).sort((a, b) => a.pick_no - b.pick_no)
    this.traded = readJson<SleeperTradedPick[]>(path.join(dir, 'traded_picks.json'))
    this.start = Date.now()
    this.speed = speed
    this.stallMs = stallDraftSeconds * 1000
    this.mySlot = mySlot
  }

  private draftElapsedMs(): number {
    return (Date.now() - this.start) * this.speed
  }

  private releaseTime(p: SleeperPick, index: number): number {
    const base = (index + 1) * BASE_PICK_MS
    return p.draft_slot === this.mySlot ? base + this.stallMs : base
  }

  private released(): SleeperPick[] {
    const t = this.draftElapsedMs()
    const out: SleeperPick[] = []
    for (let i = 0; i < this.picks.length; i++) {
      if (this.releaseTime(this.picks[i], i) <= t) out.push(this.picks[i])
    }
    return out
  }

  getLeague(): Promise<SleeperLeague> {
    return Promise.resolve(this.league)
  }
  getDraft(): Promise<SleeperDraft> {
    const done = this.released().length >= this.picks.length
    return Promise.resolve({ ...this.draft, status: done ? 'complete' : 'drafting' })
  }
  getPicks(): Promise<SleeperPick[]> {
    return Promise.resolve(this.released())
  }
  getTradedPicks(): Promise<SleeperTradedPick[]> {
    return Promise.resolve(this.traded)
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = flag('dry-run')
  const notifier = new ConsoleNotifier()

  let feed: Feed
  let board: ResolvedBoard
  let players: PlayerMap
  let myUserId: string
  let timeScale = 1
  let pollMs = 3000
  let logName: string

  if (dryRun) {
    const dir = arg('fixtures') || 'fixtures/lads/2024'
    const slot = parseInt(arg('slot') || '1', 10)
    const speed = parseFloat(arg('speed') || '60')
    const stall = parseFloat(arg('stall-my-picks') || '0')
    const fixtureDir = path.isAbsolute(dir) ? dir : path.join(ROOT, dir)

    const draft = readJson<SleeperDraft>(path.join(fixtureDir, 'draft.json'))
    const picks = readJson<SleeperPick[]>(path.join(fixtureDir, 'picks.json'))
    const realPlayers = readJson<PlayerMap>(path.join(ROOT, 'fixtures', 'players.trim.json'))
    myUserId = userForSlot(draft, slot)
    const market = buildMarketFixture(draft, picks, realPlayers, myUserId)
    board = market.board
    players = market.players
    feed = new FixtureFeed(fixtureDir, speed, stall, slot)
    timeScale = speed
    pollMs = Math.max(40, Math.round(3000 / speed))
    logName = `dryrun-${path.basename(path.dirname(fixtureDir))}-${path.basename(fixtureDir)}-slot${slot}`
    // eslint-disable-next-line no-console
    console.log(`DRY RUN: ${dir} slot ${slot} speed x${speed}${stall ? ` stall ${stall}s` : ''}`)
  } else {
    board = readJson<ResolvedBoard>(path.join(ROOT, 'config', 'board.resolved.json'))
    players = readJson<PlayerMap>(path.join(ROOT, 'fixtures', 'players.trim.json'))
    // Three separate gates, because passing one says nothing about the others.
    // The ids were filled in weeks before the player list was, so "the ids look
    // real" was never evidence the board was ready to draft from.
    if (board.leagueId.indexOf('<') !== -1 || board.draftId.indexOf('<') !== -1 || board.myUserId.indexOf('<') !== -1) {
      throw new Error(
        'config/board.json still has placeholder leagueId/draftId/myUserId — fill them in and re-run `npm run resolve-board`'
      )
    }
    if (board.draftReady !== true) {
      throw new Error(
        `config/board.json is not marked draft-ready (it has ${board.players.length} players). ` +
          'Fill in the real tiered board, re-run `npm run resolve-board`, then set "draftReady": true. ' +
          'Running live against a partial board would draft from ADP interpolation, not from your rankings.'
      )
    }
    assertPlayerMapIsFresh()
    myUserId = board.myUserId
    feed = new HttpFeed(board.leagueId, board.draftId)
    logName = board.draftId
  }

  const log = new FileSentLog(path.join(ROOT, '.draftbot', `sent-log.${logName}.json`))

  const opts: BotOptions = {
    ...DEFAULT_BOT_OPTIONS,
    myUserId,
    pollMs,
    timeScale,
    simOpts: DEFAULT_SIM_OPTS,
    maxLoops: null,
  }

  const started = Date.now()
  const result = await runBot(board, players, opts, {
    feed,
    notifier,
    log,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    jitter: () => Math.random(),
  })

  if (dryRun) {
    const wallMinutes = (Date.now() - started) / 60000
    const draftMinutes = wallMinutes * timeScale
    const calls = result.counters.picksFetches + result.counters.draftFetches
    const perDraftMinute = calls / Math.max(draftMinutes, 0.001)
    // eslint-disable-next-line no-console
    console.log(
      `\nDRY RUN SUMMARY: completed=${result.completed} loops=${result.counters.loops} ` +
        `API-equivalent calls/min=${perDraftMinute.toFixed(1)} (criterion < 25)`
    )
    if (perDraftMinute >= 25) process.exit(1)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
