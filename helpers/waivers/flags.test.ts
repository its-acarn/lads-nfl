import { describe, expect, it } from 'vitest'
import { flagsFor, FlagContext } from './flags'
import { waiverConfig } from '../../config/waivers'
import { usageOf } from './usage.testutil'
import { Position, PlayerUsage } from './types'

const ctx: FlagContext = { medianPpg: 10, nextManUp: null, trendingRank: null, newRole: false }
const kinds = (position: Position, u: Partial<PlayerUsage>, c: Partial<FlagContext> = {}, injury: string | null = null) =>
  flagsFor(position, usageOf('1', u), injury, { ...ctx, ...c }, waiverConfig).map((f) => f.kind)

describe('flagsFor', () => {
  it('snapSurge: last game at least 20 pts above prior, and needs prior games', () => {
    expect(kinds('WR', { lastGameSnap: 0.75, prior: { snap: 0.5, target: 0, carry: 0, airYards: 0 } })).toContain('snapSurge')
    expect(kinds('WR', { lastGameSnap: 0.65, prior: { snap: 0.5, target: 0, carry: 0, airYards: 0 } })).not.toContain('snapSurge')
    expect(kinds('WR', { lastGameSnap: 0.9, prior: null })).not.toContain('snapSurge')
  })

  it('snapSurge label states the change in points', () => {
    const f = flagsFor('WR', usageOf('1', { lastGameSnap: 0.74, prior: { snap: 0.5, target: 0, carry: 0, airYards: 0 } }), null, ctx, waiverConfig)
    expect(f.find((x) => x.kind === 'snapSurge')!.label).toBe('Snap share +24 pts')
  })

  it('targetHog: 20% for receivers, 12% for backs', () => {
    const w = (target: number) => ({ window: { snap: 0.5, target, carry: 0, airYards: 0 } })
    expect(kinds('WR', w(0.21))).toContain('targetHog')
    expect(kinds('TE', w(0.19))).not.toContain('targetHog')
    expect(kinds('RB', w(0.13))).toContain('targetHog')
    expect(kinds('RB', w(0.11))).not.toContain('targetHog')
  })

  it('workhorse: RB carry share at least 50%', () => {
    expect(kinds('RB', { window: { snap: 0.6, target: 0, carry: 0.55, airYards: 0 } })).toContain('workhorse')
    expect(kinds('RB', { window: { snap: 0.6, target: 0, carry: 0.45, airYards: 0 } })).not.toContain('workhorse')
  })

  it('buyLow: high air-yard share with PPG under the position median', () => {
    const air = { window: { snap: 0.8, target: 0.15, carry: 0, airYards: 0.3 } }
    expect(kinds('WR', { ...air, ppg: 7 })).toContain('buyLow')
    expect(kinds('WR', { ...air, ppg: 12 })).not.toContain('buyLow')
    expect(kinds('WR', { window: { snap: 0.8, target: 0.15, carry: 0, airYards: 0.2 }, ppg: 7 })).not.toContain('buyLow')
  })

  it('redZone: at least two red-zone opportunities a game', () => {
    expect(kinds('RB', { rzOppsPerGame: 2 })).toContain('redZone')
    expect(kinds('RB', { rzOppsPerGame: 1.7 })).not.toContain('redZone')
  })

  it('nextManUp, trending and newRole come from context, with readable labels', () => {
    const f = flagsFor('RB', usageOf('1'), null, { ...ctx, nextManUp: { starterId: '9', starterName: 'Alvin Kamara', starterStatus: 'IR' }, trendingRank: 3, newRole: true }, waiverConfig)
    expect(f.map((x) => x.label)).toEqual(expect.arrayContaining(['Next man up: Alvin Kamara IR', 'Trending #3', 'New role: 50% snaps last game']))
  })

  it('injured: any status except Active, labelled with the status', () => {
    const f = flagsFor('WR', usageOf('1'), 'Questionable', ctx, waiverConfig)
    expect(f.find((x) => x.kind === 'injured')!.label).toBe('Questionable')
    expect(kinds('WR', {}, {}, 'Active')).not.toContain('injured')
    expect(kinds('WR', {}, {}, null)).not.toContain('injured')
  })
})
