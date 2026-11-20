import { describe, expect, it } from 'vitest'
import { meta } from './inputs.testutil'
import { ownerMap } from './owners'
import { buildTeamForm } from './teamForm'
import { PlayerGame } from './types'

const g = (week: number, points: number): PlayerGame => ({ week, team: 'NO', opponent: 'ATL', points })
const players = Object.fromEntries(
  [
    meta('r20', 'RB', 'NO'),
    meta('r15', 'RB', 'NO'),
    meta('r10', 'RB', 'NO'),
    meta('w12', 'WR', 'NO'),
    meta('w8', 'WR', 'NO'),
    meta('ir', 'WR', 'NO', { injury_status: 'IR' }),
    meta('none', 'TE', 'NO'),
  ].map((p) => [p.player_id, p])
)
const games: Record<string, PlayerGame[]> = {
  r20: [g(1, 20)],
  r15: [g(1, 15)],
  r10: [g(1, 10)],
  w12: [g(1, 12)],
  w8: [g(1, 8)],
  ir: [g(1, 30)],
}

describe('buildTeamForm', () => {
  it('fills fixed slots before FLEX', () => {
    const rosters = [
      { roster_id: 1, owner_id: 'me', players: ['r20', 'r15', 'r10', 'w12', 'w8'], reserve: null, taxi: null },
    ]
    const [t] = buildTeamForm(rosters, players, games, 3, ['RB', 'RB', 'WR', 'WR', 'FLEX', 'BN'], ownerMap(rosters, []))
    expect(t.groups.RB).toBe(35)
    expect(t.groups.WR).toBe(20)
    expect(t.groups.FLEX).toBe(10)
    expect(t.total).toBe(65)
    expect(t.bench).toBe(0)
  })

  it('includes reserve (IR) players', () => {
    const rosters = [{ roster_id: 1, owner_id: 'me', players: ['w8'], reserve: ['ir'], taxi: null }]
    const [t] = buildTeamForm(rosters, players, games, 3, ['WR', 'WR'], ownerMap(rosters, []))
    expect(t.groups.WR).toBe(38)
  })

  it('uses the window average, and omits players with no games', () => {
    // The window is last-X games played, so anyone with a game has a window
    // average; the spec's season-average fallback never comes into play.
    const twoGames: Record<string, PlayerGame[]> = { r20: [g(1, 4), g(2, 20)] }
    const rosters = [{ roster_id: 1, owner_id: 'me', players: ['r20', 'none'], reserve: null, taxi: null }]
    const [t] = buildTeamForm(rosters, players, twoGames, 1, ['RB', 'TE'], ownerMap(rosters, []))
    expect(t.groups.RB).toBe(20)
    expect(t.groups.TE).toBe(0)
  })

  it('counts the best unused RB, WR and TE as bench depth', () => {
    const rosters = [
      { roster_id: 1, owner_id: 'me', players: ['r20', 'r15', 'r10', 'w12', 'w8'], reserve: null, taxi: null },
    ]
    const [t] = buildTeamForm(rosters, players, games, 3, ['RB', 'WR'], ownerMap(rosters, []))
    expect(t.bench).toBe(15 + 8)
  })

  it('ranks 1 = highest per column', () => {
    const rosters = [
      { roster_id: 1, owner_id: 'a', players: ['r20', 'w8'], reserve: null, taxi: null },
      { roster_id: 2, owner_id: 'b', players: ['r10', 'w12'], reserve: null, taxi: null },
    ]
    const rows = buildTeamForm(rosters, players, games, 3, ['RB', 'WR'], ownerMap(rosters, []))
    const byId = Object.fromEntries(rows.map((r) => [r.rosterId, r]))
    expect(byId[1].rank.RB).toBe(1)
    expect(byId[2].rank.WR).toBe(1)
    expect(byId[1].rank.total).toBe(1)
  })
})
