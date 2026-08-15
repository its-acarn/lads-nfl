// Roster-need weights from league roster_positions, plus forced-slot logic.
// Weights: unfilled dedicated starter 1.0; FLEX-eligible while a flex slot is
// unfilled 0.75; bench depth decays 0.5/0.35/0.2 then 0.1; capped position 0.

import { BoardRules, Position } from './types'

export const FLEX_ELIGIBILITY: Record<string, Position[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
}

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// Defaults. Every replay and golden snapshot in the repo was recorded against
// these, so a board that overrides nothing behaves exactly as before.
export const DEFAULT_NEED_WEIGHTS = {
  starter: 1.0,
  flex: 0.75,
  benchDecay: [0.5, 0.35, 0.2],
  benchFloor: 0.1,
}

export interface ResolvedNeedWeights {
  starter: number
  flex: number
  benchDecay: number[]
  benchFloor: number
}

export function needWeightsFrom(rules: BoardRules): ResolvedNeedWeights {
  const w = rules.needWeights || {}
  return {
    starter: w.starter === undefined ? DEFAULT_NEED_WEIGHTS.starter : w.starter,
    flex: w.flex === undefined ? DEFAULT_NEED_WEIGHTS.flex : w.flex,
    benchDecay: w.benchDecay === undefined ? DEFAULT_NEED_WEIGHTS.benchDecay : w.benchDecay,
    benchFloor: w.benchFloor === undefined ? DEFAULT_NEED_WEIGHTS.benchFloor : w.benchFloor,
  }
}

export interface LineupShape {
  dedicated: Record<Position, number>
  flexSlots: Position[][] // eligibility set per flex slot
  benchSlots: number
}

export function parseLineup(rosterPositions: string[]): LineupShape {
  const dedicated: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  const flexSlots: Position[][] = []
  let benchSlots = 0
  for (let i = 0; i < rosterPositions.length; i++) {
    const slot = rosterPositions[i]
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') {
      benchSlots++
    } else if (POSITIONS.indexOf(slot as Position) !== -1) {
      dedicated[slot as Position]++
    } else if (FLEX_ELIGIBILITY[slot]) {
      flexSlots.push(FLEX_ELIGIBILITY[slot])
    } else {
      // IDP or anything else the engine was not built for: fail at LOAD.
      throw new Error(`unsupported roster slot "${slot}" — this engine handles standard lineups only`)
    }
  }
  return { dedicated, flexSlots, benchSlots }
}

// A position the board caps at zero is one the drafter has decided never to
// draft. Leaving its starter slot in the lineup is actively dangerous: the slot
// stays permanently unfilled, so unfilledMandatoryCount never reaches zero,
// forced mode fires on the last picks, the candidate set collapses to that
// position, the cap guardrail then rejects every candidate in it, and
// recommend() drops into its relax-everything path -- arbitrary picks at the
// worst possible moment.
//
// Converting those slots to bench is the honest representation: the drafter
// intends to fill them off waivers, which is what a third of this league does
// with kickers and defenses every year.
export function effectiveLineup(rosterPositions: string[], rules: BoardRules): string[] {
  const out: string[] = []
  for (let i = 0; i < rosterPositions.length; i++) {
    const slot = rosterPositions[i]
    const capped = POSITIONS.indexOf(slot as Position) !== -1 && rules.maxByPos[slot as Position] === 0
    out.push(capped ? 'BN' : slot)
  }
  return out
}

// Sleeper's draft object carries the whole lineup in settings.slots_*, so a
// draft with no league behind it -- a mock -- can still say what it is. This
// is what makes a mock-draft smoke test possible: the only thing runBot needed
// a league for was roster_positions.
const SLOT_KEY_TO_POSITION: [string, string][] = [
  ['slots_qb', 'QB'],
  ['slots_rb', 'RB'],
  ['slots_wr', 'WR'],
  ['slots_te', 'TE'],
  ['slots_flex', 'FLEX'],
  ['slots_super_flex', 'SUPER_FLEX'],
  ['slots_rec_flex', 'REC_FLEX'],
  ['slots_wrrb_flex', 'WRRB_FLEX'],
  ['slots_k', 'K'],
  ['slots_def', 'DEF'],
  ['slots_bn', 'BN'],
]

export function lineupFromDraftSettings(settings: Record<string, unknown>): string[] {
  const out: string[] = []
  for (let i = 0; i < SLOT_KEY_TO_POSITION.length; i++) {
    const [key, slot] = SLOT_KEY_TO_POSITION[i]
    const n = settings[key]
    if (typeof n !== 'number' || n <= 0) continue
    for (let k = 0; k < n; k++) out.push(slot)
  }
  if (out.length === 0) {
    throw new Error('draft.settings carries no slots_* fields — cannot derive a lineup without a league')
  }
  return out
}

export interface NeedsResult {
  weights: Record<Position, number>
  unfilledMandatory: Record<Position, number> // dedicated starter slots still open
  unfilledMandatoryCount: number
  unfilledFlexCount: number
}

// Greedy allocation: dedicated starters first, then surplus players into flex
// slots (slots with the narrowest eligibility get first pull so a lone WR
// surplus fills REC_FLEX before generic FLEX).
export function computeNeeds(
  posCounts: Record<Position, number>,
  shape: LineupShape,
  rules: BoardRules
): NeedsResult {
  const surplus: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  const unfilledMandatory: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  let unfilledMandatoryCount = 0
  for (let i = 0; i < POSITIONS.length; i++) {
    const pos = POSITIONS[i]
    const have = posCounts[pos] || 0
    const need = shape.dedicated[pos]
    surplus[pos] = Math.max(0, have - need)
    const open = Math.max(0, need - have)
    unfilledMandatory[pos] = open
    unfilledMandatoryCount += open
  }

  const flexOrder = shape.flexSlots
    .map((eligible, idx) => ({ eligible, idx }))
    .sort((a, b) => a.eligible.length - b.eligible.length)
  const flexFilled: boolean[] = shape.flexSlots.map(() => false)
  for (let f = 0; f < flexOrder.length; f++) {
    const eligible = flexOrder[f].eligible
    // Take from the eligible position with the largest surplus.
    let bestPos: Position | null = null
    for (let i = 0; i < eligible.length; i++) {
      if (surplus[eligible[i]] > 0 && (bestPos === null || surplus[eligible[i]] > surplus[bestPos])) {
        bestPos = eligible[i]
      }
    }
    if (bestPos !== null) {
      surplus[bestPos]--
      flexFilled[flexOrder[f].idx] = true
    }
  }

  let unfilledFlexCount = 0
  for (let f = 0; f < flexFilled.length; f++) {
    if (!flexFilled[f]) unfilledFlexCount++
  }

  const w = needWeightsFrom(rules)
  const weights: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (let i = 0; i < POSITIONS.length; i++) {
    const pos = POSITIONS[i]
    const have = posCounts[pos] || 0
    if (have >= rules.maxByPos[pos]) {
      weights[pos] = 0
      continue
    }
    if (unfilledMandatory[pos] > 0) {
      weights[pos] = w.starter
      continue
    }
    let flexEligible = false
    for (let f = 0; f < shape.flexSlots.length; f++) {
      if (!flexFilled[f] && shape.flexSlots[f].indexOf(pos) !== -1) flexEligible = true
    }
    if (flexEligible) {
      weights[pos] = w.flex
      continue
    }
    // Pure bench depth: surplus[pos] players are already benched (after flex
    // allocation), so the NEXT one at this position gets the decayed weight.
    const benched = surplus[pos]
    weights[pos] = benched < w.benchDecay.length ? w.benchDecay[benched] : w.benchFloor
  }

  return { weights, unfilledMandatory, unfilledMandatoryCount, unfilledFlexCount }
}

// Forced mode: when my remaining picks only just cover the unfilled dedicated
// starter slots, the candidate set collapses to those positions. This is what
// stops the bot skipping K/DEF into an illegal lineup.
export function isForcedMode(remainingPickCount: number, needs: NeedsResult): boolean {
  return needs.unfilledMandatoryCount > 0 && remainingPickCount <= needs.unfilledMandatoryCount
}

export function forcedPositions(needs: NeedsResult): Position[] {
  const out: Position[] = []
  for (let i = 0; i < POSITIONS.length; i++) {
    if (needs.unfilledMandatory[POSITIONS[i]] > 0) out.push(POSITIONS[i])
  }
  return out
}
