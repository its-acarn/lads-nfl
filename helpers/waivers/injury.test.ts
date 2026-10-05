import { describe, expect, it } from 'vitest'
import { nextManUp } from './injury'
import { waiverConfig } from '../../config/waivers'
import { PlayerMap } from './types'

function roster(rows: [string, string, string, string, number | null, string | null][]): PlayerMap {
  const out: PlayerMap = {}
  rows.forEach(([id, position, team, chart, order, injury]) => {
    out[id] = { player_id: id, full_name: `P${id}`, position, team, active: true, injury_status: injury, depth_chart_position: chart, depth_chart_order: order }
  })
  return out
}
const OUT = waiverConfig.outStatuses

describe('nextManUp', () => {
  it('promotes the RB2 when the RB1 is out, and nobody when the RB1 is only questionable', () => {
    const players = roster([
      ['1', 'RB', 'NO', 'RB', 1, 'IR'],
      ['2', 'RB', 'NO', 'RB', 2, null],
      ['3', 'RB', 'KC', 'RB', 1, 'Questionable'],
      ['4', 'RB', 'KC', 'RB', 2, null],
    ])
    expect(nextManUp(players, OUT)).toEqual({ '2': { starterId: '1', starterName: 'P1', starterStatus: 'IR' } })
  })

  it('skips an injured backup', () => {
    const players = roster([
      ['1', 'TE', 'NO', 'TE', 1, 'Out'],
      ['2', 'TE', 'NO', 'TE', 2, 'Out'],
      ['3', 'TE', 'NO', 'TE', 3, null],
    ])
    expect(Object.keys(nextManUp(players, OUT))).toEqual(['3'])
  })

  it('treats the receiver room as one group across LWR/RWR/SWR, three starters deep', () => {
    // New Orleans' real order on 2026-10-05, with Olave hurt.
    const players = roster([
      ['olave', 'WR', 'NO', 'RWR', 1, 'Out'],
      ['vele', 'WR', 'NO', 'SWR', 2, null],
      ['lance', 'WR', 'NO', 'LWR', 3, null],
      ['brown', 'WR', 'NO', 'SWR', 4, null],
      ['austin', 'WR', 'NO', 'RWR', 5, null],
    ])
    expect(nextManUp(players, OUT)).toEqual({ brown: { starterId: 'olave', starterName: 'Polave', starterStatus: 'Out' } })
  })

  it('promotes one receiver per missing starter', () => {
    const players = roster([
      ['a', 'WR', 'NO', 'RWR', 1, 'Out'],
      ['b', 'WR', 'NO', 'SWR', 2, 'IR'],
      ['c', 'WR', 'NO', 'LWR', 3, null],
      ['d', 'WR', 'NO', 'SWR', 4, null],
      ['e', 'WR', 'NO', 'RWR', 5, null],
    ])
    expect(Object.keys(nextManUp(players, OUT)).sort()).toEqual(['d', 'e'])
  })

  it('never promotes a player with no depth-chart order, or a free agent with no team', () => {
    const players = roster([
      ['1', 'RB', 'NO', 'RB', 1, 'Out'],
      ['2', 'RB', 'NO', 'RB', null, null],
      ['3', 'RB', '', 'RB', 2, null],
    ])
    expect(nextManUp(players, OUT)).toEqual({})
  })
})
