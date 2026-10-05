import { describe, expect, it } from 'vitest'
import { activeIds, dropExcludedStatuses, rosteredIds, weakestByPosition } from './availability'
import { waiverConfig } from '../../config/waivers'
import { usageOf } from './usage.testutil'
import { ScoredPlayer, WaiverRoster } from './types'

const roster = (over: Partial<WaiverRoster>): WaiverRoster => ({ roster_id: 1, owner_id: 'u1', players: [], reserve: null, taxi: null, ...over })
const scored = (id: string, position: ScoredPlayer['position'], score: number): ScoredPlayer => ({
  playerId: id, name: `P${id}`, position, team: 'NO', score, rawScore: score, breakdown: { metrics: [], nextManUpBonus: 0, injuryMultiplier: null, capped: false }, usage: usageOf(id), injuryStatus: null, flags: [], trendingRank: null,
})

describe('rosteredIds', () => {
  it('counts players, reserve (IR) and taxi on every roster', () => {
    const ids = rosteredIds([roster({ players: ['1', '2'], reserve: ['2'], taxi: ['3'] }), roster({ roster_id: 2, players: ['4'], reserve: ['5'] })])
    expect(Array.from(ids).sort()).toEqual(['1', '2', '3', '4', '5'])
  })
  it('copes with null arrays', () => {
    expect(rosteredIds([roster({ players: null })]).size).toBe(0)
  })
})

describe('activeIds', () => {
  it('is players minus reserve and taxi', () => {
    expect(activeIds(roster({ players: ['1', '2', '3'], reserve: ['2'], taxi: ['3'] }))).toEqual(['1'])
  })
})

describe('weakestByPosition', () => {
  it('finds the lowest-scored active player at each position, ignoring unscored players', () => {
    const r = roster({ players: ['a', 'b', 'c', 'unscored', 'ir'], reserve: ['ir'] })
    const list = [scored('a', 'RB', 40), scored('b', 'RB', 20), scored('c', 'WR', 55), scored('ir', 'RB', 5), scored('fa', 'RB', 1)]
    const weakest = weakestByPosition(r, list)
    expect(weakest.RB!.playerId).toBe('b')
    expect(weakest.WR!.playerId).toBe('c')
    expect(weakest.QB).toBeUndefined()
  })

  it('skips players who are out (the injury alert covers them), so drops compare against healthy players', () => {
    const r = roster({ players: ['a', 'hurt', 'q'] })
    const hurt = { ...scored('hurt', 'RB', 3), injuryStatus: 'IR' }
    const q = { ...scored('q', 'RB', 30), injuryStatus: 'Questionable' }
    const weakest = weakestByPosition(r, [scored('a', 'RB', 40), hurt, q], ['Out', 'IR'])
    expect(weakest.RB!.playerId).toBe('q')
  })
})

describe('dropExcludedStatuses', () => {
  it('covers every status that leaves a role open and every heavily discounted one, NA included', () => {
    const statuses = dropExcludedStatuses(waiverConfig)
    ;['Out', 'IR', 'Doubtful', 'PUP', 'Sus', 'NA'].forEach((s) => expect(statuses).toContain(s))
    expect(statuses).not.toContain('Questionable')
  })
})
