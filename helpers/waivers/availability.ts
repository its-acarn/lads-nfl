// Who is on a roster, and the chosen team's weakest player at each position
// (the suggested drop when a free agent clearly beats him).

import { POSITIONS, Position, ScoredPlayer, WaiverRoster } from './types'

export function rosteredIds(rosters: WaiverRoster[]): Set<string> {
  const ids = new Set<string>()
  rosters.forEach((r) => [r.players, r.reserve, r.taxi].forEach((list) => (list || []).forEach((id) => ids.add(id))))
  return ids
}

// Players taking a roster spot: everyone except IR (reserve) and taxi.
export function activeIds(roster: WaiverRoster): string[] {
  const parked = (roster.reserve || []).concat(roster.taxi || [])
  return (roster.players || []).filter((id) => parked.indexOf(id) === -1)
}

// Drop candidates are scored players who are not out. An unscored player is
// usually hurt or new and the score has nothing to say about him; a player who
// is out is already named in the injury alerts, and comparing every free agent
// against his injury-discounted score would make him the drop every time.
export function weakestByPosition(
  roster: WaiverRoster,
  scored: ScoredPlayer[],
  outStatuses: string[] = []
): Partial<Record<Position, ScoredPlayer>> {
  const mine = activeIds(roster)
  const out: Partial<Record<Position, ScoredPlayer>> = {}
  POSITIONS.forEach((position) => {
    scored
      .filter((p) => p.position === position && mine.indexOf(p.playerId) !== -1)
      .filter((p) => outStatuses.indexOf(p.injuryStatus || '') === -1)
      .forEach((p) => {
        const current = out[position]
        if (!current || p.score < current.score) out[position] = p
      })
  })
  return out
}
