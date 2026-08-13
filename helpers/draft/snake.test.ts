import { describe, expect, it } from 'vitest'
import { loadAllFixtures } from './fixtures.testutil'
import { assertSupportedDraft, myDraftSlot, ownedPickNumbers, pickNoFor, roundAscends, slotToRoster } from './snake'
import { SleeperDraft } from './types'

function fakeDraft(overrides: Partial<SleeperDraft> & { settings: SleeperDraft['settings'] }): SleeperDraft {
  return {
    draft_id: 'test',
    league_id: 'test',
    type: 'snake',
    status: 'complete',
    season: '2026',
    draft_order: null,
    slot_to_roster_id: null,
    start_time: null,
    ...overrides,
  }
}

describe('pickNoFor', () => {
  const draft = fakeDraft({ settings: { teams: 12, rounds: 14 } })

  it('computes plain snake order', () => {
    expect(pickNoFor(draft, 1, 1)).toBe(1)
    expect(pickNoFor(draft, 1, 12)).toBe(12)
    expect(pickNoFor(draft, 2, 12)).toBe(13) // snake turn
    expect(pickNoFor(draft, 2, 1)).toBe(24)
    expect(pickNoFor(draft, 3, 1)).toBe(25)
  })

  it('handles third-round reversal (3RR)', () => {
    const rr = fakeDraft({ settings: { teams: 12, rounds: 14, reversal_round: 3 } })
    // Rounds: 1 asc, 2 desc, 3 desc (reversed again), 4 asc, 5 desc...
    expect(roundAscends(rr, 1)).toBe(true)
    expect(roundAscends(rr, 2)).toBe(false)
    expect(roundAscends(rr, 3)).toBe(false)
    expect(roundAscends(rr, 4)).toBe(true)
    expect(roundAscends(rr, 5)).toBe(false)
    expect(pickNoFor(rr, 3, 12)).toBe(25) // slot 12 opens round 3 under 3RR
    expect(pickNoFor(rr, 3, 1)).toBe(36)
    expect(pickNoFor(rr, 4, 1)).toBe(37)
  })

  it('handles linear drafts', () => {
    const lin = fakeDraft({ type: 'linear', settings: { teams: 10, rounds: 4 } })
    expect(pickNoFor(lin, 1, 10)).toBe(10)
    expect(pickNoFor(lin, 2, 1)).toBe(11)
    expect(pickNoFor(lin, 4, 10)).toBe(40)
  })

  it('rejects out-of-range rounds and slots', () => {
    expect(() => pickNoFor(draft, 0, 1)).toThrow()
    expect(() => pickNoFor(draft, 15, 1)).toThrow()
    expect(() => pickNoFor(draft, 1, 13)).toThrow()
  })
})

describe('assertSupportedDraft', () => {
  it('rejects auction drafts loudly', () => {
    const auction = fakeDraft({ type: 'auction', settings: { teams: 12, rounds: 14 } })
    expect(() => assertSupportedDraft(auction)).toThrow(/auction/)
  })
})

describe('ownership against every committed fixture', () => {
  const fixtures = loadAllFixtures()

  it('loads all seven fixture drafts', () => {
    expect(fixtures.length).toBe(7)
  })

  for (let f = 0; f < fixtures.length; f++) {
    const fx = fixtures[f]
    it(`${fx.name}/${fx.season} (${fx.draft.type}, ${fx.tradedPicks.length} traded): computed picks match the real feed for every roster`, () => {
      const actualByRoster: Record<number, number[]> = {}
      for (let i = 0; i < fx.picks.length; i++) {
        const p = fx.picks[i]
        if (p.roster_id === null) continue
        if (!actualByRoster[p.roster_id]) actualByRoster[p.roster_id] = []
        actualByRoster[p.roster_id].push(p.pick_no)
      }
      const rosterIds = Object.keys(actualByRoster).map(Number)
      expect(rosterIds.length).toBeGreaterThan(0)
      for (let r = 0; r < rosterIds.length; r++) {
        const rosterId = rosterIds[r]
        const computed = ownedPickNumbers(fx.draft, fx.tradedPicks, rosterId)
        const actual = actualByRoster[rosterId].sort((a, b) => a - b)
        expect(computed, `roster ${rosterId}`).toEqual(actual)
      }
    })
  }

  it('resolves my slot and roster from draft_order + slot_to_roster_id', () => {
    const lads = fixtures.filter((x) => x.name === 'lads' && x.season === '2024')[0]
    const order = lads.draft.draft_order!
    const userIds = Object.keys(order)
    for (let i = 0; i < userIds.length; i++) {
      const slot = myDraftSlot(lads.draft, userIds[i])
      expect(slot).toBe(order[userIds[i]])
      expect(typeof slotToRoster(lads.draft, slot)).toBe('number')
    }
    expect(() => myDraftSlot(lads.draft, 'not-a-user')).toThrow(/not in draft_order/)
  })
})
