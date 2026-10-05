// Shrink raw Sleeper responses to what the scout reads. Shared by the page's
// live fetch (helpers/waivers/fetch.ts) and scripts/fetchWaiverFixtures.ts, so
// fixtures and live data have one shape.

import {
  PlayerMap,
  PlayerMeta,
  ScheduleGame,
  STAT_KEYS,
  StatLine,
  WaiverLeague,
  WaiverRoster,
  WaiverUser,
  WeekStats,
} from './types'

export const SCOUTED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

function isScouted(raw: any): boolean {
  return !!raw && SCOUTED_POSITIONS.indexOf(raw.position) !== -1
}

function pickStats(line: Record<string, number>): StatLine {
  const out: StatLine = {}
  STAT_KEYS.forEach((k) => {
    if (typeof line[k] === 'number') out[k] = line[k]
  })
  return out
}

// Keep TEAM_XXX rows and the rows of scouted positions; the feed also carries
// defensive players, who are dropped. Each row keeps the team he played for
// that week.
export function trimWeekStats(rows: any[]): WeekStats {
  const out: WeekStats = {}
  rows.forEach((row) => {
    const id = String(row.player_id)
    if (id.indexOf('TEAM_') === 0 || isScouted(row.player)) {
      out[id] = { team: row.team ?? null, stats: pickStats(row.stats || {}) }
    }
  })
  return out
}

export function toPlayerMeta(raw: any): PlayerMeta {
  return {
    player_id: raw.player_id,
    full_name: raw.full_name ?? null,
    position: raw.position ?? null,
    team: raw.team ?? null,
    active: !!raw.active,
    injury_status: raw.injury_status ?? null,
    depth_chart_position: raw.depth_chart_position ?? null,
    depth_chart_order: raw.depth_chart_order ?? null,
  }
}

// Keep scouted players whose id is in `seen` (stats or rosters), plus every
// DEF entry so streaming can name each defence.
export function trimPlayers(rawPlayers: Record<string, any>, seen: Set<string>): PlayerMap {
  const out: PlayerMap = {}
  Object.keys(rawPlayers).forEach((id) => {
    const raw = rawPlayers[id]
    if (!isScouted(raw)) return
    if (raw.position === 'DEF' || seen.has(id)) out[id] = toPlayerMeta(raw)
  })
  return out
}

export function shapeLeague(raw: any): WaiverLeague {
  return {
    league_id: raw.league_id,
    name: raw.name,
    roster_positions: raw.roster_positions || [],
    scoring_settings: { rec: raw.scoring_settings?.rec },
  }
}

export function shapeRoster(raw: any): WaiverRoster {
  return {
    roster_id: raw.roster_id,
    owner_id: raw.owner_id ?? null,
    players: raw.players ?? null,
    reserve: raw.reserve ?? null,
    taxi: raw.taxi ?? null,
  }
}

export function shapeUser(raw: any): WaiverUser {
  return { user_id: raw.user_id, display_name: raw.display_name, metadata: { team_name: raw.metadata?.team_name } }
}

export function shapeSchedule(raw: any[]): ScheduleGame[] {
  return raw.map((g) => ({ week: g.week, home: g.home, away: g.away, status: g.status }))
}
