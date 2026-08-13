// Integration tests: state + survival + recommend against the real
// lads/2024 fixture via the synthetic market board.

import { describe, expect, it } from 'vitest'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { buildMarketFixture, marketConfig, userForSlot } from './marketBoard'
import { buildState } from './state'
import { recommend } from './recommend'
import { DEFAULT_SIM_OPTS, survival } from './survival'
import { BoardState, SimOpts, SleeperPick } from './types'

const fx = loadFixture('lads', '2024')
const realPlayers = loadTrimmedPlayers()
const SLOT = 1
const ME = userForSlot(fx.draft, SLOT)
const market = buildMarketFixture(fx.draft, fx.picks, realPlayers, ME)
const cfg = marketConfig(fx.draft, fx.league, fx.tradedPicks, ME)
const sorted = fx.picks.slice().sort((a, b) => a.pick_no - b.pick_no)

// Feed truncated so that `pickNo` is the next pick on the clock.
function feedBefore(pickNo: number): SleeperPick[] {
  return sorted.filter((p) => p.pick_no < pickNo)
}

function stateBefore(pickNo: number): BoardState {
  return buildState(cfg, feedBefore(pickNo), market.board, market.players)
}

const OPTS: SimOpts = { ...DEFAULT_SIM_OPTS, sims: 800 }

describe('buildState', () => {
  it('tracks the lowest unfilled pick as current', () => {
    expect(stateBefore(1).currentPickNo).toBe(1)
    expect(stateBefore(25).currentPickNo).toBe(25)
    const done = buildState(cfg, sorted, market.board, market.players)
    expect(done.currentPickNo).toBe(169)
    expect(done.pool.length).toBe(0)
  })

  it('is robust to a non-contiguous feed (pre-filled keeper-style picks)', () => {
    const holes = sorted.filter((p) => p.pick_no !== 3 && p.pick_no <= 20)
    const st = buildState(cfg, holes, market.board, market.players)
    expect(st.currentPickNo).toBe(3)
  })

  it('counts rosters correctly at the end of the draft', () => {
    const done = buildState(cfg, sorted, market.board, market.players)
    // lads: 12 rosters x 14 picks
    const rosterIds = Object.keys(done.posCountsByRoster)
    expect(rosterIds.length).toBe(12)
    for (let i = 0; i < rosterIds.length; i++) {
      const c = done.posCountsByRoster[Number(rosterIds[i])]
      expect(c.QB + c.RB + c.WR + c.TE + c.K + c.DEF).toBe(14)
    }
  })

  it('rejects duplicate pick numbers', () => {
    const dup = sorted.slice(0, 5).concat([sorted[4]])
    expect(() => buildState(cfg, dup, market.board, market.players)).toThrow(/duplicate pick_no/)
  })
})

describe('survival', () => {
  const myFirstPick = stateBefore(1).myPickNos.filter((n) => n >= 1)[0]

  it('is deterministic under a fixed seed', () => {
    const st = stateBefore(myFirstPick)
    const a = survival(st, OPTS)
    const b = survival(st, OPTS)
    expect(a).toEqual(b)
  })

  it('gives higher survival to deeper players than to top ADP players', () => {
    const st = stateBefore(myFirstPick)
    const rep = survival(st, OPTS)
    const pool = st.pool
    const top = rep.survivalById[pool[0].player_id]
    const deep = rep.survivalById[pool[Math.min(50, pool.length - 1)].player_id]
    expect(deep).toBeGreaterThan(top)
  })

  it('expected best value at my next pick never exceeds the current best (pool only shrinks)', () => {
    const st = stateBefore(myFirstPick)
    const rep = survival(st, OPTS)
    const bestNow: Record<string, number> = {}
    for (let i = 0; i < st.pool.length; i++) {
      const p = st.pool[i]
      if (bestNow[p.pos] === undefined) bestNow[p.pos] = p.value
    }
    const positions = Object.keys(rep.expectedBestValueByPos)
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i] as keyof typeof rep.expectedBestValueByPos
      if (bestNow[pos] !== undefined) {
        expect(rep.expectedBestValueByPos[pos]).toBeLessThanOrEqual(bestNow[pos] + 1e-9)
      }
    }
  })
})

describe('recommend', () => {
  const myPicks = stateBefore(1).myPickNos

  it('produces a primary plus two fallbacks with rationale', () => {
    const rec = recommend(stateBefore(myPicks[0]), OPTS)
    expect(rec.pickNo).toBe(myPicks[0])
    expect(rec.primary.player_id).toBeTruthy()
    expect(rec.fallbacks.length).toBe(2)
    expect(rec.primary.rationale.length).toBeGreaterThan(0)
    const ids = [rec.primary.player_id, rec.fallbacks[0].player_id, rec.fallbacks[1].player_id]
    expect(new Set(ids).size).toBe(3)
  })

  it('never recommends K or DEF before their round floors', () => {
    for (let i = 0; i < myPicks.length; i++) {
      const st = stateBefore(myPicks[i])
      const rec = recommend(st, OPTS)
      if (rec.forced) continue
      if (rec.round < market.board.rules.minRoundK) expect(rec.primary.pos).not.toBe('K')
      if (rec.round < market.board.rules.minRoundDEF) expect(rec.primary.pos).not.toBe('DEF')
    }
  })

  it('collapses to unfilled starters in forced mode (last picks force K/DEF)', () => {
    // Simulate my roster having skipped K and DEF until my last two picks.
    const lastTwo = myPicks.slice(myPicks.length - 2)
    const st = stateBefore(lastTwo[0])
    if (st.myPosCounts.K === 0 && st.myPosCounts.DEF === 0) {
      const rec = recommend(st, OPTS)
      expect(rec.forced).toBe(true)
      expect(['K', 'DEF']).toContain(rec.primary.pos)
    }
  })

  it('respects doNotDraft', () => {
    const st = stateBefore(myPicks[0])
    const banned = st.pool[0].player_id
    const board2 = { ...market.board, doNotDraftIds: [banned] }
    const st2 = buildState(cfg, feedBefore(myPicks[0]), board2, market.players)
    const rec = recommend(st2, OPTS)
    expect(rec.primary.player_id).not.toBe(banned)
    expect(rec.fallbacks.map((f) => f.player_id)).not.toContain(banned)
  })

  it('honours pins inside their round window', () => {
    const st = stateBefore(myPicks[1])
    // Pin the 5th-best available player for the round of my second pick.
    const target = st.pool[4]
    const round = Math.floor((myPicks[1] - 1) / 12) + 1
    const board2 = {
      ...market.board,
      pins: [{ name: target.name, fromRound: round, toRound: round, player_id: target.player_id }],
    }
    const st2 = buildState(cfg, feedBefore(myPicks[1]), board2, market.players)
    const rec = recommend(st2, OPTS)
    expect(rec.primary.player_id).toBe(target.player_id)
    expect(rec.primary.rationale.join(' ')).toMatch(/pin/)
  })

  it('is deterministic and returns within the 250ms budget', () => {
    const st = stateBefore(myPicks[2])
    const t0 = Date.now()
    const a = recommend(st, { ...DEFAULT_SIM_OPTS })
    const elapsed = Date.now() - t0
    const b = recommend(st, { ...DEFAULT_SIM_OPTS })
    expect(a).toEqual(b)
    expect(elapsed).toBeLessThan(250)
  })
})
