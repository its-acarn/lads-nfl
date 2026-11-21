// Shapes for the /form page: what helpers/form/ produces from WaiverInputs.
// Plain data, so the logic stays network-free and testable against fixtures.

import { Position } from '../waivers/types'

export type FormPosition = Position | 'K' | 'DEF'
export const FORM_POSITIONS: FormPosition[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// Last N games played, or every game this season.
export type FormWindow = number | 'season'

// One game a player actually played. `team` is who he played for that week.
export interface PlayerGame {
  week: number
  team: string
  opponent: string
  points: number
}

export type Owner =
  { kind: 'fa' } | { kind: 'mine'; label: string } | { kind: 'other'; label: string; ownerId: string | null }

export type Signal = 'buy' | 'sell' | null
export type MatchupTier = 'soft' | 'neutral' | 'tough'

// opponent null = bye that week. rank: the opponent's points-allowed rank
// for the player's position (1 = gives up the most).
export interface UpcomingGame {
  week: number
  opponent: string | null
  tier: MatchupTier | null
  rank: number | null
}

export interface FormUsage {
  snap: number
  target: number
  carry: number
  airYards: number
  rzOppsPerGame: number
  passAttPerGame: number
  rushAttPerGame: number
}

export interface PlayerFormRow {
  playerId: string
  name: string
  position: FormPosition
  team: string
  injuryStatus: string | null
  owner: Owner
  games: PlayerGame[] // window games, oldest -> newest
  lastWeek: number // week of his most recent game
  missed: number // his current team's completed games since then
  gamesPlayed: number
  windowSize: number | null // null for 'season'
  avg: number
  seasonAvg: number
  delta: number
  floor: number
  hits: number
  usage: FormUsage | null // null for K/DEF
  usagePct: number | null
  pointsPct: number | null
  signal: Signal
  upcoming: UpcomingGame[]
}

export interface PointsAllowedRow {
  team: string
  games: number
  perGame: Record<FormPosition, number>
  rank: Record<FormPosition, number> // 1 = allows the most
}

export type TeamFormGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'K' | 'DEF'
export const TEAM_FORM_GROUPS: TeamFormGroup[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']

export interface LineupPlayer {
  id: string
  name: string
  position: string
  injuryStatus: string | null
  value: number // window average
}

// One starting slot; player null when the roster has nobody to fill it.
export interface LineupSpot {
  slot: TeamFormGroup
  player: LineupPlayer | null
}

export interface TeamFormRow {
  rosterId: number
  owner: Owner
  groups: Record<TeamFormGroup, number>
  total: number
  bench: number
  starters: LineupSpot[]
  benchPlayers: LineupPlayer[] // best leftover RB, WR, TE (those found)
  rank: Record<TeamFormGroup | 'total' | 'bench', number> // 1 = highest
}

export interface FormBoard {
  throughWeek: number
  upcomingWeek: number | null
  players: PlayerFormRow[]
  allowed: PointsAllowedRow[]
  teams: TeamFormRow[]
}
