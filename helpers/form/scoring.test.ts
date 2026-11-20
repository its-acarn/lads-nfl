import { describe, expect, it } from 'vitest'
import { loadWaiverFixture } from '../waivers/fixtures.testutil'
import { STAT_KEYS, StatLine } from '../waivers/types'
import { pointsFor } from './scoring'

const lads = loadWaiverFixture('lads')
const scoring = lads.league.scoring_settings as Record<string, number>
const FORM_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

describe('pointsFor', () => {
  it('keeps every stat the league scores', () => {
    const scored = Object.keys(scoring).filter((k) => scoring[k] !== 0)
    expect(scored.length).toBeGreaterThan(20)
    expect(scored.filter((k) => (STAT_KEYS as readonly string[]).indexOf(k) === -1)).toEqual([])
  })

  it('matches Sleeper half-PPR except the league fum penalty', () => {
    let checked = 0
    Object.keys(lads.statsByWeek).forEach((w) => {
      const week = lads.statsByWeek[Number(w)]
      Object.keys(week).forEach((id) => {
        const meta = lads.players[id]
        const s = week[id].stats
        if (!meta || FORM_POSITIONS.indexOf(meta.position || '') === -1) return
        if (typeof s.pts_half_ppr !== 'number') return
        checked++
        const expected = s.pts_half_ppr - (s.fum ?? 0)
        expect(Math.abs(pointsFor(s, scoring) - expected), `${id} week ${w}`).toBeLessThan(0.05)
      })
    })
    expect(checked).toBeGreaterThan(500)
  })

  it('scores a hand-built line', () => {
    const line = { rec: 4, rec_yd: 50, rec_td: 1, fum: 1, fum_lost: 1 } as StatLine
    expect(pointsFor(line, scoring)).toBeCloseTo(2 + 5 + 6 - 1 - 2, 2)
  })

  it('scores nothing for a missing line', () => {
    expect(pointsFor(undefined, scoring)).toBe(0)
  })
})
