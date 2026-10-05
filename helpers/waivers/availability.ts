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

// Only scored players are drop candidates: an unscored player is usually hurt
// or new, and the score has nothing to say about him.
export function weakestByPosition(roster: WaiverRoster, scored: ScoredPlayer[]): Partial<Record<Position, ScoredPlayer>> {
  const mine = activeIds(roster)
  const out: Partial<Record<Position, ScoredPlayer>> = {}
  POSITIONS.forEach((position) => {
    scored
      .filter((p) => p.position === position && mine.indexOf(p.playerId) !== -1)
      .forEach((p) => {
        const current = out[position]
        if (!current || p.score < current.score) out[position] = p
      })
  })
  return out
}
