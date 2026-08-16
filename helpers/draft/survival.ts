// Monte Carlo opponent model. Each sim removes `gap` players from the
// candidate pool by Gumbel-perturbed ADP order (Gumbel-top-k == sampling
// without replacement from the softmax over -searchRank/T). Outputs
// per-player survival to my next pick and per-position expected best value.

import { gumbel, mulberry32 } from './rng'
import { parseLineup } from './needs'
import { pickOwners } from './snake'
import { BoardState, PlayerMap, PoolPlayer, Position, SimOpts, SurvivalReport } from './types'

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const PER_POSITION_FLOOR = 5 // always simulate at least this many per position

// How hard a filled starting requirement suppresses an opponent's appetite for
// another player at that position. 0 reproduces the old position-blind model;
// 1 would make a saturated market refuse the position outright.
//
// Deliberately uneven, and the ordering is Andrew's (D9). QB and TE matter
// most because the lineup starts one of each, so a team holding one is
// effectively out of the market. WR and RB matter least because two start plus
// two flex slots, and managers keep drafting them long past nominal need. K
// and DEF follow the QB/TE treatment for the same reason as QB. A uniform
// weight would understate the QB effect and overstate the RB one.
export const DEFAULT_SATURATION: Record<Position, number> = {
  QB: 0.85,
  TE: 0.85,
  K: 0.85,
  DEF: 0.85,
  WR: 0.25,
  RB: 0.25,
}

// Never zero out a position entirely: some manager always takes a second
// quarterback, and a weight of exactly zero would make the model claim
// certainty it has not earned.
const MIN_APPETITE = 0.05

// Temperature defaults chosen in the Phase 2 calibration run: replay shows
// rooms pick close to market order, so the base noise is modest and live
// reach calibration (reachScale) widens it when the room is chaotic.
export const DEFAULT_SIM_OPTS: SimOpts = {
  sims: 2000,
  seed: 20260813,
  baseTemperature: 3,
  temperatureSlope: 0.02,
  reachScale: 1,
  candidateLimit: 60,
  saturationByPos: DEFAULT_SATURATION,
}

// What fraction of the picks between now and my next one belong to rosters
// that have already filled their starting requirement at each position.
//
// Pick-weighted rather than roster-weighted: a team with two picks in the gap
// gets two chances to act on its need, and counting it once would understate
// that. Rosters with no pick in the gap are excluded entirely -- they cannot
// take anyone before I pick again, so what they hold is irrelevant here.
export function positionSaturation(state: BoardState, upToPickNo: number | null): Record<Position, number> {
  const out: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  if (upToPickNo === null) return out

  const from = state.myRemainingPickNos[0]
  let shape
  try {
    shape = parseLineup(state.cfg.rosterPositions)
  } catch (e) {
    // A lineup this engine cannot parse is not a reason to abandon the
    // simulation; it just means no saturation signal.
    return out
  }

  let owners: Record<number, number>
  try {
    owners = pickOwners(state.cfg.draft, state.cfg.tradedPicks)
  } catch (e) {
    return out
  }

  const counted: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  let gapPicks = 0
  for (let n = from + 1; n < upToPickNo; n++) {
    const rosterId = owners[n]
    if (rosterId === undefined) continue
    gapPicks++
    const held = state.posCountsByRoster[rosterId]
    for (let p = 0; p < POSITIONS.length; p++) {
      const pos = POSITIONS[p]
      const need = shape.dedicated[pos]
      if (need > 0 && held && held[pos] >= need) counted[pos]++
    }
  }
  if (gapPicks === 0) return out
  for (let p = 0; p < POSITIONS.length; p++) {
    out[POSITIONS[p]] = counted[POSITIONS[p]] / gapPicks
  }
  return out
}

export function simCandidates(pool: PoolPlayer[], limit: number): PoolPlayer[] {
  const chosen: PoolPlayer[] = pool.slice(0, limit)
  const seen: Record<string, boolean> = {}
  for (let i = 0; i < chosen.length; i++) seen[chosen[i].player_id] = true
  // Guarantee coverage so expectedBestValueByPos is defined everywhere.
  for (let p = 0; p < POSITIONS.length; p++) {
    let have = 0
    for (let i = 0; i < chosen.length; i++) {
      if (chosen[i].pos === POSITIONS[p]) have++
    }
    for (let i = 0; i < pool.length && have < PER_POSITION_FLOOR; i++) {
      const cand = pool[i]
      if (cand.pos === POSITIONS[p] && !seen[cand.player_id]) {
        chosen.push(cand)
        seen[cand.player_id] = true
        have++
      }
    }
  }
  return chosen
}

export function survival(state: BoardState, opts: SimOpts): SurvivalReport {
  const remaining = state.myRemainingPickNos
  if (remaining.length === 0) {
    throw new Error('survival: no remaining picks for my roster')
  }
  const decisionPick = remaining[0]
  const myNextPickNo = remaining.length > 1 ? remaining[1] : null
  const gapPicks = myNextPickNo === null ? 0 : myNextPickNo - decisionPick - 1

  const candidates = simCandidates(state.pool, opts.candidateLimit)
  const n = candidates.length

  const survivalById: Record<string, number> = {}
  const expectedBestValueByPos: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }

  if (gapPicks <= 0 || n === 0) {
    // Back-to-back picks (or my last pick): everything survives; the best now
    // is the best then.
    for (let i = 0; i < n; i++) survivalById[candidates[i].player_id] = 1
    for (let p = 0; p < POSITIONS.length; p++) {
      let best = 0
      for (let i = 0; i < n; i++) {
        if (candidates[i].pos === POSITIONS[p] && candidates[i].value > best) best = candidates[i].value
      }
      expectedBestValueByPos[POSITIONS[p]] = myNextPickNo === null ? 0 : best
    }
    return { gapPicks: Math.max(0, gapPicks), myNextPickNo, survivalById, expectedBestValueByPos }
  }

  // Temperature at the midpoint of the gap, scaled by live reach calibration.
  const midPick = decisionPick + gapPicks / 2
  const temperature = Math.max(
    0.5,
    (opts.baseTemperature + opts.temperatureSlope * midPick) * opts.reachScale
  )

  // Opponent rosters, folded in as a per-position appetite multiplier.
  //
  // Without this the model builds every opponent's utility from ADP alone, so
  // it simulates twelve identical drafters who want the same players in the
  // same order no matter what is already on their rosters. In the rehearsal
  // that produced a quarterback run the room could not deliver: Bo Nix was
  // called at 0% survival twice and survived both times, because ten of twelve
  // teams already had a starter and simply would not take another.
  //
  // Gumbel-top-k is sampling from the softmax over these utilities, so a
  // multiplicative weight on the sampling probability is an ADDITIVE log term
  // here. That keeps the whole adjustment inside the existing sampler.
  const saturation = positionSaturation(state, myNextPickNo)
  const strength = opts.saturationByPos || DEFAULT_SATURATION
  const logAppetite: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (let p = 0; p < POSITIONS.length; p++) {
    const pos = POSITIONS[p]
    const s = strength[pos] === undefined ? 0 : strength[pos]
    logAppetite[pos] = Math.log(Math.max(MIN_APPETITE, 1 - s * saturation[pos]))
  }

  const rng = mulberry32(opts.seed)
  const utilities: number[] = []
  for (let i = 0; i < n; i++) {
    utilities.push(-candidates[i].searchRank / temperature + logAppetite[candidates[i].pos])
  }

  const survivedCount: number[] = []
  for (let i = 0; i < n; i++) survivedCount.push(0)
  const bestSum: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }

  const keys: { key: number; idx: number }[] = []
  for (let i = 0; i < n; i++) keys.push({ key: 0, idx: i })
  const removed: boolean[] = []
  for (let i = 0; i < n; i++) removed.push(false)
  const take = Math.min(gapPicks, n)

  for (let s = 0; s < opts.sims; s++) {
    for (let i = 0; i < n; i++) {
      keys[i].key = utilities[keys[i].idx] + gumbel(rng)
    }
    keys.sort((a, b) => b.key - a.key)
    for (let i = 0; i < n; i++) removed[keys[i].idx] = i < take
    for (let i = 0; i < n; i++) {
      if (!removed[i]) survivedCount[i]++
    }
    for (let p = 0; p < POSITIONS.length; p++) {
      let best = 0
      for (let i = 0; i < n; i++) {
        if (!removed[i] && candidates[i].pos === POSITIONS[p] && candidates[i].value > best) {
          best = candidates[i].value
        }
      }
      bestSum[POSITIONS[p]] += best
    }
  }

  for (let i = 0; i < n; i++) {
    survivalById[candidates[i].player_id] = survivedCount[i] / opts.sims
  }
  for (let p = 0; p < POSITIONS.length; p++) {
    expectedBestValueByPos[POSITIONS[p]] = bestSum[POSITIONS[p]] / opts.sims
  }

  return { gapPicks, myNextPickNo, survivalById, expectedBestValueByPos }
}

// Live reach calibration: mean displacement of actual picks from ADP order
// over the then-available pool, normalised by a reference displacement and
// clamped. Computed identically in replay and live (the players map passed in
// defines the ADP proxy).
export function computeReachScale(
  picks: { player_id: string }[],
  players: PlayerMap,
  referenceMeanDisplacement: number
): number {
  if (picks.length < 8) return 1
  const allIds = Object.keys(players)
  const srById: Record<string, number> = {}
  for (let i = 0; i < allIds.length; i++) {
    const sr = players[allIds[i]].search_rank
    srById[allIds[i]] = typeof sr === 'number' ? sr : Number.MAX_SAFE_INTEGER
  }
  const taken: Record<string, boolean> = {}
  let total = 0
  let counted = 0
  for (let k = 0; k < picks.length; k++) {
    const id = picks[k].player_id
    const sr = srById[id]
    if (sr !== undefined && sr !== Number.MAX_SAFE_INTEGER) {
      // Displacement: available players with strictly better ADP at pick time.
      let better = 0
      for (let i = 0; i < allIds.length; i++) {
        const other = allIds[i]
        if (!taken[other] && srById[other] < sr) better++
      }
      total += better
      counted++
    }
    taken[id] = true
  }
  if (counted === 0) return 1
  const mean = total / counted
  const scale = mean / referenceMeanDisplacement
  return Math.min(2, Math.max(0.5, scale))
}
