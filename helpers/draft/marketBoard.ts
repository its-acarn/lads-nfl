// Synthetic "market board" for replaying a completed draft. A 2026 board
// can't rank a historical pool, so the fixture defines its own market:
//   - overall rank = actual pick order
//   - tier = draft round (a tier cut at every round boundary keeps the value
//     curve monotone in market order; a per-position tier index would hand
//     tier-1 value to a round-13 kicker, so it is deliberately not used —
//     recorded in the plan's decision log)
//   - the replay player map contains exactly the players that were drafted,
//     with search_rank = pick_no as the ADP proxy
// This validates mechanics, needs, and survival calibration — not the
// quality of anyone's real tiers.

import { positionOfPick, nameOfPick } from './state'
import {
  BoardRules,
  DraftConfig,
  PlayerMap,
  Position,
  ResolvedBoard,
  ResolvedBoardPlayer,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
  TrimmedPlayer,
} from './types'

export interface MarketFixture {
  board: ResolvedBoard
  players: PlayerMap
}

export function marketRules(draft: SleeperDraft): BoardRules {
  const rounds = draft.settings.rounds
  return {
    maxByPos: { QB: 3, RB: 8, WR: 8, TE: 3, K: 1, DEF: 1 },
    minRoundK: Math.max(1, rounds - 1),
    minRoundDEF: Math.max(1, rounds - 2),
    stashRound: Math.max(1, rounds - 2),
    offBoardDiscount: 0.8,
  }
}

export function buildMarketFixture(
  draft: SleeperDraft,
  picks: SleeperPick[],
  realPlayers: PlayerMap,
  myUserId: string
): MarketFixture {
  const teams = draft.settings.teams
  const sorted = picks.slice().sort((a, b) => a.pick_no - b.pick_no)

  const players: PlayerMap = {}
  const boardPlayers: ResolvedBoardPlayer[] = []
  for (let i = 0; i < sorted.length; i++) {
    const pick = sorted[i]
    const pos: Position = positionOfPick(pick, realPlayers)
    const name = nameOfPick(pick, realPlayers)
    const real = realPlayers[pick.player_id]
    const trimmed: TrimmedPlayer = {
      player_id: pick.player_id,
      full_name: name,
      first_name: real ? real.first_name : null,
      last_name: real ? real.last_name : null,
      position: pos,
      team: real ? real.team : (pick.metadata && pick.metadata.team) || null,
      search_rank: pick.pick_no, // market ADP proxy: where the room took them
      injury_status: null, // historical designations are gone; stash rule is
      status: null, //          exercised by live/unit tests instead
      age: real ? real.age : null,
    }
    players[pick.player_id] = trimmed
    boardPlayers.push({
      name,
      pos,
      tier: Math.floor((pick.pick_no - 1) / teams) + 1,
      rank: pick.pick_no,
      player_id: pick.player_id,
    })
  }

  const board: ResolvedBoard = {
    season: parseInt(draft.season, 10) || 0,
    leagueId: draft.league_id || '',
    draftId: draft.draft_id,
    myUserId,
    players: boardPlayers,
    doNotDraftIds: [],
    pins: [],
    rules: marketRules(draft),
  }
  return { board, players }
}

export function userForSlot(draft: SleeperDraft, slot: number): string {
  if (!draft.draft_order) throw new Error('draft.draft_order missing')
  const users = Object.keys(draft.draft_order)
  for (let i = 0; i < users.length; i++) {
    if (draft.draft_order[users[i]] === slot) return users[i]
  }
  throw new Error(`no user drafted from slot ${slot}`)
}

export function marketConfig(
  draft: SleeperDraft,
  league: SleeperLeague,
  tradedPicks: SleeperTradedPick[],
  myUserId: string
): DraftConfig {
  return { draft, tradedPicks, myUserId, rosterPositions: league.roster_positions }
}
