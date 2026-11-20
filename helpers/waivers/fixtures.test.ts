import { describe, expect, it } from 'vitest'
import { loadWaiverFixture } from './fixtures.testutil'
import { completedWeeks } from './weeks'

describe('waiver fixture', () => {
  it.each(['lads', 'flexi'] as const)('%s loads with stats for every week up to the current one', (league) => {
    const inputs = loadWaiverFixture(league)
    expect(inputs.week).toBeGreaterThanOrEqual(4)
    // The current week may be in progress (a refresh on a Friday holds only
    // Thursday's game), so only completed weeks must be full.
    const done = completedWeeks(inputs.schedule, inputs.week)
    expect(done.length).toBeGreaterThanOrEqual(4)
    done.forEach((w) => expect(Object.keys(inputs.statsByWeek[w]).length).toBeGreaterThan(100))
    for (let w = 1; w <= inputs.week; w++) expect(inputs.statsByWeek[w]).toBeDefined()
    expect(inputs.schedule.length).toBeGreaterThan(250)
    expect(inputs.rosters.length).toBe(inputs.league.league_id === '1325817907900354560' ? 12 : 10)
    expect(Object.keys(inputs.players).length).toBeGreaterThan(500)
  })
})
