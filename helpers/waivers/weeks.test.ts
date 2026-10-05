import { describe, expect, it } from 'vitest'
import { completedWeeks, nextOpponent, teamGameWeeks, upcomingWeek } from './weeks'
import { ScheduleGame, WeekStats } from './types'

const g = (week: number, home: string, away: string, status = 'complete'): ScheduleGame => ({ week, home, away, status })

describe('completedWeeks', () => {
  it('drops a week with any game not complete, and weeks after upToWeek', () => {
    const schedule = [g(1, 'NO', 'KC'), g(1, 'BUF', 'MIA'), g(2, 'NO', 'BUF'), g(2, 'KC', 'MIA', 'pre_game'), g(3, 'NO', 'MIA')]
    expect(completedWeeks(schedule, 2)).toEqual([1])
    expect(completedWeeks(schedule, 3)).toEqual([1, 3])
  })
})

describe('completedWeeks with a canceled game', () => {
  it('counts a week whose only unplayed game was canceled (2026 week 6, DAL v SEA)', () => {
    const schedule = [g(6, 'DAL', 'SEA', 'canceled'), g(6, 'NO', 'KC'), g(7, 'NO', 'KC', 'pre_game')]
    expect(completedWeeks(schedule, 7)).toEqual([6])
  })
  it('does not count a week in which every game was canceled', () => {
    expect(completedWeeks([g(6, 'DAL', 'SEA', 'canceled')], 6)).toEqual([])
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

describe('upcomingWeek', () => {
  it('is the first week with no game played yet, so Monday night of week 4 points at week 5', () => {
    const schedule = [g(4, 'NO', 'KC'), g(4, 'BUF', 'MIA', 'pre_game'), g(5, 'NO', 'BUF', 'pre_game'), g(5, 'KC', 'MIA', 'pre_game')]
    expect(upcomingWeek(schedule)).toBe(5)
  })
  it('stays on the current week from Thursday night to Sunday', () => {
    const schedule = [g(4, 'NO', 'KC'), g(4, 'BUF', 'MIA'), g(5, 'NO', 'BUF'), g(5, 'KC', 'MIA', 'pre_game'), g(5, 'DAL', 'SEA', 'pre_game'), g(6, 'NO', 'MIA', 'pre_game')]
    expect(upcomingWeek(schedule)).toBe(5)
  })
  it('is null once the season is over', () => {
    expect(upcomingWeek([g(1, 'NO', 'KC')])).toBeNull()
  })
})
