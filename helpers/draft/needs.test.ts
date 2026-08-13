import { describe, expect, it } from 'vitest'
import { computeNeeds, forcedPositions, isForcedMode, parseLineup } from './needs'
import { BoardRules, Position } from './types'

const LADS_LINEUP = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN']
const RULES: BoardRules = {
  maxByPos: { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1 },
  minRoundK: 13,
  minRoundDEF: 12,
  stashRound: 12,
  offBoardDiscount: 0.8,
}

function counts(partial: Partial<Record<Position, number>>): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, ...partial }
}

describe('parseLineup', () => {
  it('parses the lads lineup', () => {
    const shape = parseLineup(LADS_LINEUP)
    expect(shape.dedicated).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 })
    expect(shape.flexSlots).toEqual([['RB', 'WR', 'TE']])
    expect(shape.benchSlots).toBe(5)
  })

  it('parses SUPER_FLEX lineups (flexi)', () => {
    const shape = parseLineup(['QB', 'FLEX', 'SUPER_FLEX', 'BN'])
    expect(shape.flexSlots).toEqual([
      ['RB', 'WR', 'TE'],
      ['QB', 'RB', 'WR', 'TE'],
    ])
  })

  it('hard-errors on IDP slots', () => {
    expect(() => parseLineup(['QB', 'LB', 'BN'])).toThrow(/unsupported roster slot/)
  })
})

describe('computeNeeds', () => {
  const shape = parseLineup(LADS_LINEUP)

  it('weights every dedicated starter 1.0 on an empty roster', () => {
    const needs = computeNeeds(counts({}), shape, RULES)
    expect(needs.weights).toEqual({ QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DEF: 1 })
    expect(needs.unfilledMandatoryCount).toBe(8)
  })

  it('drops a filled QB to bench weight (not flex-eligible in lads)', () => {
    const needs = computeNeeds(counts({ QB: 1 }), shape, RULES)
    expect(needs.weights.QB).toBe(0.5)
  })

  it('routes RB surplus into FLEX at 0.75, then bench decay', () => {
    // 2 RB starters filled, flex open: a 3rd RB is flex-eligible.
    let needs = computeNeeds(counts({ RB: 2 }), shape, RULES)
    expect(needs.weights.RB).toBe(0.75)
    // 3rd RB fills the flex; the 4th is bench depth at 0.5.
    needs = computeNeeds(counts({ RB: 3 }), shape, RULES)
    expect(needs.weights.RB).toBe(0.5)
    expect(needs.weights.WR).toBe(1) // WR starters still open
    // Bench decay: 0.5 -> 0.35 -> 0.2 -> floor 0.1
    expect(computeNeeds(counts({ RB: 4 }), shape, RULES).weights.RB).toBe(0.35)
    expect(computeNeeds(counts({ RB: 5 }), shape, RULES).weights.RB).toBe(0.2)
  })

  it('zeroes a capped position', () => {
    const needs = computeNeeds(counts({ K: 1 }), shape, RULES)
    expect(needs.weights.K).toBe(0)
  })
})

describe('forced mode', () => {
  const shape = parseLineup(LADS_LINEUP)

  it('collapses to unfilled mandatory positions when picks run out', () => {
    // 12 picks made, K + DEF still open, 2 picks left -> forced.
    const needs = computeNeeds(counts({ QB: 1, RB: 5, WR: 4, TE: 2 }), shape, RULES)
    expect(needs.unfilledMandatoryCount).toBe(2)
    expect(isForcedMode(2, needs)).toBe(true)
    expect(forcedPositions(needs)).toEqual(['K', 'DEF'])
  })

  it('stays unforced with spare picks', () => {
    const needs = computeNeeds(counts({ QB: 1, RB: 5, WR: 4, TE: 2 }), shape, RULES)
    expect(isForcedMode(3, needs)).toBe(false)
  })

  it('never fires with a complete lineup', () => {
    const needs = computeNeeds(counts({ QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }), shape, RULES)
    expect(isForcedMode(1, needs)).toBe(false)
  })
})
