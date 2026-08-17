// Render a completed draft as a readable account of the team.
//
//   npm run team -- --draft <draftId> [--log logs/<date>.jsonl]
//   npm run team -- --fixtures fixtures/lads/2025 --slot 2
//
// Works on any completed draft, not only one the bot watched (D6): this mock,
// the real September draft, or any committed fixture. The logic lives in
// helpers/draft/teamReport.ts so it is testable; this is only the wiring.

import * as fs from 'fs'
import * as path from 'path'
import { userForSlot } from '../helpers/draft/marketBoard'
import {
  assertLogMatchesDraft,
  buildTeamReport,
  draftIdOfLog,
  LoggedMessage,
  parseLog,
  renderTeamReport,
} from '../helpers/draft/teamReport'
import {
  DraftConfig,
  PlayerMap,
  ResolvedBoard,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
} from '../helpers/draft/types'

const ROOT = path.join(__dirname, '..')
const API = 'https://api.sleeper.app/v1'

function fail(msg: string): never {
  throw new Error(`team: ${msg}`)
}

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  const next = process.argv[idx + 1]
  if (idx === -1 || !next || next.indexOf('--') === 0) return null
  return next
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) fail(`GET ${url} -> HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function main(): Promise<void> {
  const fixturesArg = arg('fixtures')
  const draftId = arg('draft')
  const logArg = arg('log')
  const slotArg = arg('slot')

  if (!fixturesArg && !draftId) {
    fail(
      'give either --draft <draftId> or --fixtures <dir>.\n' +
        '  npm run team -- --draft 1394452945935794176 --log logs/2026-08-16.jsonl\n' +
        '  npm run team -- --fixtures fixtures/lads/2025 --slot 2'
    )
  }

  const players = readJson<PlayerMap>(path.join(ROOT, 'fixtures', 'players.trim.json'))
  // The RESOLVED board, because the report matches picks by player_id. An
  // unresolved board carries names only and would report every pick as
  // off-board.
  const boardFile = path.join(ROOT, 'config', 'board.resolved.json')
  if (!fs.existsSync(boardFile)) {
    fail('missing config/board.resolved.json — run `npm run resolve-board` first')
  }
  const board = readJson<ResolvedBoard>(boardFile)

  let draft: SleeperDraft
  let picks: SleeperPick[]
  let tradedPicks: SleeperTradedPick[]
  let rosterPositions: string[]
  let myUserId: string

  if (fixturesArg) {
    const dir = path.isAbsolute(fixturesArg) ? fixturesArg : path.join(ROOT, fixturesArg)
    draft = readJson<SleeperDraft>(path.join(dir, 'draft.json'))
    picks = readJson<SleeperPick[]>(path.join(dir, 'picks.json'))
    tradedPicks = readJson<SleeperTradedPick[]>(path.join(dir, 'traded_picks.json'))
    rosterPositions = readJson<SleeperLeague>(path.join(dir, 'league.json')).roster_positions
    myUserId = slotArg ? userForSlot(draft, parseInt(slotArg, 10)) : board.myUserId
  } else {
    draft = (await getJson(`${API}/draft/${draftId}`)) as SleeperDraft
    picks = (await getJson(`${API}/draft/${draftId}/picks`)) as SleeperPick[]
    tradedPicks = (await getJson(`${API}/draft/${draftId}/traded_picks`)) as SleeperTradedPick[]
    // A mock has no league of its own; a LEAGUE mock names the real one under
    // metadata.league_id, which is where the real lineup comes from.
    const meta = (draft as unknown as { metadata?: Record<string, string> }).metadata || {}
    const leagueId = draft.league_id || meta.league_id || null
    if (leagueId) {
      rosterPositions = ((await getJson(`${API}/league/${leagueId}`)) as SleeperLeague).roster_positions
    } else {
      // Lineup shape does not affect this report -- nothing here consults it --
      // so a standalone mock is reported without one rather than refused.
      rosterPositions = []
    }
    myUserId = slotArg ? userForSlot(draft, parseInt(slotArg, 10)) : board.myUserId
  }

  if (picks.length === 0) fail('that draft has no picks yet — nothing to report')

  const cfg: DraftConfig = { draft, tradedPicks, myUserId, rosterPositions }

  let log: LoggedMessage[] | undefined
  if (logArg) {
    const logFile = path.isAbsolute(logArg) ? logArg : path.join(process.cwd(), logArg)
    if (!fs.existsSync(logFile)) fail(`no log at ${logArg}`)
    log = parseLog(fs.readFileSync(logFile, 'utf8'))
    // A log from another draft would produce a confident, wrong audit.
    assertLogMatchesDraft(log, draft.draft_id)
    if (draftIdOfLog(log) === null) {
      // eslint-disable-next-line no-console
      console.error(
        `WARNING: ${logArg} predates draft-id stamping, so it cannot be checked against ` +
          `draft ${draft.draft_id}. If it came from a different draft, the instruction audit ` +
          'below is wrong. Re-run the bot to get a stamped log.'
      )
    }
  }

  const report = buildTeamReport(cfg, picks, board, players, log)
  // eslint-disable-next-line no-console
  console.log(renderTeamReport(report))

  if (!logArg) {
    // eslint-disable-next-line no-console
    console.log(
      '\n_Instructions-vs-picks omitted: no --log given. The picks feed alone cannot tell a ' +
        'considered override from a recommendation that never arrived._'
    )
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
