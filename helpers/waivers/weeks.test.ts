import { describe, expect, it } from 'vitest'
import { completedWeeks, nextOpponent, teamGameWeeks } from './weeks'
import { ScheduleGame, WeekStats } from './types'

const g = (week: number, home: string, away: string, status = 'complete'): ScheduleGame => ({ week, home, away, status })

describe('completedWeeks', () => {
  it('drops a week with any game not complete, and weeks after upToWeek', () => {
    const schedule = [g(1, 'NO', 'KC'), g(1, 'BUF', 'MIA'), g(2, 'NO', 'BUF'), g(2, 'KC', 'MIA', 'pre_game'), g(3, 'NO', 'MIA')]
    expect(completedWeeks(schedule, 2)).toEqual([1])
    expect(completedWeeks(schedule, 3)).toEqual([1, 3])
  })
})

describe('teamGameWeeks', () => {
  it('skips weeks where the team has no TEAM_ entry (bye)', () => {
    const stats: Record<number, WeekStats> = {
      1: { TEAM_NO: { team: 'NO', stats: { pass_att: 30 } } },
      2: { TEAM_KC: { team: 'KC', stats: { pass_att: 30 } } },
      3: { TEAM_NO: { team: 'NO', stats: { pass_att: 30 } } },
    }
    expect(teamGameWeeks(stats, [1, 2, 3], 'NO')).toEqual([1, 3])
  })
})

describe('nextOpponent', () => {
  it('returns the other team, or null on a bye', () => {
    const schedule = [g(5, 'NO', 'KC', 'pre_game'), g(5, 'BUF', 'MIA', 'pre_game')]
    expect(nextOpponent(schedule, 'KC', 5)).toBe('NO')
    expect(nextOpponent(schedule, 'NO', 5)).toBe('KC')
    expect(nextOpponent(schedule, 'DAL', 5)).toBeNull()
  })
})
