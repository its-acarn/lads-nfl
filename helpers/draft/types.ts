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

// How much a position matters to the roster at each stage of filling it.
// Omitted fields keep the engine's defaults, which are what every replay and
// golden snapshot in the repo was recorded against.
export interface NeedWeightRules {
  // An unfilled dedicated starter slot. Lowering this makes the engine less
  // eager to plug a hole and more willing to take the better player.
  starter?: number
  // Eligible for a still-open flex slot.
  flex?: number
  // Pure bench depth, indexed by how many spare players at that position are
  // already held. Beyond the end of the list, benchFloor applies.
  benchDecay?: number[]
  benchFloor?: number
}

// Overrides for the board value curve. Omitted fields keep the defaults in
// value.ts (tierBase 100, tierDecay 0.85, rankEpsilon 0.01).
export interface ValueRules {
  // Value of a tier-1 player. Pure scale; on its own it changes nothing.
  tierBase?: number
  // Multiplier per tier step, and the single biggest lever on how much the
  // tiers matter. Lower makes them dominant, higher flattens the board toward
  // one long list.
  tierDecay?: number
  // Subtracted per overall-rank step, so it is the weight of ordering WITHIN a
  // tier. Raising it far enough to outweigh positional scarcity would invert
  // the tier plateaus; use vonaFromRound for that instead.
  rankEpsilon?: number
}

export interface BoardRules {
  maxByPos: Record<Position, number>
  // Earliest round each position may be drafted, by position. Absent means no
  // floor. Generalised from the original minRoundK/minRoundDEF pair so that
  // any position can carry one -- quarterbacks in particular, which had no way
  // to express "not before round 11" short of re-tiering the board.
  //
  // A floor yields to the scarcity override: if the position is an unfilled
  // starter slot, its entire remaining pool is five players or fewer, and the
  // simulation expects it extinct by the next pick, the engine takes one
  // anyway rather than finish with the slot empty.
  minRoundByPos?: Partial<Record<Position, number>>
  stashRound: number
  offBoardDiscount: number
  needWeights?: NeedWeightRules
  value?: ValueRules

  // Weight each candidate by what the roster still needs — a starter-shaped
  // hole scoring higher than pure bench depth. Set false to judge a pick on
  // board value and scarcity alone, with position mattering only through
  // maxByPos and minRoundByPos. Defaults to true.
  useRosterNeed?: boolean

  // Collapse the candidate set to unfilled starter slots once the remaining
  // picks only just cover them, so the drafter cannot finish with an illegal
  // lineup. Set false to let the board and scarcity decide right to the end —
  // which means accepting that a required slot may go unfilled and be covered
  // off waivers instead. Defaults to true.
  useForcedStarters?: boolean
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
  // Explicit confirmation that this board is the real one and may drive a
  // live draft. Absent or false, `npm run bot` refuses to start. Exists
  // because the id placeholders are filled in long before the player list is,
  // so "the ids look real" is not evidence the board is ready.
  draftReady?: boolean
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
  draftReady?: boolean
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
  // Emitted once at LOAD, before the draft starts, so a wrong slot or user id
  // is caught while it still costs nothing.
  | { kind: 'loaded'; slot: number; pickNos: number[]; rounds: number; teams: number }
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
