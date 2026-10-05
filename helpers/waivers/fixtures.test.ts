import { describe, expect, it } from 'vitest'
import { loadWaiverFixture } from './fixtures.testutil'

describe('waiver fixture', () => {
  it.each(['lads', 'flexi'] as const)('%s loads with stats for every week up to the current one', (league) => {
    const inputs = loadWaiverFixture(league)
    expect(inputs.week).toBeGreaterThanOrEqual(4)
    for (let w = 1; w <= inputs.week; w++) expect(Object.keys(inputs.statsByWeek[w]).length).toBeGreaterThan(100)
    expect(inputs.schedule.length).toBeGreaterThan(250)
    expect(inputs.rosters.length).toBe(inputs.league.league_id === '1325817907900354560' ? 12 : 10)
    expect(Object.keys(inputs.players).length).toBeGreaterThan(500)
  })
})
