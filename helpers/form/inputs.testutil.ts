// Test helper: small hand-built WaiverInputs for helpers/form tests.

import { PlayerMeta, ScheduleGame, StatLine, WaiverInputs, WeekStats } from '../waivers/types'

// Half-PPR-ish scoring with the league's fumble rule; enough for tests.
export const TEST_SCORING: Record<string, number> = { rec: 0.5, rec_yd: 0.1, rush_yd: 0.1, rec_td: 6, rush_td: 6, fum: -1, fgm_30_39: 3, xpm: 1, sack: 1 }

export function meta(id: string, position: string, team: string | null, extra: Partial<PlayerMeta> = {}): PlayerMeta {
  return {
    player_id: id,
    full_name: position === 'DEF' ? null : `Player ${id}`,
    position,
    team,
    active: true,
    injury_status: null,
    depth_chart_position: null,
    depth_chart_order: null,
    ...extra,
  }
}

export function game(week: number, home: string, away: string, status = 'complete'): ScheduleGame {
  return { week, home, away, status }
}

export function row(team: string, stats: StatLine): { team: string; stats: StatLine } {
  return { team, stats }
}

export function makeInputs(parts: {
  week?: number
  schedule: ScheduleGame[]
  statsByWeek: Record<number, WeekStats>
  players: PlayerMeta[]
  rosters?: WaiverInputs['rosters']
  users?: WaiverInputs['users']
  rosterPositions?: string[]
}): WaiverInputs {
  const players: WaiverInputs['players'] = {}
  parts.players.forEach((p) => (players[p.player_id] = p))
  const weeks = Object.keys(parts.statsByWeek).map(Number)
  return {
    week: parts.week ?? Math.max(...weeks),
    schedule: parts.schedule,
    statsByWeek: parts.statsByWeek,
    players,
    trending: [],
    league: { league_id: 'L', name: 'Test', roster_positions: parts.rosterPositions ?? [], scoring_settings: TEST_SCORING },
    rosters: parts.rosters ?? [],
    users: parts.users ?? [],
  }
}
