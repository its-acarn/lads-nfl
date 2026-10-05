// Which weeks count, and who plays whom. A week counts only once every game
// in it is complete, so a Monday-night game never gives half the league an
// extra week of data.

import { ScheduleGame, WeekStats } from './types'

// Games that will never be played this week (Sleeper sends 'canceled').
const NOT_PLAYING = ['canceled', 'cancelled', 'postponed']

export function completedWeeks(schedule: ScheduleGame[], upToWeek: number): number[] {
  const out: number[] = []
  for (let w = 1; w <= upToWeek; w++) {
    const games = schedule.filter((g) => g.week === w)
    const done = games.every((g) => g.status === 'complete' || NOT_PLAYING.indexOf(g.status) !== -1)
    if (done && games.some((g) => g.status === 'complete')) out.push(w)
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

// The week waiver pickups are for: the first week in which fewer than half
// the games have started (or been called off). Monday night of week 4 (15 of
// 16 done) points at week 5; so does Friday of week 5 (1 of 16 done).
export function upcomingWeek(schedule: ScheduleGame[]): number | null {
  const weeks = Array.from(new Set(schedule.map((g) => g.week))).sort((a, b) => a - b)
  for (let i = 0; i < weeks.length; i++) {
    const games = schedule.filter((g) => g.week === weeks[i])
    const started = games.filter((g) => g.status !== 'pre_game').length
    if (started < games.length / 2) return weeks[i]
  }
  return null
}
