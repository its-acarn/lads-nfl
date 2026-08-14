// Shapes of the committed backtest fixtures.
//
// These live here rather than in the scripts that write them so that the pure
// modules under helpers/draft/backtest/ never have to import from scripts/.
// The scripts produce these shapes; the engine-side code consumes them.

import { Position } from '../types'

// fixtures/backtest2025/adp.sheet.json — the "List" tab of Andrew's 2025
// spreadsheet. MARKET data: what the room will do. Never a statement of
// preference, and never a source of board value.
export interface SheetAdpEntry {
  player_id: string
  name: string
  pos: Position
  team: string | null
  // The sheet's own overall rank column, 1..358, complete.
  rank: number
  // Sleeper's own ADP as captured in the sheet — the same `search_rank` field
  // the live bot consumes. Blank for 45 of the 358 rows, mostly kickers and
  // defenses, where `rank` is the fallback.
  sleeper: number | null
}

// fixtures/backtest2025/adp.jimmyg.json — a second, independent 12-team draft
// from the same pre-season window, kept as an ADP tail-extension.
export interface JimmygPick {
  pick_no: number
  player_id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  team: string | null
}

// fixtures/backtest2025/adp.ffc.json — Fantasy Football Calculator's 2025
// pre-season consensus. A CROSS-CHECK on the prior, never the prior itself.
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

// fixtures/backtest2025/league.2025.json
export interface BacktestLeague {
  league_id: string
  season: string
  roster_positions: string[]
  playoff_week_start: number
  scoring_settings: Record<string, number>
}
