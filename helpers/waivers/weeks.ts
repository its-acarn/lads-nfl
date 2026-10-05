// Which weeks count, and who plays whom. A week counts only once every game
// in it is complete, so a Monday-night game never gives half the league an
// extra week of data.

import { ScheduleGame, WeekStats } from './types'

export function completedWeeks(schedule: ScheduleGame[], upToWeek: number): number[] {
  const out: number[] = []
  for (let w = 1; w <= upToWeek; w++) {
    const games = schedule.filter((g) => g.week === w)
    if (games.length > 0 && games.every((g) => g.status === 'complete')) out.push(w)
  }
  return out
}

// Weeks (from `weeks`, ascending) in which `team` played, i.e. has a TEAM_ row.
export function teamGameWeeks(statsByWeek: Record<number, WeekStats>, weeks: number[], team: string): number[] {
  return weeks.filter((w) => !!statsByWeek[w] && !!statsByWeek[w][`TEAM_${team}`])
}

export function nextOpponent(schedule: ScheduleGame[], team: string, week: number): string | null {
  const game = schedule.filter((g) => g.week === week && (g.home === team || g.away === team))[0]
  if (!game) return null
  return game.home === team ? game.away : game.home
}
