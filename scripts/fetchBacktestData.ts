// Snapshot the 2025-era data the hindsight-free backtest needs into
// fixtures/backtest2025/. Network-touching by design, like fetchFixtures.ts;
// everything downstream of this runs offline from the committed output.
//
//   npm run backtest:data
//
// See docs/plans/draft-backtest-2025/draft-backtest-2025-execplan.md, M1.
//
// Three things are fetched. None of them may postdate the start of the 2025
// NFL season, because the whole point of the backtest is that the engine sees
// only what a drafter saw on 23 August 2025:
//
//   adp.ffc.json     Fantasy Football Calculator's 2025 pre-season consensus.
//                    A CROSS-CHECK, not the prior -- the prior comes from
//                    Andrew's spreadsheet (M2).
//   adp.jimmyg.json  A second, independent 12-team draft from the same
//                    pre-season window, used to extend the ADP tail.
//   league.2025.json The lads 2025 league's own lineup and scoring settings.
//
// Weekly player statistics are deliberately NOT fetched here. They are needed
// only for scoring, which is the deferred M7.

import * as fs from 'fs'
import * as path from 'path'
import { ladsLeagueId2025 } from '../config/config'

const SLEEPER = 'https://api.sleeper.app/v1'
const FFC = 'https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=12&year=2025'

// The "Jimmy G-whizz" league: a 12-team, 15-round snake drafted 2025-08-31,
// eight days after the lads draft and still before kickoff. Its realized pick
// order is an independent contemporaneous ADP sample. Backtest-specific, so it
// lives here rather than in config/config.ts, which is the site's id registry.
const JIMMYG_DRAFT_ID = '1267961683133878272'
const JIMMYG_EXPECTED_PICKS = 180

// The 2025 NFL regular season opened on 4 September. Any ADP snapshot dated on
// or after this carries knowledge of games played, which would silently poison
// every downstream result.
const SEASON_2025_KICKOFF = '2025-09-04'

// The lineup the 2025 lads league actually used. Asserted rather than read so
// that a shape change upstream fails here instead of skewing the backtest.
const EXPECTED_LINEUP_2025 = [
  'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN',
]

const OUT_DIR = path.join(__dirname, '..', 'fixtures', 'backtest2025')

function fail(msg: string): never {
  throw new Error(`fetchBacktestData: ${msg}`)
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

function assertObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${what} is not an object`)
  return v as Record<string, unknown>
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) fail(`GET ${url} -> HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}

// ---------------------------------------------------------------------------

export interface FfcPlayer {
  name: string
  position: string
  team: string | null
  adp: number
}

export interface FfcSnapshot {
  startDate: string
  endDate: string
  totalDrafts: number
  players: FfcPlayer[]
}

// Fantasy Football Calculator's payload is {meta: {...}, players: [...]}. Only
// the fields the cross-check consumes are kept.
export function validateFfc(raw: unknown): FfcSnapshot {
  const o = assertObject(raw, 'ffc payload')
  const meta = assertObject(o.meta, 'ffc.meta')
  const startDate = assertString(meta.start_date, 'ffc.meta.start_date')
  const endDate = assertString(meta.end_date, 'ffc.meta.end_date')

  // The end of the sampling window is the later bound, so it is the one that
  // must precede kickoff. String comparison is safe on ISO yyyy-mm-dd.
  if (endDate >= SEASON_2025_KICKOFF) {
    fail(
      `ADP snapshot ends ${endDate}, on or after the ${SEASON_2025_KICKOFF} kickoff — ` +
        `it would carry knowledge of the 2025 season and cannot be used`
    )
  }

  const players = assertArray(o.players, 'ffc.players').map((p, i) => {
    const e = assertObject(p, `ffc.players[${i}]`)
    return {
      name: assertString(e.name, `ffc.players[${i}].name`),
      position: assertString(e.position, `ffc.players[${i}].position`),
      team: typeof e.team === 'string' && e.team.length > 0 ? e.team : null,
      adp: assertNumber(e.adp, `ffc.players[${i}].adp`),
    }
  })
  if (players.length === 0) fail('ffc.players is empty')

  return {
    startDate,
    endDate,
    totalDrafts: assertNumber(meta.total_drafts, 'ffc.meta.total_drafts'),
    players,
  }
}

export interface JimmygPick {
  pick_no: number
  player_id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  team: string | null
}

// Only pick order and the draft-day player snapshot are kept: this fixture is
// an ADP sample, not a draft to be replayed.
export function validateJimmyg(raw: unknown): JimmygPick[] {
  const arr = assertArray(raw, 'jimmyg picks payload')
  if (arr.length !== JIMMYG_EXPECTED_PICKS) {
    fail(`jimmyg picks: expected ${JIMMYG_EXPECTED_PICKS} picks, got ${arr.length}`)
  }
  const out = arr.map((p, i) => {
    const o = assertObject(p, `jimmyg.picks[${i}]`)
    const meta = o.metadata && typeof o.metadata === 'object' ? (o.metadata as Record<string, unknown>) : {}
    return {
      pick_no: assertNumber(o.pick_no, `jimmyg.picks[${i}].pick_no`),
      player_id: assertString(o.player_id, `jimmyg.picks[${i}].player_id`),
      first_name: typeof meta.first_name === 'string' ? meta.first_name : null,
      last_name: typeof meta.last_name === 'string' ? meta.last_name : null,
      position: typeof meta.position === 'string' ? meta.position : null,
      team: typeof meta.team === 'string' && (meta.team as string).length > 0 ? (meta.team as string) : null,
    }
  })
  out.sort((a, b) => a.pick_no - b.pick_no)
  return out
}

export interface BacktestLeague {
  league_id: string
  season: string
  roster_positions: string[]
  playoff_week_start: number
  scoring_settings: Record<string, number>
}

export function validateLeague2025(raw: unknown): BacktestLeague {
  const o = assertObject(raw, 'league payload')
  const season = assertString(o.season, 'league.season')
  if (season !== '2025') fail(`league.season is ${season}, expected 2025`)

  const roster = assertArray(o.roster_positions, 'league.roster_positions').map((p, i) =>
    assertString(p, `league.roster_positions[${i}]`)
  )
  if (roster.join(',') !== EXPECTED_LINEUP_2025.join(',')) {
    fail(`league.roster_positions changed: got [${roster.join(', ')}], expected [${EXPECTED_LINEUP_2025.join(', ')}]`)
  }

  const scoringRaw = assertObject(o.scoring_settings, 'league.scoring_settings')
  const scoring: Record<string, number> = {}
  const keys = Object.keys(scoringRaw)
  for (let i = 0; i < keys.length; i++) {
    const v = scoringRaw[keys[i]]
    if (typeof v === 'number' && isFinite(v)) scoring[keys[i]] = v
  }
  // Half-PPR is what makes the Fantasy Football Calculator cross-check the
  // right format to compare against; if it ever changes, the comparison is
  // no longer apples to apples.
  if (scoring.rec !== 0.5) fail(`league scoring rec is ${String(scoring.rec)}, expected 0.5 (half-PPR)`)

  const settings = assertObject(o.settings, 'league.settings')
  return {
    league_id: assertString(o.league_id, 'league.league_id'),
    season,
    roster_positions: roster,
    playoff_week_start: assertNumber(settings.playoff_week_start, 'league.settings.playoff_week_start'),
    scoring_settings: scoring,
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const ffc = validateFfc(await getJson(FFC))
  // eslint-disable-next-line no-console
  console.log(
    `ADP snapshot ${ffc.startDate}..${ffc.endDate} over ${ffc.totalDrafts} drafts — ` +
      `precedes ${SEASON_2025_KICKOFF} kickoff, OK`
  )
  writeJson(path.join(OUT_DIR, 'adp.ffc.json'), ffc)

  const jimmyg = validateJimmyg(await getJson(`${SLEEPER}/draft/${JIMMYG_DRAFT_ID}/picks`))
  writeJson(path.join(OUT_DIR, 'adp.jimmyg.json'), jimmyg)

  const league = validateLeague2025(await getJson(`${SLEEPER}/league/${ladsLeagueId2025}`))
  writeJson(path.join(OUT_DIR, 'league.2025.json'), league)

  // eslint-disable-next-line no-console
  console.log(
    `\nffc ${ffc.players.length} players | jimmyg ${jimmyg.length} picks | ` +
      `league lineup ${league.roster_positions.length} slots, ${Object.keys(league.scoring_settings).length} scoring keys, ` +
      `playoffs start week ${league.playoff_week_start}`
  )
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
