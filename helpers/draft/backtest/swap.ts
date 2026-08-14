// The counterfactual: the real 2025 draft, with the engine substituted at
// Andrew's slot.
//
// SWAP model (the headline). The counterfactual draft is the real draft with a
// set of pairwise transpositions applied, not a re-simulation. Where the engine
// agrees with what Andrew really did, that round is identical to reality. Where
// it differs, the engine takes X instead of Y, and the manager who really took
// X receives Y instead. Every other manager, at every other pick, takes exactly
// the player they really took. So across 168 picks the counterfactual differs
// from reality by nothing more than a handful of X-for-Y exchanges, which makes
// this a controlled experiment rather than a noisy simulation.
//
// The exchange is credited SIMULTANEOUSLY. The naive version has a bias that
// favours the engine: if the engine takes X at pick 2 and X's real owner was
// not due until pick 40, then Y -- the player Andrew really took at pick 2 --
// would sit unclaimed for 38 picks and the engine could come back and draft him
// too, ending up with both. In reality Y was gone at pick 2. So the moment the
// engine takes X, Y is credited to the displaced manager and removed from the
// pool, and that manager's later pick becomes a no-op. The exchange stays
// one-for-one and nobody drafts a player who was genuinely unavailable.
//
// The assumption is convenient, not behavioural: a manager denied X would not
// necessarily reach for Y, they would take whatever their own board said next.
// That is what the CASCADE model does, and it is retained as a sensitivity
// check so the two together bracket the honest answer.
//
// Hindsight boundary: this file uses the future freely -- it must, to know who
// took X later -- but only ever through the harness. Everything the engine sees
// arrives via pipeline.decideAt, which reads earlier picks only. lookahead.test
// .ts is what enforces that.

import { roundOf } from '../snake'
import { Position, Recommendation, SleeperPick } from '../types'
import { Decision, decideAt, DecisionRequest, PipelineInputs } from './pipeline'
import { buildUniverse, Universe } from './universe'

export type OpponentModel = 'swap' | 'cascade'

export interface PlayerLabel {
  player_id: string
  name: string
  pos: Position
}

export type PickOutcome =
  // The engine wanted exactly what Andrew took. Round identical to reality.
  | 'agreed'
  // Engine took X; the manager who really took X receives Y in exchange.
  | 'swapped'
  // Engine took someone no manager ever drafted, so nobody is displaced and
  // Andrew's real pick simply goes undrafted.
  | 'no-partner'
  // Engine took a player Andrew himself really took at a later pick. There is
  // no external manager to compensate.
  | 'self'

export interface CounterfactualPick {
  pickNo: number
  round: number
  engine: PlayerLabel
  real: PlayerLabel
  outcome: PickOutcome
  // Set when outcome is 'swapped'.
  displacedRosterId: number | null
  displacedRealPickNo: number | null
  forced: boolean
  reachScale: number
  rationale: string[]
  globalRationale: string[]
}

export interface Invariants {
  everyRosterHolds14: boolean
  rosterSizes: Record<number, number>
  duplicates: string[]
  // How the counterfactual's drafted set differs from reality's. Under a pure
  // sequence of swaps these are empty; they fill only when the engine takes
  // someone the room never drafted.
  addedVsReality: string[]
  removedVsReality: string[]
}

export interface CounterfactualResult {
  model: OpponentModel
  forcedMode: boolean
  myPicks: CounterfactualPick[]
  syntheticFeed: SleeperPick[]
  engineRoster: PlayerLabel[]
  realRoster: PlayerLabel[]
  invariants: Invariants
  // Opponent picks that could not follow the model and fell back to
  // best-available. Should be empty; reported rather than hidden.
  fallbacks: string[]
}

export interface SwapInputs {
  pipeline: PipelineInputs
  realFeed: SleeperPick[]
  myPickNos: number[]
  myRosterId: number
  model: OpponentModel
  // Injectable so a spec can drive the walk with a known decision -- notably
  // "always take what Andrew really took", which must reproduce the real draft
  // byte for byte. Defaults to the real engine.
  decide?: (inputs: PipelineInputs, req: DecisionRequest) => Decision
}

function label(universe: Universe, playerId: string, fallbackPos: Position): PlayerLabel {
  const p = universe.players[playerId]
  return {
    player_id: playerId,
    name: p ? p.full_name || playerId : playerId,
    pos: p ? p.position : fallbackPos,
  }
}

// Spread rather than rebuild field by field: the fixtures carry keys the
// engine does not model (draft_id, reactions), and dropping them would make
// the synthetic feed a lossy copy of reality. That matters for the invariant
// that an all-agreeing run reproduces the real draft byte for byte.
function clonePick(src: SleeperPick, playerId: string, metadata: SleeperPick['metadata']): SleeperPick {
  return { ...src, player_id: playerId, metadata: metadata }
}

export function runCounterfactual(inputs: SwapInputs): CounterfactualResult {
  const real = inputs.realFeed.slice().sort((a, b) => a.pick_no - b.pick_no)
  const isMine: Record<number, boolean> = {}
  for (let i = 0; i < inputs.myPickNos.length; i++) isMine[inputs.myPickNos[i]] = true

  // Where each player really went, and to whom.
  const realPickNoOf: Record<string, number> = {}
  const realPickAt: Record<number, SleeperPick> = {}
  for (let i = 0; i < real.length; i++) {
    if (realPickNoOf[real[i].player_id] === undefined) realPickNoOf[real[i].player_id] = real[i].pick_no
    realPickAt[real[i].pick_no] = real[i]
  }

  // Each opponent's own real sequence, for the cascade model.
  const queueByRoster: Record<number, SleeperPick[]> = {}
  for (let i = 0; i < real.length; i++) {
    const r = real[i].roster_id
    if (r === null || r === inputs.myRosterId) continue
    if (!queueByRoster[r]) queueByRoster[r] = []
    queueByRoster[r].push(real[i])
  }

  const decide = inputs.decide || decideAt

  const taken: Record<string, boolean> = {}
  const rosterOf: Record<string, number> = {}
  const noOpPicks: Record<number, boolean> = {}
  // playerId -> the pick number at which their credit lands. Until that pick
  // passes they are spoken for but invisible to visibleAt(), so they must be
  // excluded from the pool explicitly.
  const pendingCredit: Record<string, number> = {}
  const synthetic: SleeperPick[] = []
  const myPicks: CounterfactualPick[] = []
  const fallbacks: string[] = []

  for (let i = 0; i < real.length; i++) {
    const actual = real[i]
    const pickNo = actual.pick_no

    // ---- Andrew's pick: the engine decides -------------------------------
    if (isMine[pickNo]) {
      const excludeIds: string[] = []
      const pendingIds = Object.keys(pendingCredit)
      for (let k = 0; k < pendingIds.length; k++) {
        if (pendingCredit[pendingIds[k]] > pickNo) excludeIds.push(pendingIds[k])
      }
      const decision = decide(inputs.pipeline, {
        attributeFeed: real,
        stateFeed: synthetic,
        pickNo,
        excludeIds,
      })
      const rec: Recommendation = decision.recommendation
      const chosenId = rec.primary.player_id
      if (taken[chosenId]) {
        throw new Error(`pick ${pickNo}: engine chose ${rec.primary.name}, who is already drafted`)
      }

      const realId = actual.player_id
      const engineLabel = label(decision.universe, chosenId, rec.primary.pos)
      const realLabel = label(decision.universe, realId, rec.primary.pos)

      taken[chosenId] = true
      rosterOf[chosenId] = inputs.myRosterId
      synthetic.push(clonePick(actual, chosenId, decision.universe.players[chosenId] ? actual.metadata : null))

      let outcome: PickOutcome = 'agreed'
      let displacedRosterId: number | null = null
      let displacedRealPickNo: number | null = null

      if (chosenId !== realId) {
        const wherePicked = realPickNoOf[chosenId]
        const displacedPick = wherePicked === undefined ? null : realPickAt[wherePicked]
        if (displacedPick === null || displacedPick === undefined) {
          // Nobody ever drafted this player, so no manager loses anything and
          // Andrew's real pick simply goes undrafted.
          outcome = 'no-partner'
        } else if (displacedPick.roster_id === null) {
          // No roster owns the pick, so there is no manager to compensate.
          // Treated as if the player was never drafted.
          outcome = 'no-partner'
        } else if (displacedPick.roster_id === inputs.myRosterId) {
          // Andrew's own later pick. There is no external manager to
          // compensate; the engine will simply decide that later pick afresh.
          outcome = 'self'
        } else {
          // The exchange, credited now rather than at the displaced manager's
          // own pick, so Y cannot linger in the pool and be taken twice.
          outcome = 'swapped'
          displacedRosterId = displacedPick.roster_id
          displacedRealPickNo = displacedPick.pick_no
          if (taken[realId]) {
            // Andrew's real pick here was already taken by the engine earlier,
            // so there is nothing to hand over. Their pick still stands and
            // will fall back when it comes round.
            fallbacks.push(
              `pick ${pickNo}: roster ${displacedPick.roster_id} lost ${engineLabel.name} but ${realLabel.name} was already gone`
            )
          } else {
            taken[realId] = true
            rosterOf[realId] = displacedPick.roster_id
            noOpPicks[displacedPick.pick_no] = true
            pendingCredit[realId] = displacedPick.pick_no
            synthetic.push(clonePick(displacedPick, realId, actual.metadata))
          }
        }
      }

      myPicks.push({
        pickNo,
        round: roundOf(inputs.pipeline.draft, pickNo),
        engine: engineLabel,
        real: realLabel,
        outcome,
        displacedRosterId,
        displacedRealPickNo,
        forced: rec.forced,
        reachScale: decision.reachScale,
        rationale: rec.primary.rationale,
        globalRationale: rec.rationale,
      })
      continue
    }

    // ---- an opponent's pick ----------------------------------------------
    if (noOpPicks[pickNo]) continue // already compensated at the moment of the swap

    if (!taken[actual.player_id]) {
      taken[actual.player_id] = true
      if (actual.roster_id !== null) rosterOf[actual.player_id] = actual.roster_id
      synthetic.push(actual)
      continue
    }

    // Their real player is gone. Under the swap model this should not happen;
    // under the cascade model it is the normal case.
    let replacement: SleeperPick | null = null
    if (inputs.model === 'cascade') {
      const queue = actual.roster_id === null ? [] : queueByRoster[actual.roster_id] || []
      while (queue.length > 0) {
        const cand = queue.shift() as SleeperPick
        if (!taken[cand.player_id]) {
          replacement = cand
          break
        }
      }
    }
    if (replacement === null) {
      fallbacks.push(`pick ${pickNo}: roster ${String(actual.roster_id)} had no replacement under the ${inputs.model} model`)
      continue
    }
    taken[replacement.player_id] = true
    if (actual.roster_id !== null) rosterOf[replacement.player_id] = actual.roster_id
    synthetic.push(clonePick(actual, replacement.player_id, replacement.metadata))
  }

  // ---- invariants ---------------------------------------------------------
  const rosterSizes: Record<number, number> = {}
  const seen: Record<string, number> = {}
  for (let i = 0; i < synthetic.length; i++) {
    const p = synthetic[i]
    if (p.roster_id !== null) rosterSizes[p.roster_id] = (rosterSizes[p.roster_id] || 0) + 1
    seen[p.player_id] = (seen[p.player_id] || 0) + 1
  }
  const duplicates: string[] = []
  const seenIds = Object.keys(seen)
  for (let i = 0; i < seenIds.length; i++) {
    if (seen[seenIds[i]] > 1) duplicates.push(seenIds[i])
  }

  const realSet: Record<string, boolean> = {}
  for (let i = 0; i < real.length; i++) realSet[real[i].player_id] = true
  const addedVsReality: string[] = []
  const removedVsReality: string[] = []
  for (let i = 0; i < seenIds.length; i++) {
    if (!realSet[seenIds[i]]) addedVsReality.push(seenIds[i])
  }
  const realIds = Object.keys(realSet)
  for (let i = 0; i < realIds.length; i++) {
    if (!seen[realIds[i]]) removedVsReality.push(realIds[i])
  }

  const sizes = Object.keys(rosterSizes)
  let everyRosterHolds14 = sizes.length > 0
  for (let i = 0; i < sizes.length; i++) {
    if (rosterSizes[Number(sizes[i])] !== 14) everyRosterHolds14 = false
  }

  // ---- rosters ------------------------------------------------------------
  const finalUniverse = buildUniverse({
    adp: inputs.pipeline.adp,
    ladsPicks: real,
    jimmygPicks: inputs.pipeline.jimmygPicks,
  })
  const engineRoster: PlayerLabel[] = []
  for (let i = 0; i < synthetic.length; i++) {
    if (synthetic[i].roster_id === inputs.myRosterId) {
      engineRoster.push(label(finalUniverse, synthetic[i].player_id, 'RB'))
    }
  }
  const realRoster: PlayerLabel[] = []
  for (let i = 0; i < real.length; i++) {
    if (real[i].roster_id === inputs.myRosterId) {
      realRoster.push(label(finalUniverse, real[i].player_id, 'RB'))
    }
  }

  return {
    model: inputs.model,
    forcedMode: inputs.pipeline.forcedMode,
    myPicks,
    syntheticFeed: synthetic.slice().sort((a, b) => a.pick_no - b.pick_no),
    engineRoster,
    realRoster,
    invariants: {
      everyRosterHolds14,
      rosterSizes,
      duplicates,
      addedVsReality,
      removedVsReality,
    },
    fallbacks,
  }
}
