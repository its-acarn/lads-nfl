// Everything the /waivers page renders, from one set of inputs. Pure: the page
// feeds it live Sleeper data, the tests feed it fixtures/waivers/.

import { WaiverConfig } from '../../config/waivers'
import { activeIds, rosteredIds, weakestByPosition } from './availability'
import { nextManUp } from './injury'
import { buildUsage, PointsKey, teamVolume } from './metrics'
import { scorePlayers } from './score'
import { rankDefences, rankKickers } from './streaming'
import { completedWeeks, upcomingWeek } from './weeks'
import {
  InjuryAlert,
  PlayerRef,
  POSITIONS,
  Position,
  StreamRow,
  TeamVolume,
  WaiverBoard,
  WaiverInputs,
  WaiverRow,
} from './types'

export function pointsKeyFor(rec: number | undefined): PointsKey {
  if (rec === 1) return 'pts_ppr'
  if (rec === 0.5) return 'pts_half_ppr'
  return 'pts_std'
}

export function buildWaiverBoard(inputs: WaiverInputs, config: WaiverConfig, ownerId?: string): WaiverBoard {
  const { statsByWeek, schedule, players, league, rosters } = inputs
  const weeks = completedWeeks(schedule, inputs.week)
  const nextWeek = upcomingWeek(schedule)

  const usage = buildUsage(statsByWeek, weeks, players, pointsKeyFor(league.scoring_settings.rec))
  const volumes: Record<string, TeamVolume> = {}
  weeks.forEach((w) =>
    Object.keys(statsByWeek[w]).forEach((key) => {
      if (key.indexOf('TEAM_') === 0) {
        const team = key.slice(5)
        if (!volumes[team]) volumes[team] = teamVolume(statsByWeek, weeks, team)
      }
    })
  )
  const scored = scorePlayers(
    { usage, volumes, players, nextManUp: nextManUp(players, config.outStatuses), trending: inputs.trending },
    config
  )

  const rostered = rosteredIds(rosters)
  const roster = ownerId ? rosters.filter((r) => r.owner_id === ownerId)[0] : undefined
  const weakest = roster ? weakestByPosition(roster, scored, config.outStatuses) : {}
  const ref = (p: { playerId: string; name: string; score: number }): PlayerRef => ({
    playerId: p.playerId,
    name: p.name,
    score: p.score,
  })

  const positions = {} as Record<Position, WaiverRow[]>
  POSITIONS.forEach((position) => {
    const mine = weakest[position]
    positions[position] = scored
      .filter((p) => p.position === position && !rostered.has(p.playerId))
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topN)
      .map((p) => ({
        ...p,
        upgradeOver: mine && p.score - mine.score >= config.upgradeMargin ? ref(mine) : null,
      }))
  })

  const slots = league.roster_positions
  const available = (rows: StreamRow[]): StreamRow[] => rows.filter((r) => !rostered.has(r.playerId)).slice(0, config.topN)
  const kickers =
    slots.indexOf('K') !== -1 && nextWeek !== null
      ? available(rankKickers(statsByWeek, weeks, schedule, nextWeek, players, config))
      : null
  const defences =
    slots.indexOf('DEF') !== -1 && nextWeek !== null
      ? available(rankDefences(statsByWeek, weeks, schedule, nextWeek, players, config))
      : null

  const alerts: InjuryAlert[] = []
  if (roster) {
    activeIds(roster).forEach((id) => {
      const p = players[id]
      if (!p || !p.injury_status || config.injuryMultipliers[p.injury_status] === undefined) return
      const position = p.position || ''
      let best: PlayerRef | null = null
      if (POSITIONS.indexOf(position as Position) !== -1) {
        const top = positions[position as Position][0]
        best = top ? ref(top) : null
      } else if (position === 'K' && kickers && kickers[0]) best = ref(kickers[0])
      else if (position === 'DEF' && defences && defences[0]) best = ref(defences[0])
      alerts.push({ playerId: id, name: p.full_name || id, position, injuryStatus: p.injury_status, bestReplacement: best })
    })
  }

  return {
    throughWeek: weeks.length ? weeks[weeks.length - 1] : 0,
    upcomingWeek: nextWeek,
    positions,
    kickers,
    defences,
    alerts,
  }
}
