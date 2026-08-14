import { describe, expect, it } from 'vitest'
import { boardValue, buildValuer, DEFAULT_VALUE_OPTS } from './value'
import { ResolvedBoard, ResolvedBoardPlayer } from './types'

function boardOf(players: ResolvedBoardPlayer[]): ResolvedBoard {
  return {
    season: 2026,
    leagueId: 'L',
    draftId: 'D',
    myUserId: 'U',
    players,
    doNotDraftIds: [],
    pins: [],
    rules: {
      maxByPos: { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1 },
      minRoundByPos: { K: 13, DEF: 12 },
      stashRound: 12,
      offBoardDiscount: 0.8,
    },
  }
}

const P = (id: string, tier: number, rank: number): ResolvedBoardPlayer => ({
  name: id,
  pos: 'RB',
  tier,
  rank,
  player_id: id,
})

describe('boardValue', () => {
  it('is monotone: better tier => strictly greater value; within tier, better rank wins', () => {
    const players = [P('a', 1, 1), P('b', 1, 2), P('c', 2, 3), P('d', 3, 4), P('e', 3, 5)]
    for (let i = 1; i < players.length; i++) {
      const prev = boardValue(players[i - 1], DEFAULT_VALUE_OPTS)
      const cur = boardValue(players[i], DEFAULT_VALUE_OPTS)
      expect(prev).toBeGreaterThan(cur)
    }
  })

  it('keeps tier plateaus dominant over rank epsilon', () => {
    const lastOfT1 = boardValue(P('x', 1, 30), DEFAULT_VALUE_OPTS)
    const firstOfT2 = boardValue(P('y', 2, 31), DEFAULT_VALUE_OPTS)
    expect(lastOfT1).toBeGreaterThan(firstOfT2)
  })
})

describe('buildValuer off-board interpolation', () => {
  const board = boardOf([P('a', 1, 1), P('b', 2, 2), P('c', 3, 3)])
  const searchRanks: Record<string, number | null> = { a: 1, b: 10, c: 30 }

  it('returns board values for board players and null-checks the rest', () => {
    const v = buildValuer(board, searchRanks)
    expect(v.valueForBoardPlayer('a')).toBeCloseTo(100 - 0.01)
    expect(v.valueForBoardPlayer('nope')).toBeNull()
  })

  it('interpolates between board points and discounts', () => {
    const v = buildValuer(board, searchRanks)
    const va = v.valueForBoardPlayer('a')!
    const vb = v.valueForBoardPlayer('b')!
    const mid = v.valueForOffBoard(5.5) // halfway between sr 1 and sr 10
    expect(mid).toBeLessThan(va * 0.8)
    expect(mid).toBeGreaterThan(vb * 0.8)
    const exact = ((va + vb) / 2) * 0.8
    expect(mid).toBeCloseTo(exact, 5)
  })

  it('clamps above the board and decays gently below it, never negative', () => {
    const v = buildValuer(board, searchRanks)
    expect(v.valueForOffBoard(0)).toBeCloseTo(v.valueForBoardPlayer('a')! * 0.8, 5)
    const justPast = v.valueForOffBoard(31)
    const farPast = v.valueForOffBoard(500)
    expect(justPast).toBeLessThan(v.valueForBoardPlayer('c')! * 0.8)
    expect(farPast).toBeLessThanOrEqual(justPast)
    expect(farPast).toBeGreaterThanOrEqual(0)
  })
})
