// Raw weekly stats -> per-player usage. The window is a player's last three
// PLAYED games (off_snp > 0), so byes and injury absences never count as
// zeros; shares are sum-over-sum, so a ten-snap week cannot swing them. Each
// week divides by the team he played for that week.

import { teamGameWeeks } from './weeks'
import { PlayerMap, PlayerUsage, POSITIONS, Position, ShareSet, StatKey, StatLine, TeamVolume, WeekStats } from './types'

export const WINDOW = 3

export type PointsKey = 'pts_ppr' | 'pts_half_ppr' | 'pts_std'

export function stat(line: StatLine | undefined, key: StatKey): number {
  const v = line ? line[key] : undefined
  return typeof v === 'number' ? v : 0
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0
}

function sum(weeks: number[], f: (w: number) => number): number {
  return weeks.reduce((acc, w) => acc + f(w), 0)
}

export function buildUsage(
  statsByWeek: Record<number, WeekStats>,
  weeks: number[],
  players: PlayerMap,
  pointsKey: PointsKey
): Record<string, PlayerUsage> {
  const ids = new Set<string>()
  weeks.forEach((w) => Object.keys(statsByWeek[w] || {}).forEach((id) => ids.add(id)))

  const out: Record<string, PlayerUsage> = {}
  ids.forEach((id) => {
    const meta = players[id]
    if (!meta || POSITIONS.indexOf(meta.position as Position) === -1) return

    const own = (w: number): StatLine | undefined => statsByWeek[w][id]?.stats
    const teamOf = (w: number): StatLine | undefined => {
      const t = statsByWeek[w][id]?.team
      return t ? statsByWeek[w][`TEAM_${t}`]?.stats : undefined
    }
    const played = weeks.filter((w) => statsByWeek[w] && stat(own(w), 'off_snp') > 0)
    if (played.length === 0) return

    const window = played.slice(-WINDOW)
    const prior = played.slice(0, -WINDOW)
    const shares = (ws: number[]): ShareSet => ({
      snap: ratio(sum(ws, (w) => stat(own(w), 'off_snp')), sum(ws, (w) => stat(own(w), 'tm_off_snp'))),
      target: ratio(sum(ws, (w) => stat(own(w), 'rec_tgt')), sum(ws, (w) => stat(teamOf(w), 'pass_att'))),
      carry: ratio(sum(ws, (w) => stat(own(w), 'rush_att')), sum(ws, (w) => stat(teamOf(w), 'rush_att'))),
      airYards: ratio(sum(ws, (w) => stat(own(w), 'rec_air_yd')), sum(ws, (w) => stat(teamOf(w), 'pass_air_yd'))),
    })
    const perGame = (f: (w: number) => number): number => sum(window, f) / window.length

    const last = played[played.length - 1]
    const team = meta.team || statsByWeek[last][id].team || ''
    const lastThreeTeamGames = teamGameWeeks(statsByWeek, weeks, team).slice(-WINDOW)

    out[id] = {
      playerId: id,
      team,
      window: shares(window),
      prior: prior.length > 0 ? shares(prior) : null,
      lastGameSnap: ratio(stat(own(last), 'off_snp'), stat(own(last), 'tm_off_snp')),
      gamesInWindow: window.length,
      playedOfLastThreeTeamGames: lastThreeTeamGames.filter((w) => played.indexOf(w) !== -1).length,
      playedLastTeamGame: lastThreeTeamGames[lastThreeTeamGames.length - 1] === last,
      rzOppsPerGame: perGame((w) => stat(own(w), 'rec_rz_tgt') + stat(own(w), 'rush_rz_att')),
      ppg: perGame((w) => stat(own(w), pointsKey)),
      rushAttPerGame: perGame((w) => stat(own(w), 'rush_att')),
      rushYdPerGame: perGame((w) => stat(own(w), 'rush_yd')),
      passAttPerGame: perGame((w) => stat(own(w), 'pass_att')),
      passRzAttPerGame: perGame((w) => stat(own(w), 'pass_rz_att')),
    }
  })
  return out
}

// Team offensive volume over its last three team games.
export function teamVolume(statsByWeek: Record<number, WeekStats>, weeks: number[], team: string): TeamVolume {
  const games = teamGameWeeks(statsByWeek, weeks, team).slice(-WINDOW)
  const t = (w: number): StatLine => statsByWeek[w][`TEAM_${team}`].stats
  const perGame = (f: (w: number) => number): number => (games.length ? sum(games, f) / games.length : 0)
  return {
    team,
    games: games.length,
    passAttPerGame: perGame((w) => stat(t(w), 'pass_att')),
    rushAttPerGame: perGame((w) => stat(t(w), 'rush_att')),
    rzAttPerGame: perGame((w) => stat(t(w), 'rz_att')),
    playsPerGame: perGame((w) => stat(t(w), 'pass_att') + stat(t(w), 'rush_att') + stat(t(w), 'pass_sack')),
  }
}
