// Points each NFL team gives up to each position, and how a player's next
// opponents rate on that scale. Points against team T in week w at position P
// = league points of every player at P whose week-w team played T. A team's
// window is its last X team games, so byes are skipped.

import { FormConfig } from '../../config/form'
import { teamGameWeeks } from '../waivers/weeks'
import { PlayerMap, ScheduleGame, WeekStats } from '../waivers/types'
import { windowGames } from './games'
import {
  FORM_POSITIONS,
  FormPosition,
  FormWindow,
  MatchupTier,
  PlayerGame,
  PointsAllowedRow,
  UpcomingGame,
} from './types'

function zeroes(): Record<FormPosition, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
}

export function buildPointsAllowed(
  games: Record<string, PlayerGame[]>,
  players: PlayerMap,
  statsByWeek: Record<number, WeekStats>,
  weeks: number[],
  window: FormWindow
): PointsAllowedRow[] {
  // against[team][week][position]
  const against: Record<string, Record<number, Record<FormPosition, number>>> = {}
  Object.keys(games).forEach((id) => {
    const position = players[id]?.position as FormPosition
    games[id].forEach((g) => {
      const byWeek = (against[g.opponent] = against[g.opponent] || {})
      const cell = (byWeek[g.week] = byWeek[g.week] || zeroes())
      cell[position] += g.points
    })
  })

  const teams = new Set<string>()
  weeks.forEach((w) =>
    Object.keys(statsByWeek[w] || {}).forEach((k) => {
      if (k.indexOf('TEAM_') === 0) teams.add(k.slice(5))
    })
  )

  const rows: PointsAllowedRow[] = Array.from(teams)
    .sort()
    .map((team) => {
      const played = windowGames(teamGameWeeks(statsByWeek, weeks, team), window)
      const perGame = zeroes()
      FORM_POSITIONS.forEach((p) => {
        const total = played.reduce((acc, w) => acc + (against[team]?.[w]?.[p] ?? 0), 0)
        perGame[p] = played.length ? total / played.length : 0
      })
      return { team, games: played.length, perGame, rank: zeroes() }
    })

  FORM_POSITIONS.forEach((p) => {
    rows
      .slice()
      .sort((a, b) => b.perGame[p] - a.perGame[p])
      .forEach((r, i) => (r.rank[p] = i + 1))
  })
  return rows
}

export function matchupTier(rank: number, config: FormConfig): MatchupTier {
  if (rank <= config.matchup.softMaxRank) return 'soft'
  if (rank >= config.matchup.toughMinRank) return 'tough'
  return 'neutral'
}

// The first week after the team's last completed game: its next game, or a
// bye. Per team, because mid-week a Thursday team has already played while a
// Monday team has not. Null once the team's schedule is used up.
export function teamNextWeek(schedule: ScheduleGame[], team: string): number | null {
  const weeks = schedule.map((g) => g.week)
  if (weeks.length === 0) return null
  const lastWeek = Math.max(...weeks)
  const played = schedule
    .filter((g) => (g.home === team || g.away === team) && g.status === 'complete')
    .map((g) => g.week)
  const next = played.length ? Math.max(...played) + 1 : Math.min(...weeks)
  return next <= lastWeek ? next : null
}

export function upcomingGames(
  schedule: ScheduleGame[],
  team: string,
  fromWeek: number | null,
  allowed: PointsAllowedRow[],
  position: FormPosition,
  config: FormConfig
): UpcomingGame[] {
  if (fromWeek === null) return []
  const lastWeek = schedule.reduce((m, g) => Math.max(m, g.week), 0)
  const out: UpcomingGame[] = []
  for (let week = fromWeek; week < fromWeek + config.matchup.lookahead && week <= lastWeek; week++) {
    const g = schedule.filter((x) => x.week === week && (x.home === team || x.away === team))[0]
    if (!g) {
      out.push({ week, opponent: null, tier: null })
      continue
    }
    const opponent = g.home === team ? g.away : g.home
    const row = allowed.filter((r) => r.team === opponent)[0]
    out.push({ week, opponent, tier: row ? matchupTier(row.rank[position], config) : null })
  }
  return out
}
