// Who inherits a role when a starter goes down. QB/RB/TE: if a team's order-1
// player at a depth-chart position is out, the lowest-ordered healthy player
// behind him is next man up. Receivers: Sleeper ranks the whole room in one
// order across LWR/RWR/SWR, so the three lowest orders are the starters and
// each one out promotes the next healthy receiver outside the three.

import { PlayerMap, PlayerMeta } from './types'

export interface NextManUp {
  starterId: string
  starterName: string
  starterStatus: string
}

const WR_STARTERS = 3

function byOrder(a: PlayerMeta, b: PlayerMeta): number {
  return (a.depth_chart_order as number) - (b.depth_chart_order as number)
}

export function nextManUp(players: PlayerMap, outStatuses: string[]): Record<string, NextManUp> {
  const isOut = (p: PlayerMeta): boolean => outStatuses.indexOf(p.injury_status || '') !== -1
  const groups: Record<string, PlayerMeta[]> = {}
  Object.keys(players).forEach((id) => {
    const p = players[id]
    if (!p.team || p.depth_chart_order == null) return
    let key: string | null = null
    if (p.position === 'WR') key = `${p.team}:WR`
    else if (p.position === 'QB' || p.position === 'RB' || p.position === 'TE') key = `${p.team}:${p.depth_chart_position}`
    if (!key) return
    ;(groups[key] = groups[key] || []).push(p)
  })

  const out: Record<string, NextManUp> = {}
  const promote = (backup: PlayerMeta, starter: PlayerMeta): void => {
    out[backup.player_id] = {
      starterId: starter.player_id,
      starterName: starter.full_name || starter.player_id,
      starterStatus: starter.injury_status as string,
    }
  }
  Object.keys(groups).forEach((key) => {
    const group = groups[key].sort(byOrder)
    if (key.slice(-3) === ':WR') {
      const missing = group.slice(0, WR_STARTERS).filter(isOut)
      const healthyBackups = group.slice(WR_STARTERS).filter((p) => !isOut(p))
      missing.forEach((starter, i) => {
        if (healthyBackups[i]) promote(healthyBackups[i], starter)
      })
    } else if (isOut(group[0])) {
      const backup = group.slice(1).filter((p) => !isOut(p))[0]
      if (backup) promote(backup, group[0])
    }
  })
  return out
}
