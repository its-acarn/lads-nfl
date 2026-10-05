import { describe, expect, it } from 'vitest'
import { rankDefences, rankKickers } from './streaming'
import { waiverConfig } from '../../config/waivers'
import { PlayerMap, ScheduleGame, StatLine, WeekStats } from './types'

const g = (week: number, home: string, away: string): ScheduleGame => ({ week, home, away, status: week < 4 ? 'complete' : 'pre_game' })
const meta = (id: string, position: string, team: string, order: number | null = null) => ({
  [id]: { player_id: id, full_name: position === 'DEF' ? null : `K${id}`, position, team, active: true, injury_status: null, depth_chart_position: position, depth_chart_order: order },
})

// Four teams, three completed weeks, identical except where a test says.
function league(over: Record<string, { def?: StatLine; off?: StatLine }> = {}): Record<number, WeekStats> {
  const out: Record<number, WeekStats> = {}
  for (let w = 1; w <= 3; w++) {
    out[w] = {}
    ;['AAA', 'BBB', 'CCC', 'DDD'].forEach((t) => {
      out[w][t] = { team: t, stats: { sack: 2, int: 1, pts_allow: 20, ...over[t]?.def } }
      out[w][`TEAM_${t}`] = { team: t, stats: { pass_att: 30, rush_att: 25, pass_sack: 2, pass_int: 1, fum_lost: 0, fga: 2, rz_att: 3, rz_conv: 2, ...over[t]?.off } }
    })
  }
  return out
}
const players: PlayerMap = { ...meta('AAA', 'DEF', 'AAA'), ...meta('BBB', 'DEF', 'BBB'), ...meta('CCC', 'DEF', 'CCC'), ...meta('DDD', 'DEF', 'DDD') }
const schedule = [g(4, 'AAA', 'BBB'), g(4, 'CCC', 'DDD')]

describe('rankDefences', () => {
  it('ranks a defence facing a turnover-prone offence above the same defence facing a clean one', () => {
    const stats = league({ BBB: { off: { pass_int: 3, fum_lost: 2, pass_sack: 5 } } })
    const rows = rankDefences(stats, [1, 2, 3], schedule, 4, players, waiverConfig)
    const by = Object.fromEntries(rows.map((r) => [r.team, r]))
    expect(by.AAA.opponent).toBe('BBB')
    expect(by.AAA.score).toBeGreaterThan(by.CCC.score)
    expect(rows[0].team).toBe('AAA')
  })

  it('rewards own takeaways and penalises points allowed', () => {
    const stats = league({ CCC: { def: { sack: 5, int: 2, fum_rec: 1, pts_allow: 10 } } })
    const rows = rankDefences(stats, [1, 2, 3], schedule, 4, players, waiverConfig)
    expect(rows[0].team).toBe('CCC')
  })

  it('lists a team on bye last with no opponent', () => {
    const rows = rankDefences(league(), [1, 2, 3], [g(4, 'AAA', 'BBB'), g(4, 'CCC', 'EEE')], 4, players, waiverConfig)
    expect(rows[rows.length - 1]).toMatchObject({ team: 'DDD', opponent: null, score: 0 })
    expect(rows[0].name).toMatch(/DEF$/)
  })
})

describe('streaming weights', () => {
  it('each set sums to 100', () => {
    const c = waiverConfig.streaming
    expect(c.defTakeaways + c.defPointsAllowed + c.defOpponentGiveaways).toBe(100)
    expect(c.kFieldGoalAttempts + c.kStalledDrives + c.kPlays).toBe(100)
  })
})

describe('rankKickers', () => {
  it('ranks the depth-chart kicker of the team with the most field-goal chances first', () => {
    const ks: PlayerMap = { ...meta('k1', 'K', 'AAA', 1), ...meta('k2', 'K', 'BBB', 1), ...meta('k3', 'K', 'BBB', null), ...meta('k4', 'K', 'CCC', 1) }
    const stats = league({ BBB: { off: { fga: 4, rz_att: 5, rz_conv: 1 } } })
    const rows = rankKickers(stats, [1, 2, 3], schedule, 4, ks, waiverConfig)
    expect(rows.map((r) => r.playerId)).toEqual(['k2', 'k1', 'k4'])
    expect(rows[0]).toMatchObject({ name: 'Kk2', team: 'BBB', opponent: 'AAA' })
  })
})
