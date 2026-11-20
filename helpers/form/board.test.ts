import { describe, expect, it } from 'vitest'
import { formConfig } from '../../config/form'
import { loadWaiverFixture } from '../waivers/fixtures.testutil'
import { completedWeeks } from '../waivers/weeks'
import { buildFormBoard } from './board'

const lads = loadWaiverFixture('lads')
const mine = lads.rosters.find((r) => r.roster_id === 1)!.owner_id as string

describe('buildFormBoard on the fixture', () => {
  it('builds every table through the last completed week', () => {
    const board = buildFormBoard(lads, { playerWindow: 3, allowedWindow: 5 }, formConfig)
    const done = completedWeeks(lads.schedule, lads.week)
    expect(board.throughWeek).toBe(done[done.length - 1])
    expect(board.players.length).toBeGreaterThan(300)
    expect(board.allowed.length).toBe(32)
    expect(board.teams.length).toBe(12)
    board.players.forEach((p) => expect(p.games.length).toBeLessThanOrEqual(3))
    expect(board.players.filter((p) => p.owner.kind === 'mine')).toEqual([])
    expect(board.players.some((p) => p.signal === 'buy')).toBe(true)
    expect(board.players.some((p) => p.signal === 'sell')).toBe(true)
  })

  it("marks the picked team's players as mine", () => {
    const board = buildFormBoard(lads, { playerWindow: 3, allowedWindow: 3, ownerId: mine }, formConfig)
    expect(board.players.filter((p) => p.owner.kind === 'mine').length).toBeGreaterThan(5)
    expect(board.teams.filter((t) => t.owner.kind === 'mine').length).toBe(1)
  })

  it('ranks the 12 teams 1..12 on total', () => {
    const board = buildFormBoard(lads, { playerWindow: 'season', allowedWindow: 3 }, formConfig)
    expect(board.teams.map((t) => t.rank.total).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    board.teams.forEach((t) => expect(t.total).toBeGreaterThan(50))
  })
})
