// Shapes for the waiver scout: the Sleeper responses it reads, and what it
// produces. Everything here is plain data so the logic stays network-free and
// testable against committed fixtures (fixtures/waivers/).

export type Position = 'QB' | 'RB' | 'WR' | 'TE'
export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

// Every stat key the scout reads. The fixture script keeps only these, so a
// metric that needs a new key must add it here and refresh the fixtures.
export const STAT_KEYS = [
  'off_snp',
  'tm_off_snp',
  'rec_tgt',
  'rec_air_yd',
  'rec_rz_tgt',
  'rush_att',
  'rush_yd',
  'rush_rz_att',
  'pass_att',
  'pass_rz_att',
  'pass_air_yd',
  'pass_sack',
  'pass_int',
  'fum_lost',
  'rz_att',
  'rz_conv',
  'fga',
  'pts_ppr',
  'pts_half_ppr',
  'pts_std',
  'pts_allow',
  'sack',
  'int',
  'fum_rec',
  'def_td',
] as const
export type StatKey = typeof STAT_KEYS[number]

// One player's (or team's) stats for one week. Sleeper omits zero stats.
export type StatLine = Partial<Record<StatKey, number>>
// One row of GET api.sleeper.com/stats/nfl/{season}/{week}, trimmed. `team`
// is the NFL team he played for THAT week, so traded players split correctly.
export interface WeekLine {
  team: string | null
  stats: StatLine
}
// Keyed by player id, 'TEAM_XXX' (team offensive totals) or 'XXX' (that
// team's fantasy defence).
export type WeekStats = Record<string, WeekLine>

export interface ScheduleGame {
  week: number
  home: string
  away: string
  status: string // 'complete' | 'pre_game' | 'in_game'
}

export interface PlayerMeta {
  player_id: string
  full_name: string | null
  position: string | null
  team: string | null
  active: boolean
  injury_status: string | null
  depth_chart_position: string | null
  depth_chart_order: number | null
}
export type PlayerMap = Record<string, PlayerMeta>

export interface TrendingAdd {
  player_id: string
  count: number
}

export interface WaiverLeague {
  league_id: string
  name: string
  roster_positions: string[]
  scoring_settings: { rec?: number }
}

export interface WaiverRoster {
  roster_id: number
  owner_id: string | null
  players: string[] | null
  reserve: string[] | null
  taxi: string[] | null
}

export interface WaiverUser {
  user_id: string
  display_name: string
  metadata?: { team_name?: string }
}

// Everything buildWaiverBoard needs. The fixture script and the page's live
// fetch layer both produce exactly this.
export interface WaiverInputs {
  week: number // Sleeper's current week (state/nfl)
  schedule: ScheduleGame[]
  statsByWeek: Record<number, WeekStats>
  players: PlayerMap
  trending: TrendingAdd[]
  league: WaiverLeague
  rosters: WaiverRoster[]
  users: WaiverUser[]
}

// Per-player usage over the window (last three played games) and prior.
export interface ShareSet {
  snap: number
  target: number
  carry: number
  airYards: number
}

export interface PlayerUsage {
  playerId: string
  team: string // team of the most recent played game
  window: ShareSet
  prior: ShareSet | null // null when no played games before the window
  lastGameSnap: number
  gamesInWindow: number
  playedOfLastThreeTeamGames: number
  rzOppsPerGame: number
  ppg: number
  rushAttPerGame: number
  rushYdPerGame: number
  passAttPerGame: number
  passRzAttPerGame: number
}

export interface TeamVolume {
  team: string
  games: number
  passAttPerGame: number
  rushAttPerGame: number
  rzAttPerGame: number
  playsPerGame: number
}

export type FlagKind =
  | 'snapSurge'
  | 'targetHog'
  | 'workhorse'
  | 'buyLow'
  | 'redZone'
  | 'nextManUp'
  | 'trending'
  | 'newRole'
  | 'injured'

export interface Flag {
  kind: FlagKind
  label: string
}

export interface ScoredPlayer {
  playerId: string
  name: string
  position: Position
  team: string
  score: number // 0..100 after adjustments
  rawScore: number // weighted percentiles before adjustments
  usage: PlayerUsage
  injuryStatus: string | null
  flags: Flag[]
  trendingRank: number | null // 1..50, display only
}

export interface WaiverRow extends ScoredPlayer {
  upgradeOver: { playerId: string; name: string; score: number } | null
}

export interface StreamRow {
  playerId: string // the DEF team code, or the kicker's player id
  name: string
  team: string
  opponent: string | null // null on bye
  score: number
}

export interface InjuryAlert {
  player: ScoredPlayer
  bestReplacement: WaiverRow | null
}

export interface WaiverBoard {
  throughWeek: number
  positions: Record<Position, WaiverRow[]>
  kickers: StreamRow[] | null
  defences: StreamRow[] | null
  alerts: InjuryAlert[]
}
