import { describe, expect, it } from 'vitest'
import { formatMetricValues, formatPct, formatTrend, formatScore, metricLabel, ownerLabel } from './format'

describe('format', () => {
  it('formatPct rounds a share to a whole percent', () => {
    expect(formatPct(0.234)).toBe('23%')
    expect(formatPct(0)).toBe('0%')
  })
  it('formatTrend shows the change in points with a sign, or nothing without prior games', () => {
    expect(formatTrend(0.62, 0.5)).toBe('+12')
    expect(formatTrend(0.45, 0.5)).toBe('−5')
    expect(formatTrend(0.5, 0.502)).toBe('±0')
    expect(formatTrend(0.5, null)).toBe('')
  })
  it('formatScore is a whole number', () => {
    expect(formatScore(64.5)).toBe('65')
  })
  it('ownerLabel prefers the team name and falls back to the display name', () => {
    expect(ownerLabel({ user_id: '1', display_name: 'yaks', metadata: { team_name: 'Yak Attack' } })).toBe('Yak Attack (yaks)')
    expect(ownerLabel({ user_id: '1', display_name: 'yaks' })).toBe('yaks')
  })
})

describe('metric display', () => {
  it('names every metric in config', async () => {
    const { waiverConfig } = await import('../../config/waivers')
    Object.values(waiverConfig.weights).forEach((w) => Object.keys(w).forEach((m) => expect(metricLabel(m)).not.toBe(m)))
  })
  it('formats shares as percents, trends as signed points and per-game counts to one decimal', () => {
    expect(formatMetricValues('targetShare', [0.234])).toBe('23%')
    expect(formatMetricValues('snapShareTrend', [0.12])).toBe('+12 pts')
    expect(formatMetricValues('carryShareTrend', [-0.05])).toBe('−5 pts')
    expect(formatMetricValues('rzOpps', [2.333])).toBe('2.3')
    expect(formatMetricValues('rushing', [4, 20.5])).toBe('4.0 att, 20.5 yd')
    expect(formatMetricValues('teamRushVolume', [25, 3])).toBe('25.0 att, 3.0 RZ trips')
  })
})
