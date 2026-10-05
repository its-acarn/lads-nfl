import { describe, expect, it } from 'vitest'
import { trimPlayers, trimWeekStats } from './trim'

const rawPlayers: Record<string, any> = {
  '1': { player_id: '1', full_name: 'Wide Out', position: 'WR', team: 'NO', active: true, injury_status: null, depth_chart_position: 'LWR', depth_chart_order: 1, college: 'X', age: 25 },
  '2': { player_id: '2', full_name: 'Line Backer', position: 'LB', team: 'NO', active: true, injury_status: null, depth_chart_position: 'MLB', depth_chart_order: 1 },
  '3': { player_id: '3', full_name: 'Never Played', position: 'RB', team: 'NO', active: true, injury_status: null },
  '4': { player_id: '4', full_name: 'Rostered Only', position: 'TE', team: 'KC', active: true, injury_status: 'IR' },
  NO: { player_id: 'NO', full_name: null, position: 'DEF', team: 'NO', active: true },
}

describe('trimWeekStats', () => {
  it('keeps fantasy players, team and defence rows with their week team, and only STAT_KEYS', () => {
    const rows = [
      { player_id: '1', team: 'NO', player: { position: 'WR' }, stats: { off_snp: 50, rec_tgt: 7, pos_rank_ppr: 12 } },
      { player_id: '2', team: 'NO', player: { position: 'LB' }, stats: { idp_tkl: 9 } },
      { player_id: 'TEAM_NO', team: 'NO', player: {}, stats: { pass_att: 33, penalty: 4 } },
      { player_id: 'NO', team: 'NO', player: { position: 'DEF' }, stats: { pts_allow: 17, def_kr: 3 } },
    ]
    expect(trimWeekStats(rows)).toEqual({
      '1': { team: 'NO', stats: { off_snp: 50, rec_tgt: 7 } },
      TEAM_NO: { team: 'NO', stats: { pass_att: 33 } },
      NO: { team: 'NO', stats: { pts_allow: 17 } },
    })
  })
})

describe('trimPlayers', () => {
  it('keeps fantasy players seen in stats or rosters, every DEF, and only the read fields', () => {
    const out = trimPlayers(rawPlayers, new Set(['1', '2', '4']))
    expect(Object.keys(out).sort()).toEqual(['1', '4', 'NO'])
    expect(out['1']).toEqual({
      player_id: '1', full_name: 'Wide Out', position: 'WR', team: 'NO', active: true,
      injury_status: null, depth_chart_position: 'LWR', depth_chart_order: 1,
    })
    expect(out['4'].depth_chart_order).toBeNull()
  })
})
