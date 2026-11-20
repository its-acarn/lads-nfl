// Every game each player actually played, in league points. A game counts
// only in a completed week and only if he played: offensive snaps for
// QB/RB/WR/TE, games-played for K and DEF (Sleeper lists inactive kickers
// with no gp). Byes and absences are simply missing, never zero games. The
// team and opponent are that week's, so a traded player splits correctly.

import { stat } from '../waivers/metrics'
import { nextOpponent, completedWeeks } from '../waivers/weeks'
import { WaiverInputs } from '../waivers/types'
import { pointsFor } from './scoring'
import { FORM_POSITIONS, FormPosition, FormWindow, PlayerGame } from './types'

export function isFormPosition(position: string | null): position is FormPosition {
  return FORM_POSITIONS.indexOf(position as FormPosition) !== -1
}

export function playerGames(inputs: WaiverInputs): Record<string, PlayerGame[]> {
  const { statsByWeek, schedule, players, league } = inputs
  const out: Record<string, PlayerGame[]> = {}
  completedWeeks(schedule, inputs.week).forEach((week) => {
    const rows = statsByWeek[week] || {}
    Object.keys(rows).forEach((id) => {
      const meta = players[id]
      if (!meta || !isFormPosition(meta.position)) return
      const line = rows[id].stats
      const kickerOrDefence = meta.position === 'K' || meta.position === 'DEF'
      const played = kickerOrDefence ? stat(line, 'gp') > 0 : stat(line, 'off_snp') > 0
      if (!played) return
      const team = rows[id].team || (meta.position === 'DEF' ? id : meta.team)
      if (!team) return
      const opponent = nextOpponent(schedule, team, week)
      if (!opponent) return
      ;(out[id] = out[id] || []).push({ week, team, opponent, points: pointsFor(line, league.scoring_settings) })
    })
  })
  return out
}

export function windowGames<T>(games: T[], window: FormWindow): T[] {
  return window === 'season' ? games.slice() : games.slice(-window)
}
