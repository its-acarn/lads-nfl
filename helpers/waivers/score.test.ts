import { describe, expect, it } from 'vitest'
import { percentiles, scorePlayers, ScoreInputs } from './score'
import { waiverConfig } from '../../config/waivers'
import { usageOf } from './usage.testutil'
import { PlayerMap, PlayerUsage } from './types'

function inputs(rows: [string, string, Partial<PlayerUsage>, string | null?][], extra: Partial<ScoreInputs> = {}): ScoreInputs {
  const players: PlayerMap = {}
  const usage: Record<string, PlayerUsage> = {}
  rows.forEach(([id, position, u, injury]) => {
    players[id] = { player_id: id, full_name: `P${id}`, position, team: 'NO', active: true, injury_status: injury ?? null, depth_chart_position: position, depth_chart_order: null }
    usage[id] = usageOf(id, u)
  })
  return { usage, players, volumes: {}, nextManUp: {}, trending: [], ...extra }
}
const byId = (list: ReturnType<typeof scorePlayers>) => Object.fromEntries(list.map((p) => [p.playerId, p]))
const w = (target: number) => ({ window: { snap: 0.8, target, carry: 0, airYards: target } })

describe('percentiles', () => {
  it('ranks 0..100 with ties sharing the average rank', () => {
    expect(percentiles([10, 20, 20, 30])).toEqual([0, 50, 50, 100])
    expect(percentiles([30, 10])).toEqual([100, 0])
  })
  it('gives a lone value the midpoint', () => {
    expect(percentiles([7])).toEqual([50])
  })
})

describe('config weights', () => {
  it.each(['QB', 'RB', 'WR', 'TE'] as const)('%s sums to 100', (pos) => {
    const weights = waiverConfig.weights[pos] as Record<string, number>
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('scorePlayers', () => {
  it('ranks a receiver with more targets and air yards above an otherwise identical one', () => {
    const s = byId(scorePlayers(inputs([['a', 'WR', w(0.25)], ['b', 'WR', w(0.1)], ['c', 'WR', w(0.15)]]), waiverConfig))
    expect(s.a.score).toBeGreaterThan(s.c.score)
    expect(s.c.score).toBeGreaterThan(s.b.score)
  })

  it('scores each position only against its own position', () => {
    const s = byId(scorePlayers(inputs([['wr', 'WR', w(0.3)], ['te', 'TE', w(0.05)]]), waiverConfig))
    expect(s.te.rawScore).toBe(s.wr.rawScore)
  })

  it('drops a player who barely played, admits a new role only from the team\'s latest game', () => {
    const s = byId(
      scorePlayers(
        inputs([
          ['regular', 'RB', {}],
          ['cameo', 'RB', { playedOfLastThreeTeamGames: 1, lastGameSnap: 0.3 }],
          ['newRole', 'RB', { playedOfLastThreeTeamGames: 1, lastGameSnap: 0.6 }],
          ['stale', 'RB', { playedOfLastThreeTeamGames: 1, lastGameSnap: 0.6, playedLastTeamGame: false }],
        ]),
        waiverConfig
      )
    )
    expect(Object.keys(s).sort()).toEqual(['newRole', 'regular'])
    expect(s.newRole.flags.map((f) => f.kind)).toContain('newRole')
  })

  it('applies the injury multiplier to the player\'s own score', () => {
    const s = byId(scorePlayers(inputs([['a', 'WR', w(0.2)], ['b', 'WR', w(0.2), 'Questionable'], ['c', 'WR', w(0.1), 'IR'], ['d', 'WR', w(0.3)]]), waiverConfig))
    expect(s.b.rawScore).toBe(s.a.rawScore)
    expect(s.b.score).toBeCloseTo(s.a.rawScore * 0.9, 1)
    expect(s.c.score).toBeCloseTo(s.c.rawScore * 0.3, 1)
    expect(s.b.injuryStatus).toBe('Questionable')
  })

  it('adds the next-man-up bonus and caps at 100', () => {
    const nmu = { starterId: 'x', starterName: 'Starter', starterStatus: 'Out' }
    const s = byId(
      scorePlayers(
        inputs([['top', 'RB', { window: { snap: 0.9, target: 0.2, carry: 0.6, airYards: 0 }, rzOppsPerGame: 3, ppg: 20 }], ['low', 'RB', {}]], {
          nextManUp: { top: nmu, low: nmu },
        }),
        waiverConfig
      )
    )
    expect(s.top.score).toBe(100)
    expect(s.low.score).toBeCloseTo(s.low.rawScore + 15, 1)
    expect(s.low.flags.map((f) => f.kind)).toContain('nextManUp')
  })

  it('records the trending rank without changing the score', () => {
    const base = inputs([['a', 'WR', w(0.2)], ['b', 'WR', w(0.2)]])
    const s = byId(scorePlayers({ ...base, trending: [{ player_id: 'zz', count: 9 }, { player_id: 'b', count: 5 }] }, waiverConfig))
    expect(s.b.trendingRank).toBe(2)
    expect(s.a.trendingRank).toBeNull()
    expect(s.b.score).toBe(s.a.score)
  })

  it('uses team volume for the team metrics', () => {
    const base = inputs([['a', 'WR', { ...w(0.2), team: 'BUF' }], ['b', 'WR', { ...w(0.2), team: 'MIA' }]])
    const vol = (team: string, passAttPerGame: number) => ({ team, games: 3, passAttPerGame, rushAttPerGame: 25, rzAttPerGame: 3, playsPerGame: 60 })
    const s = byId(scorePlayers({ ...base, volumes: { BUF: vol('BUF', 40), MIA: vol('MIA', 25) } }, waiverConfig))
    expect(s.a.score - s.b.score).toBeCloseTo(10, 1) // teamPassVolume weight
  })
})

describe('score breakdown', () => {
  const withPrior = (snapTrend: number) => ({ window: { snap: 0.5 + snapTrend, target: 0.2, carry: 0, airYards: 0.2 }, prior: { snap: 0.5, target: 0.2, carry: 0, airYards: 0.2 } })

  it('lists each metric with value, percentile, weight and points that sum to the raw score', () => {
    const s = byId(scorePlayers(inputs([['a', 'WR', w(0.25)], ['b', 'WR', w(0.1)], ['c', 'WR', w(0.15)]]), waiverConfig))
    const rows = s.a.breakdown.metrics
    expect(rows.map((r) => r.metric)).toContain('targetShare')
    const target = rows.find((r) => r.metric === 'targetShare')!
    expect(target.values).toEqual([0.25])
    expect(target.percentile).toBe(100)
    expect(target.points).toBeCloseTo((target.weight * 100) / 100)
    expect(rows.reduce((acc, r) => acc + r.points, 0)).toBeCloseTo(s.a.rawScore)
  })

  it('drops the trend metrics for a player with no earlier games and spreads their weight over the rest', () => {
    const s = byId(scorePlayers(inputs([['new', 'WR', { ...w(0.2), prior: null }], ['old', 'WR', withPrior(0.1)]]), waiverConfig))
    const kinds = s.new.breakdown.metrics.map((r) => r.metric)
    expect(kinds).not.toContain('targetShareTrend')
    expect(kinds).not.toContain('snapShareTrend')
    expect(s.new.breakdown.metrics.reduce((acc, r) => acc + r.weight, 0)).toBeCloseTo(100)
    expect(s.new.breakdown.metrics.find((r) => r.metric === 'targetShare')!.weight).toBeCloseTo((30 * 100) / 70)
    expect(s.old.breakdown.metrics.map((r) => r.metric)).toContain('snapShareTrend')
  })

  it('ranks trends only among players who have earlier games', () => {
    const s = byId(
      scorePlayers(inputs([['up', 'WR', withPrior(0.3)], ['flat', 'WR', withPrior(0.1)], ['new', 'WR', { ...w(0.2), prior: null }]]), waiverConfig)
    )
    const trendPct = (id: string) => s[id].breakdown.metrics.find((r) => r.metric === 'snapShareTrend')!.percentile
    expect(trendPct('up')).toBe(100)
    expect(trendPct('flat')).toBe(0)
  })

  it('records the adjustments after the raw score', () => {
    const nmu = { starterId: 'x', starterName: 'Starter', starterStatus: 'Out' }
    const s = byId(scorePlayers(inputs([['a', 'RB', {}, 'Questionable'], ['b', 'RB', {}]], { nextManUp: { a: nmu } }), waiverConfig))
    expect(s.a.breakdown).toMatchObject({ nextManUpBonus: 15, injuryMultiplier: 0.9, capped: false })
    expect(s.b.breakdown).toMatchObject({ nextManUpBonus: 0, injuryMultiplier: null, capped: false })
    expect(s.a.score).toBeCloseTo((s.a.rawScore + 15) * 0.9)
  })
})
