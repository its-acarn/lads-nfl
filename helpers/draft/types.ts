// Sleeper API + draft-engine domain types.
// Only the fields the engine consumes are modelled; validators in the
// scripts fail loudly if the live shapes drift from these.

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'

export const FANTASY_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// ---------------------------------------------------------------------------
// Sleeper API shapes
// ---------------------------------------------------------------------------

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  status: string
  previous_league_id: string | null
  draft_id: string | null
  total_rosters: number
  roster_positions: string[]
}

export interface SleeperDraftSettings {
  teams: number
  rounds: number
  pick_timer?: number
  reversal_round?: number
}

export interface SleeperDraft {
  draft_id: string
  league_id: string | null
  type: string // 'snake' | 'linear' | 'auction'
  status: string // 'pre_draft' | 'drafting' | 'paused' | 'complete'
  season: string
  settings: SleeperDraftSettings
  draft_order: Record<string, number> | null // user_id -> draft slot (1-based)
  slot_to_roster_id: Record<string, number> | null // draft slot -> roster_id
  start_time: number | null
}

export interface SleeperPickMetadata {
  first_name?: string
  last_name?: string
  position?: string
  team?: string
}

export interface SleeperPick {
  pick_no: number
  round: number
  draft_slot: number
  player_id: string
  picked_by: string
  roster_id: number | null
  is_keeper: boolean | null
  // Embedded player snapshot; the position/name fallback for players that
  // have since dropped out of players.trim.json (retired, released).
  metadata?: SleeperPickMetadata | null
}

export interface SleeperTradedPick {
  season: string
  round: number
  roster_id: number // roster that originally owned the slot's pick
  previous_owner_id: number
  owner_id: number // roster that owns the pick now
}

export interface TrimmedPlayer {
  player_id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  position: Position
  team: string | null
  search_rank: number | null
  injury_status: string | null
  status: string | null
  age: number | null
}

export type PlayerMap = Record<string, TrimmedPlayer>

// ---------------------------------------------------------------------------
// Board (config/board.json -> config/board.resolved.json)
// ---------------------------------------------------------------------------

export interface BoardPlayerInput {
  name: string
  pos: Position
  team?: string
  tier: number
  rank: number
}

export interface BoardPin {
  name: string
  fromRound: number
  toRound: number
}

export interface BoardRules {
  maxByPos: Record<Position, number>
  minRoundK: number
  minRoundDEF: number
  stashRound: number
  offBoardDiscount: number
  // The round from which positional scarcity (value over next available) takes
  // over from straight board order.
  //
  // Before this round the engine takes the highest-ranked available player on
  // the board, full stop. From it onward it scores on the scarcity rule
  // instead. This exists because the two are in direct competition and the
  // board has to win early: within a tier the ordering term is worth
  // hundredths of a point while positional scarcity is worth several points,
  // so without a gate the board's ordering is arithmetically invisible and the
  // engine will pass over a higher-ranked player for a scarcer position.
  //
  // Omit for the previous behaviour (scarcity from round 1), which is what the
  // synthetic-market replay in replay.ts still uses.
  vonaFromRound?: number
}

export interface BoardInput {
  season: number
  leagueId: string
  draftId: string
  myUserId: string
  players: BoardPlayerInput[]
  doNotDraft: string[]
  pins: BoardPin[]
  rules: BoardRules
}

export interface ResolvedBoardPlayer extends BoardPlayerInput {
  player_id: string
}

export interface ResolvedPin extends BoardPin {
  player_id: string
}

export interface ResolvedBoard {
  season: number
  leagueId: string
  draftId: string
  myUserId: string
  players: ResolvedBoardPlayer[]
  doNotDraftIds: string[]
  pins: ResolvedPin[]
  rules: BoardRules
}

// ---------------------------------------------------------------------------
// Engine domain
// ---------------------------------------------------------------------------

export interface DraftConfig {
  draft: SleeperDraft
  tradedPicks: SleeperTradedPick[]
  myUserId: string
  rosterPositions: string[] // league.roster_positions (includes BN)
}

export interface PlayerRef {
  player_id: string
  name: string
  pos: Position
  team: string | null
}

// A pool entry: an available player with its board-derived value.
export interface PoolPlayer extends PlayerRef {
  value: number
  offBoard: boolean
  tier: number | null
  boardRank: number | null
  searchRank: number
  injuryStatus: string | null
  status: string | null
}

export interface BoardState {
  cfg: DraftConfig
  board: ResolvedBoard
  totalPicks: number
  picksByNo: Record<number, SleeperPick>
  currentPickNo: number // lowest unfilled pick number
  currentRound: number
  myPickNos: number[] // all of my pick numbers, ascending
  myRemainingPickNos: number[] // >= currentPickNo
  myRosterIds: string[] // player_ids I hold
  myPosCounts: Record<Position, number>
  posCountsByRoster: Record<number, Record<Position, number>>
  pool: PoolPlayer[] // available players, sorted by value desc
}

export interface Scored extends PlayerRef {
  value: number
  offBoard: boolean
  score: number
  survivalToNextPct: number | null
  rationale: string[]
}

export interface SimOpts {
  sims: number
  seed: number
  // Gumbel temperature at pick 1 and its linear growth per pick; the reach
  // multiplier comes from live/replay calibration (1 = calibration-neutral).
  baseTemperature: number
  temperatureSlope: number
  reachScale: number
  candidateLimit: number // pool depth fed to the simulator
}

export interface SurvivalEntry {
  player_id: string
  survival: number // P(still available at my next pick), 0..1
}

export interface SurvivalReport {
  gapPicks: number // opponent picks between now and my next pick
  myNextPickNo: number | null // null when I have no later pick
  survivalById: Record<string, number>
  expectedBestValueByPos: Record<Position, number>
}

export interface Recommendation {
  pickNo: number
  round: number
  forced: boolean
  primary: Scored
  fallbacks: Scored[]
  rationale: string[]
}

// ---------------------------------------------------------------------------
// Notifier
// ---------------------------------------------------------------------------

export type DraftMessage =
  | { kind: 'heads_up'; picksAway: number; myPickNo: number; shortlist: Scored[] }
  | { kind: 'on_clock'; pickNo: number; instruction: Scored; fallbacks: Scored[] }
  | {
      kind: 'escalation'
      pickNo: number
      secondsElapsed: number
      instruction: Scored
      fallbacks: Scored[]
    }
  | { kind: 'pick_confirmed'; pickNo: number; player: Scored }
  | { kind: 'pick_mismatch'; pickNo: number; expected: Scored; actual: PlayerRef }
  | { kind: 'draft_paused' }
  | { kind: 'draft_resumed' }
  | { kind: 'draft_complete'; rosterSummary: string }
  | { kind: 'bot_error'; message: string; consecutiveFailures: number }

export interface Notifier {
  send(msg: DraftMessage): Promise<void>
}
