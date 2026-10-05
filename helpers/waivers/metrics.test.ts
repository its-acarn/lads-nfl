import { describe, expect, it } from 'vitest'
import { buildUsage, stat, teamVolume } from './metrics'
import { PlayerMap, StatLine, WeekStats } from './types'
import { loadWaiverFixture } from './fixtures.testutil'
import { completedWeeks } from './weeks'

const team = (t: string, stats: StatLine) => ({ [`TEAM_${t}`]: { team: t, stats } })
const line = (t: string, stats: StatLine) => ({ team: t, stats })
const meta = (id: string, position: string, t: string): PlayerMap => ({
  [id]: { player_id: id, full_name: `P${id}`, position, team: t, active: true, injury_status: null, depth_chart_position: position, depth_chart_order: 1 },
})
const NO = { pass_att: 30, rush_att: 25, pass_air_yd: 250, rz_att: 4, pass_sack: 2 }

describe('stat', () => {
  it('reads missing keys as zero', () => {
    expect(stat({ rec_tgt: 4 }, 'pass_int')).toBe(0)
    expect(stat(undefined, 'rec_tgt')).toBe(0)
  })
})

describe('buildUsage', () => {
  it('uses the last three played games as the window and the rest as prior, skipping byes and absences', () => {
    const stats: Record<number, WeekStats> = {
      1: { ...team('NO', NO), '1': line('NO', { off_snp: 20, tm_off_snp: 60, rec_tgt: 2 }) },
      2: { ...team('NO', NO), '1': line('NO', { off_snp: 50, tm_off_snp: 60, rec_tgt: 8 }) },
      3: { ...team('KC', NO) }, // NO bye
      4: { ...team('NO', NO), '1': line('NO', { tm_off_snp: 60 }) }, // inactive
      5: { ...team('NO', NO), '1': line('NO', { off_snp: 55, tm_off_snp: 60, rec_tgt: 9 }) },
      6: { ...team('NO', NO), '1': line('NO', { off_snp: 60, tm_off_snp: 60, rec_tgt: 10 }) },
    }
    const u = buildUsage(stats, [1, 2, 3, 4, 5, 6], meta('1', 'WR', 'NO'), 'pts_ppr')['1']
    expect(u.gamesInWindow).toBe(3)
    expect(u.window.snap).toBeCloseTo(165 / 180)
    expect(u.prior!.snap).toBeCloseTo(20 / 60)
    expect(u.window.target).toBeCloseTo(27 / 90)
    expect(u.lastGameSnap).toBe(1)
    expect(u.playedOfLastThreeTeamGames).toBe(2) // weeks 4,5,6; inactive in 4
  })

  it('computes shares sum-over-sum, so a short week cannot swing them', () => {
    const stats: Record<number, WeekStats> = {
      1: { ...team('NO', { rush_att: 40 }), '1': line('NO', { off_snp: 40, tm_off_snp: 80, rush_att: 20 }) },
      2: { ...team('NO', { rush_att: 4 }), '1': line('NO', { off_snp: 10, tm_off_snp: 10, rush_att: 4 }) },
    }
    const u = buildUsage(stats, [1, 2], meta('1', 'RB', 'NO'), 'pts_ppr')['1']
    expect(u.window.carry).toBeCloseTo(24 / 44)
    expect(u.window.snap).toBeCloseTo(50 / 90)
    expect(u.prior).toBeNull()
  })

  it('divides each week by the team he played for that week, after a trade', () => {
    const stats: Record<number, WeekStats> = {
      1: { ...team('NO', { pass_att: 40 }), ...team('KC', { pass_att: 20 }), '1': line('NO', { off_snp: 30, tm_off_snp: 60, rec_tgt: 4 }) },
      2: { ...team('NO', { pass_att: 40 }), ...team('KC', { pass_att: 20 }), '1': line('KC', { off_snp: 30, tm_off_snp: 60, rec_tgt: 6 }) },
    }
    const u = buildUsage(stats, [1, 2], meta('1', 'WR', 'KC'), 'pts_ppr')['1']
    expect(u.window.target).toBeCloseTo(10 / 60)
    expect(u.team).toBe('KC')
  })

  it('ignores weeks not passed in (incomplete) and players outside QB/RB/WR/TE', () => {
    const stats: Record<number, WeekStats> = {
      1: { ...team('NO', NO), '1': line('NO', { off_snp: 30, tm_off_snp: 60 }), '2': line('NO', { off_snp: 0 }) },
      2: { ...team('NO', NO), '1': line('NO', { off_snp: 60, tm_off_snp: 60 }) },
    }
    const players = { ...meta('1', 'WR', 'NO'), ...meta('2', 'K', 'NO') }
    const usage = buildUsage(stats, [1], players, 'pts_ppr')
    expect(usage['1'].window.snap).toBeCloseTo(0.5)
    expect(usage['2']).toBeUndefined()
  })

  it('reports per-game red-zone opportunities, points and QB volume', () => {
    const stats: Record<number, WeekStats> = {
      1: { ...team('NO', NO), '1': line('NO', { off_snp: 60, tm_off_snp: 60, rec_rz_tgt: 1, rush_rz_att: 2, pts_half_ppr: 10, pts_ppr: 12, rush_att: 5, rush_yd: 30, pass_att: 35, pass_rz_att: 4 }) },
      2: { ...team('NO', NO), '1': line('NO', { off_snp: 60, tm_off_snp: 60, rush_rz_att: 1, pts_half_ppr: 20, pts_ppr: 22, rush_att: 3, rush_yd: 10, pass_att: 25, pass_rz_att: 2 }) },
    }
    const u = buildUsage(stats, [1, 2], meta('1', 'QB', 'NO'), 'pts_half_ppr')['1']
    expect(u.rzOppsPerGame).toBe(2)
    expect(u.ppg).toBe(15)
    expect(u.rushAttPerGame).toBe(4)
    expect(u.rushYdPerGame).toBe(20)
    expect(u.passAttPerGame).toBe(30)
    expect(u.passRzAttPerGame).toBe(3)
  })
})

describe('teamVolume', () => {
  it('averages the last three team games', () => {
    const stats: Record<number, WeekStats> = {
      1: team('NO', { pass_att: 100, rush_att: 0 }),
      2: team('NO', { pass_att: 30, rush_att: 20, rz_att: 3, pass_sack: 1 }),
      3: team('KC', {}),
      4: team('NO', { pass_att: 40, rush_att: 30, rz_att: 5, pass_sack: 3 }),
      5: team('NO', { pass_att: 35, rush_att: 25, rz_att: 4, pass_sack: 2 }),
    }
    const v = teamVolume(stats, [1, 2, 3, 4, 5], 'NO')
    expect(v.games).toBe(3)
    expect(v.passAttPerGame).toBe(35)
    expect(v.rushAttPerGame).toBe(25)
    expect(v.rzAttPerGame).toBe(4)
    expect(v.playsPerGame).toBe(62)
  })
})

describe('buildUsage on the fixture', () => {
  it('gives every team at least one player with a snap share above 0.9 (their QB)', () => {
    const inputs = loadWaiverFixture('lads')
    const weeks = completedWeeks(inputs.schedule, inputs.week)
    const usage = buildUsage(inputs.statsByWeek, weeks, inputs.players, 'pts_half_ppr')
    const fullTimeTeams = new Set(Object.values(usage).filter((u) => u.window.snap > 0.9).map((u) => u.team))
    expect(fullTimeTeams.size).toBeGreaterThanOrEqual(30)
  })
})
