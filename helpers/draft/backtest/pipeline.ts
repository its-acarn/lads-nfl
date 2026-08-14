// One decision, end to end: a pick feed and a pick number in, a recommendation
// out, with every intermediate artifact rebuilt from those inputs.
//
// Rebuilding rather than caching is deliberate and load-bearing. The lookahead
// proof works by permuting the players who occupy every pick from the decision
// point onward and requiring the recommendation to come out identical. That
// only tests anything if the permuted feed actually flows through the whole
// pipeline -- universe, ADP prior, state, simulation. A cached universe would
// make the test tautological.
//
// What the feed is read for, and what it is not:
//
//   ATTRIBUTES  yes. Draft-day position, team and injury designation, frozen
//               in each pick's metadata before the draft began.
//   MEMBERSHIP  no. The pool comes from Andrew's pre-draft spreadsheet. A pool
//               built from who got drafted would tell the engine which names
//               the room is going to take.
//   ORDER       no. ADP comes from the spreadsheet's capture of Sleeper's
//               search_rank, never from realized pick order.
//   STATE       only through visibleAt(), i.e. strictly earlier picks.

import { recommend } from '../recommend'
import { buildState } from '../state'
import { computeReachScale } from '../survival'
import {
  Recommendation,
  ResolvedBoard,
  SleeperDraft,
  SleeperPick,
  SleeperTradedPick,
} from '../types'
import { draftConfig, REACH_REFERENCE, rulesFor, simOptsFor } from './config'
import { JimmygPick, SheetAdpEntry } from './types'
import { buildUniverse, Universe } from './universe'
import { visibleAt } from './visibility'

export interface PipelineInputs {
  adp: SheetAdpEntry[]
  jimmygPicks: JimmygPick[]
  board: ResolvedBoard
  draft: SleeperDraft
  tradedPicks: SleeperTradedPick[]
  rosterPositions: string[]
  // false: K and DEF become bench slots, so the engine never drafts one.
  // true: the real lineup, with both draftable. See config.ts.
  forcedMode: boolean
  sims?: number
}

export interface Decision {
  pickNo: number
  recommendation: Recommendation
  // Calibrated from the visible picks only, exactly as the live loop does.
  reachScale: number
  universe: Universe
}

export interface DecisionRequest {
  // Where draft-day attributes come from. Always the REAL feed, including in a
  // counterfactual: a pick's metadata describes the player as he stood before
  // the draft began, and a drafter obviously knows every player's position and
  // team in advance. Membership and order are never taken from it.
  attributeFeed: SleeperPick[]
  // The feed whose earlier picks define the board state. In a counterfactual
  // this is the synthetic draft built so far, which diverges from reality.
  stateFeed: SleeperPick[]
  pickNo: number
  // Players already spoken for whose pick has not yet landed.
  //
  // The swap credits a displaced manager the instant the engine takes their
  // player, but that credit is recorded at the manager's own later pick number,
  // so visibleAt() would not hide him in the meantime. Without this the engine
  // could draft the same player its swap already gave away, ending up with both
  // -- the exact double-draft the simultaneous credit exists to prevent.
  //
  // This is not future knowledge. In the counterfactual those players ARE
  // already on someone's roster; this makes the pool tell the truth.
  excludeIds?: string[]
}

export function decideAt(inputs: PipelineInputs, req: DecisionRequest): Decision {
  const pickNo = req.pickNo
  const universe = buildUniverse({
    adp: inputs.adp,
    ladsPicks: req.attributeFeed,
    jimmygPicks: inputs.jimmygPicks,
  })

  if (req.excludeIds && req.excludeIds.length > 0) {
    for (let i = 0; i < req.excludeIds.length; i++) delete universe.players[req.excludeIds[i]]
  }

  const visible = visibleAt(req.stateFeed, pickNo)
  const cfg = draftConfig(inputs.draft, inputs.tradedPicks, inputs.rosterPositions, inputs.board.rules, inputs.forcedMode)
  const board: ResolvedBoard = {
    season: inputs.board.season,
    leagueId: inputs.board.leagueId,
    draftId: inputs.board.draftId,
    myUserId: inputs.board.myUserId,
    players: inputs.board.players,
    doNotDraftIds: inputs.board.doNotDraftIds,
    pins: inputs.board.pins,
    rules: rulesFor(inputs.board.rules, inputs.forcedMode),
  }

  const state = buildState(cfg, visible, board, universe.players)
  if (state.myRemainingPickNos.length === 0 || state.myRemainingPickNos[0] !== pickNo) {
    throw new Error(
      `decideAt: asked to decide pick ${pickNo} but the state's next pick is ` +
        `${state.myRemainingPickNos.length > 0 ? state.myRemainingPickNos[0] : 'none'} — ` +
        `the feed does not put that pick on the clock`
    )
  }

  const reachScale = computeReachScale(visible, universe.players, REACH_REFERENCE)
  const opts = simOptsFor(inputs.sims)
  opts.reachScale = reachScale

  const recommendation: Recommendation = recommend(state, opts)
  return { pickNo, recommendation, reachScale, universe }
}
