// Snapshot everything the waiver scout reads into fixtures/waivers/2026/.
// Network-touching by design; tests read only the committed snapshot.
//
//   npm run waivers:fixtures
//
// Stats are trimmed to STAT_KEYS and the player map to scouted players seen in
// stats or rosters (helpers/waivers/trim.ts). Refreshing changes the board
// golden snapshot: run `npm test` afterwards and read the diff before
// committing.

import * as fs from 'fs'
import * as path from 'path'
import { flexiLeagueId2026, ladsLeagueId2026 } from '../config/config'
import { trimPlayers, trimWeekStats } from '../helpers/waivers/trim'
import { WaiverRoster, WeekStats } from '../helpers/waivers/types'

const API = 'https://api.sleeper.app/v1'
const SCHEDULE_API = 'https://api.sleeper.com/schedule/nfl/regular'
// The api.sleeper.com stats feed carries each player's team for that week;
// api.sleeper.app/v1's does not.
const STATS_API = 'https://api.sleeper.com/stats/nfl'
const LEAGUES: Record<string, string> = { lads: ladsLeagueId2026, flexi: flexiLeagueId2026 }
const OUT_DIR = path.join(__dirname, '..', 'fixtures', 'waivers', '2026')

function fail(msg: string): never {
  throw new Error(`fetchWaiverFixtures: ${msg}`)
}

async function getJson(url: string): Promise<any> {
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

function write(rel: string, data: unknown): void {
  const file = path.join(OUT_DIR, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
  console.log(`wrote ${path.relative(path.join(__dirname, '..'), file)}`)
}

async function main(): Promise<void> {
  const state = await getJson(`${API}/state/nfl`)
  if (state.season !== '2026' || typeof state.week !== 'number') fail(`unexpected state ${JSON.stringify(state)}`)
  const [schedule, rawPlayers, trending] = await Promise.all([
    getJson(`${SCHEDULE_API}/${state.season}`),
    getJson(`${API}/players/nfl`),
    getJson(`${API}/players/nfl/trending/add?lookback_hours=48&limit=50`),
  ])

  const seen = new Set<string>()
  const weeks: WeekStats[] = []
  for (let w = 1; w <= state.week; w++) {
    const week = trimWeekStats(await getJson(`${STATS_API}/${state.season}/${w}?season_type=regular`))
    Object.keys(week).forEach((id) => seen.add(id))
    weeks.push(week)
  }

  const leagues: Record<string, { league: any; rosters: WaiverRoster[]; users: any[] }> = {}
  for (const key of Object.keys(LEAGUES)) {
    const id = LEAGUES[key]
    const [league, rosters, users] = await Promise.all([
      getJson(`${API}/league/${id}`),
      getJson(`${API}/league/${id}/rosters`),
      getJson(`${API}/league/${id}/users`),
    ])
    rosters.forEach((r: WaiverRoster) =>
      [r.players, r.reserve, r.taxi].forEach((ids) => (ids || []).forEach((p) => seen.add(p)))
    )
    leagues[key] = {
      league: {
        league_id: league.league_id,
        name: league.name,
        roster_positions: league.roster_positions,
        scoring_settings: { rec: league.scoring_settings.rec },
      },
      rosters: rosters.map((r: any) => ({
        roster_id: r.roster_id,
        owner_id: r.owner_id,
        players: r.players,
        reserve: r.reserve,
        taxi: r.taxi,
      })),
      users: users.map((u: any) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        metadata: { team_name: u.metadata?.team_name },
      })),
    }
  }

  write('state.json', { week: state.week, season: state.season })
  write(
    'schedule.json',
    schedule.map((g: any) => ({ week: g.week, home: g.home, away: g.away, status: g.status }))
  )
  weeks.forEach((week, i) => write(`stats.week${i + 1}.json`, week))
  write('players.json', trimPlayers(rawPlayers, seen))
  write('trending.json', trending)
  Object.keys(leagues).forEach((key) => {
    write(`${key}/league.json`, leagues[key].league)
    write(`${key}/rosters.json`, leagues[key].rosters)
    write(`${key}/users.json`, leagues[key].users)
  })
  write('meta.json', { capturedAt: new Date().toISOString() })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
