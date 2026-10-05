import { describe, expect, it } from 'vitest'
import { formatPct, formatTrend, formatScore, ownerLabel } from './format'

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
