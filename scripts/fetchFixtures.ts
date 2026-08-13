// Snapshot completed Sleeper drafts + a trimmed player map into fixtures/.
// Network-touching by design: run where api.sleeper.app is reachable
// (Claude Code remote session, Andrew's machine, or an Actions runner).
//
//   npm run fixtures
//
// Walks previous_league_id from each root league, snapshots every completed
// season's draft, and writes fixtures/players.trim.json. Validators throw on
// shape drift rather than writing bad fixtures.

import * as fs from 'fs'
import * as path from 'path'
import { ladsLeagueId2024, flexiLeagueId2024 } from '../config/config'
import {
  FANTASY_POSITIONS,
  PlayerMap,
  Position,
  SleeperLeague,
  TrimmedPlayer,
} from '../helpers/draft/types'

const API = 'https://api.sleeper.app/v1'
const ROOTS: Record<string, string> = {
  lads: ladsLeagueId2024,
  flexi: flexiLeagueId2024,
}
const OUT_DIR = path.join(__dirname, '..', 'fixtures')

function fail(msg: string): never {
  throw new Error(`fetchFixtures: ${msg}`)
}

function assertString(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${what} is not a non-empty string: ${JSON.stringify(v)}`)
  return v
}

function assertNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || !isFinite(v)) fail(`${what} is not a finite number: ${JSON.stringify(v)}`)
  return v
}

function assertArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) fail(`${what} is not an array`)
  return v
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) fail(`GET ${url} -> HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validateLeague(raw: unknown): SleeperLeague {
  const o = raw as Record<string, unknown>
  if (!o || typeof o !== 'object') fail('league payload is not an object')
  return {
    league_id: assertString(o.league_id, 'league.league_id'),
    name: assertString(o.name, 'league.name'),
    season: assertString(o.season, 'league.season'),
    status: assertString(o.status, 'league.status'),
    previous_league_id: o.previous_league_id === null ? null : assertString(o.previous_league_id, 'league.previous_league_id'),
    draft_id: o.draft_id === null ? null : assertString(o.draft_id, 'league.draft_id'),
    total_rosters: assertNumber(o.total_rosters, 'league.total_rosters'),
    roster_positions: assertArray(o.roster_positions, 'league.roster_positions').map((p, i) =>
      assertString(p, `league.roster_positions[${i}]`)
    ),
  }
}

function validateDraft(raw: unknown): Record<string, unknown> {
  const o = raw as Record<string, unknown>
  if (!o || typeof o !== 'object') fail('draft payload is not an object')
  assertString(o.draft_id, 'draft.draft_id')
  assertString(o.type, 'draft.type')
  assertString(o.status, 'draft.status')
  const settings = o.settings as Record<string, unknown>
  if (!settings || typeof settings !== 'object') fail('draft.settings missing')
  assertNumber(settings.teams, 'draft.settings.teams')
  assertNumber(settings.rounds, 'draft.settings.rounds')
  if (!o.draft_order || typeof o.draft_order !== 'object') fail('draft.draft_order missing')
  if (!o.slot_to_roster_id || typeof o.slot_to_roster_id !== 'object') fail('draft.slot_to_roster_id missing')
  return o
}

function validatePicks(raw: unknown): Record<string, unknown>[] {
  const arr = assertArray(raw, 'picks payload')
  return arr.map((p, i) => {
    const o = p as Record<string, unknown>
    assertNumber(o.pick_no, `picks[${i}].pick_no`)
    assertNumber(o.round, `picks[${i}].round`)
    assertNumber(o.draft_slot, `picks[${i}].draft_slot`)
    assertString(o.player_id, `picks[${i}].player_id`)
    return o
  })
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}

async function snapshotChain(name: string, rootLeagueId: string): Promise<void> {
  let leagueId: string | null = rootLeagueId
  while (leagueId && leagueId !== '0') {
    const league = validateLeague(await getJson(`${API}/league/${leagueId}`))
    await sleep(150)
    if (league.status !== 'complete') {
      // eslint-disable-next-line no-console
      console.log(`skip ${name}/${league.season}: league status=${league.status}`)
      leagueId = league.previous_league_id
      continue
    }
    const drafts = assertArray(await getJson(`${API}/league/${leagueId}/drafts`), 'drafts payload')
    await sleep(150)
    if (drafts.length === 0) fail(`${name}/${league.season}: no drafts`)
    const draftId = assertString((drafts[0] as Record<string, unknown>).draft_id, 'drafts[0].draft_id')
    const draft = validateDraft(await getJson(`${API}/draft/${draftId}`))
    await sleep(150)
    if (draft.status !== 'complete') fail(`${name}/${league.season}: draft status=${String(draft.status)}`)
    const picks = validatePicks(await getJson(`${API}/draft/${draftId}/picks`))
    await sleep(150)
    const traded = assertArray(await getJson(`${API}/draft/${draftId}/traded_picks`), 'traded_picks payload')
    await sleep(150)

    const dir = path.join(OUT_DIR, name, league.season)
    writeJson(path.join(dir, 'league.json'), league)
    writeJson(path.join(dir, 'draft.json'), draft)
    writeJson(path.join(dir, 'picks.json'), picks)
    writeJson(path.join(dir, 'traded_picks.json'), traded)
    leagueId = league.previous_league_id
  }
}

async function snapshotPlayers(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('fetching /players/nfl (large blob, not committed)...')
  const raw = (await getJson(`${API}/players/nfl`)) as Record<string, Record<string, unknown>>
  if (!raw || typeof raw !== 'object') fail('players payload is not an object')
  const trimmed: PlayerMap = {}
  const ids = Object.keys(raw)
  for (let i = 0; i < ids.length; i++) {
    const p = raw[ids[i]]
    const pos = p.position as Position
    if (FANTASY_POSITIONS.indexOf(pos) === -1) continue
    // Keep every rostered player regardless of status (IR/Inactive players
    // must stay in the pool for stashRound logic), plus all team DEFs.
    if (pos !== 'DEF' && !p.team) continue
    const t: TrimmedPlayer = {
      player_id: assertString(p.player_id, `players[${ids[i]}].player_id`),
      full_name: typeof p.full_name === 'string' ? p.full_name : null,
      first_name: typeof p.first_name === 'string' ? p.first_name : null,
      last_name: typeof p.last_name === 'string' ? p.last_name : null,
      position: pos,
      team: typeof p.team === 'string' ? p.team : null,
      search_rank: typeof p.search_rank === 'number' ? p.search_rank : null,
      injury_status: typeof p.injury_status === 'string' ? p.injury_status : null,
      status: typeof p.status === 'string' ? p.status : null,
      age: typeof p.age === 'number' ? p.age : null,
    }
    trimmed[t.player_id] = t
  }
  const count = Object.keys(trimmed).length
  if (count < 500) fail(`players trim looks wrong: only ${count} players kept`)
  writeJson(path.join(OUT_DIR, 'players.trim.json'), trimmed)
}

async function main(): Promise<void> {
  const names = Object.keys(ROOTS)
  for (let i = 0; i < names.length; i++) {
    await snapshotChain(names[i], ROOTS[names[i]])
  }
  await snapshotPlayers()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
