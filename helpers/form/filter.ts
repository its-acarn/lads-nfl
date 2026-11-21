// The player table's filters, kept pure so they can be tested.

import { FormPosition, PlayerFormRow } from './types'

export type PositionFilter = 'All' | 'FLEX' | FormPosition
export type OwnerFilter = 'all' | 'fa' | 'other' | 'mine'

export interface PlayerFilter {
  position: PositionFilter
  owner: OwnerFilter
  minGames: number
  search: string
  // Show players who have missed `idleAfter`+ of their team's games.
  showIdle: boolean
  idleAfter: number
}

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Case, spaces and punctuation ignored: "devon ach" finds De'Von Achane.
export function nameMatches(name: string, query: string): boolean {
  return squash(name).indexOf(squash(query)) !== -1
}

export function filterPlayers(rows: PlayerFormRow[], f: PlayerFilter): PlayerFormRow[] {
  const searching = squash(f.search) !== ''
  return rows.filter(
    (r) =>
      (f.position === 'All' ||
        (f.position === 'FLEX' ? ['RB', 'WR', 'TE'].indexOf(r.position) !== -1 : r.position === f.position)) &&
      (f.owner === 'all' || r.owner.kind === f.owner) &&
      r.gamesPlayed >= f.minGames &&
      (!searching || nameMatches(r.name, f.search)) &&
      // A search is for one player: find him even if he is not playing.
      (searching || f.showIdle || r.missed < f.idleAfter)
  )
}
