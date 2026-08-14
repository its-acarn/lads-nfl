// The decision rule behind every instruction:
//   score(p) = (V(p) − E[best V at pos(p) at my next pick]) × need(pos(p))
// over the guardrail-filtered candidate set, with pins and forced mode on
// top. Position-best candidates always have edge ≥ 0 (the pool only
// shrinks), so cross-position comparison is anchored by non-negative edges.

import { computeNeeds, forcedPositions, isForcedMode, parseLineup } from './needs'
import { roundOf } from './snake'
import { survival } from './survival'
import { BoardState, PoolPlayer, Position, Recommendation, Scored, SimOpts } from './types'

// Injury designations that keep a player out of the candidate set before
// board.rules.stashRound.
const STASH_INJURY = ['Out', 'IR', 'PUP', 'Sus', 'COV', 'DNR', 'NA']
const STASH_STATUS = [
  'Injured Reserve',
  'Physically Unable to Perform',
  'Non Football Injury',
  'Suspended',
  'Inactive',
]

function isStashOnly(p: PoolPlayer): boolean {
  if (p.injuryStatus && STASH_INJURY.indexOf(p.injuryStatus) !== -1) return true
  if (p.status && STASH_STATUS.indexOf(p.status) !== -1) return true
  return false
}

function toScored(p: PoolPlayer, score: number, survivalPct: number | null, rationale: string[]): Scored {
  return {
    player_id: p.player_id,
    name: p.name,
    pos: p.pos,
    team: p.team,
    value: Math.round(p.value * 10) / 10,
    offBoard: p.offBoard,
    score: Math.round(score * 100) / 100,
    survivalToNextPct: survivalPct === null ? null : Math.round(survivalPct * 100),
    rationale,
  }
}

export function recommend(state: BoardState, opts: SimOpts): Recommendation {
  if (state.myRemainingPickNos.length === 0) {
    throw new Error('recommend: no remaining picks for my roster')
  }
  const pickNo = state.myRemainingPickNos[0]
  const round = roundOf(state.cfg.draft, pickNo)
  const rules = state.board.rules

  const shape = parseLineup(state.cfg.rosterPositions)
  const needs = computeNeeds(state.myPosCounts, shape, rules)
  let forced = isForcedMode(state.myRemainingPickNos.length, needs)
  let forcedSet: Position[] = forced ? forcedPositions(needs) : []

  const globalRationale: string[] = []
  if (forced) {
    globalRationale.push(
      `forced mode: ${state.myRemainingPickNos.length} pick(s) left for ${needs.unfilledMandatoryCount} unfilled starter slot(s) (${forcedSet.join(', ')})`
    )
  }

  // Schedule-forced: my raw pick count may cover the unfilled starters, but
  // only the picks that land BEFORE a position's supply runs out actually
  // count for it. Supply horizon per position ~ the worst ADP among its
  // remaining players (in a market replay that IS the pick number where the
  // last one goes; live it is the usual rooms-draft-near-ADP approximation).
  // When the union of still-viable picks is no bigger than the number of
  // unfilled starter slots, collapse now instead of at the last pick.
  if (!forced && needs.unfilledMandatoryCount > 0) {
    const unfilled = forcedPositions(needs)
    const viableUnion: Record<number, boolean> = {}
    for (let u = 0; u < unfilled.length; u++) {
      let horizon = 0
      for (let i = 0; i < state.pool.length; i++) {
        const p = state.pool[i]
        if (p.pos === unfilled[u] && p.searchRank > horizon && p.searchRank < 1000000) {
          horizon = p.searchRank
        }
      }
      for (let n = 0; n < state.myRemainingPickNos.length; n++) {
        if (state.myRemainingPickNos[n] <= horizon) viableUnion[state.myRemainingPickNos[n]] = true
      }
    }
    if (Object.keys(viableUnion).length <= needs.unfilledMandatoryCount) {
      forced = true
      forcedSet = unfilled
      globalRationale.push(
        `forced by scarcity schedule: only ${Object.keys(viableUnion).length} viable pick(s) left for ${needs.unfilledMandatoryCount} unfilled starter slot(s) (${forcedSet.join(', ')})`
      )
    }
  }

  // ---- survival first: guardrails consult it for scarcity overrides -------
  const report = survival(state, opts)

  // Scarcity override: an unfilled mandatory position whose entire remaining
  // pool fits inside the sim (<= 5 players) and is predicted extinct by my
  // next pick may ignore its round floor. A real player universe never gets
  // this thin; a market-pool replay (only drafted players exist) does, and a
  // competent drafter grabs the last one when the run starts.
  const poolCountByPos: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (let i = 0; i < state.pool.length; i++) poolCountByPos[state.pool[i].pos]++
  const isUrgent = (pos: Position): boolean =>
    needs.unfilledMandatory[pos] > 0 &&
    report.myNextPickNo !== null &&
    report.expectedBestValueByPos[pos] < 1e-9 &&
    poolCountByPos[pos] > 0 &&
    poolCountByPos[pos] <= 5

  // Round floors, and the override that lets one yield. Applies to any
  // position carrying a floor, not just kickers and defenses.
  const minRoundByPos = rules.minRoundByPos || {}
  const urgent: Record<string, boolean> = {}
  const flooredPositions = Object.keys(minRoundByPos) as Position[]
  for (let i = 0; i < flooredPositions.length; i++) {
    const pos = flooredPositions[i]
    urgent[pos] = isUrgent(pos)
    if (urgent[pos]) {
      globalRationale.push(`scarcity override: last ${pos}(s) on the market, round floor waived`)
    }
  }

  // ---- guardrails ---------------------------------------------------------
  const eligible: PoolPlayer[] = []
  for (let i = 0; i < state.pool.length; i++) {
    const p = state.pool[i]
    if (state.board.doNotDraftIds.indexOf(p.player_id) !== -1) continue
    if ((state.myPosCounts[p.pos] || 0) >= rules.maxByPos[p.pos]) continue
    if (forced) {
      if (forcedSet.indexOf(p.pos) === -1) continue
    } else {
      const floor = minRoundByPos[p.pos]
      if (floor !== undefined && round < floor && !urgent[p.pos]) continue
    }
    if (round < rules.stashRound && isStashOnly(p)) continue
    eligible.push(p)
  }

  let candidates = eligible
  let relaxed = false
  if (candidates.length === 0) {
    // Never come back empty mid-draft: relax everything except do-not-draft.
    relaxed = true
    for (let i = 0; i < state.pool.length && candidates.length < 10; i++) {
      const p = state.pool[i]
      if (state.board.doNotDraftIds.indexOf(p.player_id) !== -1) continue
      candidates.push(p)
    }
    globalRationale.push('guardrails relaxed: no legal candidates under current rules')
  }
  candidates = candidates.slice(0, opts.candidateLimit)

  // ---- scoring ------------------------------------------------------------
  // Two regimes. Early on the board wins outright: take the highest-ranked
  // player still available and let scarcity wait. From `vonaFromRound` the
  // scarcity rule takes over.
  //
  // The gate exists because the two cannot simply be blended. Within a tier the
  // ordering term is worth hundredths of a point while a positional-scarcity
  // edge is worth several, so any weighting that lets the board's order compete
  // late would have to be large enough to invert the tier plateaus themselves —
  // a mid-tier-1 player would price below a top-tier-2 one and the board would
  // stop being a board.
  const vonaFrom = rules.vonaFromRound === undefined ? 1 : rules.vonaFromRound
  const boardOrderPhase = round < vonaFrom
  if (boardOrderPhase) {
    globalRationale.push(
      `board order (round ${round} < ${vonaFrom}): taking the highest-ranked player available, scarcity ignored`
    )
  }

  const scored: { p: PoolPlayer; score: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]
    const expectedBest = report.myNextPickNo === null ? 0 : report.expectedBestValueByPos[p.pos]
    const edge = p.value - expectedBest
    const need = Math.max(needs.weights[p.pos], relaxed ? 0.05 : 0)
    // Position caps are enforced by the guardrail filter above, and a need
    // weight only reaches zero when a position is capped, so straight board
    // value cannot pick an ineligible player here.
    scored.push({ p, score: boardOrderPhase ? p.value : edge * need })
  }
  scored.sort(
    (a, b) => b.score - a.score || b.p.value - a.p.value || (a.p.player_id < b.p.player_id ? -1 : 1)
  )

  // ---- pins override in their round window --------------------------------
  let pinned: PoolPlayer | null = null
  for (let i = 0; i < state.board.pins.length; i++) {
    const pin = state.board.pins[i]
    if (round < pin.fromRound || round > pin.toRound) continue
    for (let j = 0; j < state.pool.length; j++) {
      const p = state.pool[j]
      if (p.player_id !== pin.player_id) continue
      if ((state.myPosCounts[p.pos] || 0) >= rules.maxByPos[p.pos]) break // capped: pin unusable
      if (pinned === null || p.value > pinned.value) pinned = p
      break
    }
  }

  const rationaleFor = (p: PoolPlayer, score: number): string[] => {
    const r: string[] = []
    // In the board-order phase the ranking IS the reason, so lead with it. The
    // scarcity figures below are still printed as context, but they did not
    // decide this pick and the rationale should not imply they did.
    if (boardOrderPhase && p.boardRank !== null) r.push(`your board rank ${p.boardRank}`)
    if (p.tier !== null) {
      let leftInTier = 0
      for (let i = 0; i < state.pool.length; i++) {
        if (state.pool[i].pos === p.pos && state.pool[i].tier === p.tier) leftInTier++
      }
      r.push(`${leftInTier} left in ${p.pos} T${p.tier}`)
    } else {
      r.push('off-board (ADP interpolation)')
    }
    const surv = report.survivalById[p.player_id]
    if (report.myNextPickNo !== null && surv !== undefined) {
      r.push(`${Math.round(surv * 100)}% survives to pick ${report.myNextPickNo}`)
    }
    const expectedBest = report.myNextPickNo === null ? 0 : report.expectedBestValueByPos[p.pos]
    if (report.myNextPickNo !== null) {
      r.push(`edge vs next pick ${(p.value - expectedBest) >= 0 ? '+' : ''}${(p.value - expectedBest).toFixed(1)}`)
    }
    if (needs.unfilledMandatory[p.pos] > 0) r.push(`fills ${p.pos} starter slot`)
    else if (needs.weights[p.pos] === 0.75) r.push('fills flex')
    else r.push(`bench depth (need ${needs.weights[p.pos].toFixed(2)})`)
    if (score !== undefined) r.push(boardOrderPhase ? `board value ${score.toFixed(2)}` : `score ${score.toFixed(2)}`)
    return r
  }

  const survFor = (p: PoolPlayer): number | null => {
    const s = report.survivalById[p.player_id]
    return report.myNextPickNo === null ? null : s !== undefined ? s : null
  }

  let primary: Scored
  let rest: { p: PoolPlayer; score: number }[]
  if (pinned !== null) {
    const pinScore = scored.filter((s) => s.p.player_id === pinned!.player_id)
    const score = pinScore.length > 0 ? pinScore[0].score : 0
    const r = rationaleFor(pinned, score)
    r.unshift(`pinned for rounds (board pin)`)
    primary = toScored(pinned, score, survFor(pinned), r)
    rest = scored.filter((s) => s.p.player_id !== pinned!.player_id)
  } else {
    if (scored.length === 0) throw new Error('recommend: empty candidate set even after relaxing guardrails')
    primary = toScored(scored[0].p, scored[0].score, survFor(scored[0].p), rationaleFor(scored[0].p, scored[0].score))
    rest = scored.slice(1)
  }

  // Fallbacks: next two by score; when the top three are effectively tied and
  // share a position, swap the second fallback for the best other-position
  // candidate so the relay always has a cross-position out.
  const fallbacks: Scored[] = []
  for (let i = 0; i < rest.length && fallbacks.length < 2; i++) {
    fallbacks.push(toScored(rest[i].p, rest[i].score, survFor(rest[i].p), rationaleFor(rest[i].p, rest[i].score)))
  }
  if (fallbacks.length === 2) {
    const samePos = primary.pos === fallbacks[0].pos && primary.pos === fallbacks[1].pos
    const spread = Math.abs(primary.score - fallbacks[1].score)
    const tied = spread <= 0.05 * Math.max(Math.abs(primary.score), 1)
    if (samePos && tied) {
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].p.pos !== primary.pos) {
          fallbacks[1] = toScored(rest[i].p, rest[i].score, survFor(rest[i].p), rationaleFor(rest[i].p, rest[i].score))
          fallbacks[1].rationale.push('position diversity (top three tied)')
          break
        }
      }
    }
  }

  return {
    pickNo,
    round,
    forced,
    primary,
    fallbacks,
    rationale: globalRationale,
  }
}
