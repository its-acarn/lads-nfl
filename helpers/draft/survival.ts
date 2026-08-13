// Monte Carlo opponent model. Each sim removes `gap` players from the
// candidate pool by Gumbel-perturbed ADP order (Gumbel-top-k == sampling
// without replacement from the softmax over -searchRank/T). Outputs
// per-player survival to my next pick and per-position expected best value.

import { gumbel, mulberry32 } from './rng'
import { BoardState, PlayerMap, PoolPlayer, Position, SimOpts, SurvivalReport } from './types'

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const PER_POSITION_FLOOR = 5 // always simulate at least this many per position

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

  const rng = mulberry32(opts.seed)
  const utilities: number[] = []
  for (let i = 0; i < n; i++) utilities.push(-candidates[i].searchRank / temperature)

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
