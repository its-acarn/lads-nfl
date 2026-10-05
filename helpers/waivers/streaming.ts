// Kicker and defence streaming, from stats only. Each team is judged over its
// last three team games; the defence also looks at next week's opponent's
// giveaways. A team on bye next week is listed last with a score of 0.

import { WaiverConfig } from '../../config/waivers'
import { percentiles } from './score'
import { stat, WINDOW } from './metrics'
import { nextOpponent, teamGameWeeks } from './weeks'
import { PlayerMap, ScheduleGame, StatLine, StreamRow, WeekStats } from './types'

type PerGame = (team: string, f: (line: StatLine | undefined) => number, key: (t: string) => string) => number

function perGameOf(statsByWeek: Record<number, WeekStats>, weeks: number[]): PerGame {
  return (team, f, key) => {
    const games = teamGameWeeks(statsByWeek, weeks, team).slice(-WINDOW)
    if (games.length === 0) return 0
    return games.reduce((acc, w) => acc + f(statsByWeek[w][key(team)]?.stats), 0) / games.length
  }
}
const DEF_KEY = (t: string): string => t
const OFF_KEY = (t: string): string => `TEAM_${t}`

// rows: candidates with their opponent; parts: [weight, value per row].
function rank(rows: StreamRow[], parts: [number, (r: StreamRow) => number][]): StreamRow[] {
  const playing = rows.filter((r) => r.opponent !== null)
  const pcts = parts.map(([, f]) => percentiles(playing.map(f)))
  playing.forEach((r, i) => {
    r.score = parts.reduce((acc, [weight], j) => acc + (weight * pcts[j][i]) / 100, 0)
  })
  const byes = rows.filter((r) => r.opponent === null)
  return playing.sort((a, b) => b.score - a.score).concat(byes)
}

export function rankDefences(
  statsByWeek: Record<number, WeekStats>,
  weeks: number[],
  schedule: ScheduleGame[],
  nextWeek: number,
  players: PlayerMap,
  config: WaiverConfig
): StreamRow[] {
  const c = config.streaming
  const perGame = perGameOf(statsByWeek, weeks)
  const rows: StreamRow[] = Object.keys(players)
    .filter((id) => players[id].position === 'DEF' && players[id].team)
    .map((id) => {
      const team = players[id].team as string
      return { playerId: id, name: `${team} DEF`, team, opponent: nextOpponent(schedule, team, nextWeek), score: 0 }
    })
  return rank(rows, [
    [c.defTakeaways, (r) => perGame(r.team, (s) => stat(s, 'sack') + stat(s, 'int') + stat(s, 'fum_rec'), DEF_KEY)],
    [c.defPointsAllowed, (r) => -perGame(r.team, (s) => stat(s, 'pts_allow'), DEF_KEY)],
    [c.defOpponentGiveaways, (r) => perGame(r.opponent as string, (s) => stat(s, 'pass_sack') + stat(s, 'pass_int') + stat(s, 'fum_lost'), OFF_KEY)],
  ])
}

// One kicker per team: the depth-chart kicker (order 1).
export function rankKickers(
  statsByWeek: Record<number, WeekStats>,
  weeks: number[],
  schedule: ScheduleGame[],
  nextWeek: number,
  players: PlayerMap,
  config: WaiverConfig
): StreamRow[] {
  const c = config.streaming
  const perGame = perGameOf(statsByWeek, weeks)
  const rows: StreamRow[] = Object.keys(players)
    .filter((id) => players[id].position === 'K' && players[id].team && players[id].depth_chart_order === 1)
    .map((id) => {
      const team = players[id].team as string
      return { playerId: id, name: players[id].full_name || id, team, opponent: nextOpponent(schedule, team, nextWeek), score: 0 }
    })
  return rank(rows, [
    [c.kFieldGoalAttempts, (r) => perGame(r.team, (s) => stat(s, 'fga'), OFF_KEY)],
    [c.kStalledDrives, (r) => perGame(r.team, (s) => stat(s, 'rz_att') - stat(s, 'rz_conv'), OFF_KEY)],
    [c.kPlays, (r) => perGame(r.team, (s) => stat(s, 'pass_att') + stat(s, 'rush_att') + stat(s, 'pass_sack'), OFF_KEY)],
  ])
}
