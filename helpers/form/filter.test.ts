import { describe, expect, it } from 'vitest'
import { filterPlayers, nameMatches, PlayerFilter } from './filter'
import { PlayerFormRow } from './types'

const r = (playerId: string, name: string, extra: Partial<PlayerFormRow> = {}): PlayerFormRow =>
  ({
    playerId,
    name,
    position: 'RB',
    owner: { kind: 'fa' },
    gamesPlayed: 3,
    missed: 0,
    ...extra,
  }) as PlayerFormRow

const base: PlayerFilter = { position: 'All', owner: 'all', minGames: 1, search: '', showIdle: false, idleAfter: 2 }

describe('nameMatches', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(nameMatches("De'Von Achane", 'devon ach')).toBe(true)
    expect(nameMatches('Michael Penix Jr.', 'penix jr')).toBe(true)
    expect(nameMatches('Kirk Cousins', 'love')).toBe(false)
    expect(nameMatches('Kirk Cousins', '')).toBe(true)
  })
})

describe('filterPlayers', () => {
  const rows = [
    r('a', 'Active Back'),
    r('b', 'Hurt Back', { missed: 2 }),
    r('c', 'Wide Guy', { position: 'WR', owner: { kind: 'mine', label: 'me' } }),
    r('d', 'Kicker', { position: 'K', gamesPlayed: 1 }),
  ]
  const ids = (f: Partial<PlayerFilter>) => filterPlayers(rows, { ...base, ...f }).map((x) => x.playerId)

  it('hides players who have missed the idle limit, unless asked', () => {
    expect(ids({})).toEqual(['a', 'c', 'd'])
    expect(ids({ showIdle: true })).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a name search finds idle players too', () => {
    expect(ids({ search: 'hurt' })).toEqual(['b'])
  })

  it('position, FLEX, owner and min games', () => {
    expect(ids({ position: 'FLEX' })).toEqual(['a', 'c'])
    expect(ids({ position: 'K' })).toEqual(['d'])
    expect(ids({ owner: 'mine' })).toEqual(['c'])
    expect(ids({ minGames: 2 })).toEqual(['a', 'c'])
  })
})
