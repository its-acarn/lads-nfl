// Display formatting for the /waivers page.

import { WaiverUser } from './types'

export function formatPct(share: number): string {
  return `${Math.round(share * 100)}%`
}

// Change in percentage points between window and prior shares.
export function formatTrend(window: number, prior: number | null): string {
  if (prior === null) return ''
  const pts = Math.round((window - prior) * 100)
  if (pts === 0) return '±0'
  return pts > 0 ? `+${pts}` : `−${-pts}`
}

export function formatScore(score: number): string {
  return String(Math.round(score))
}

export function ownerLabel(user: WaiverUser): string {
  const team = user.metadata?.team_name
  return team ? `${team} (${user.display_name})` : user.display_name
}

const METRIC_LABELS: Record<string, string> = {
  targetShare: 'Target share',
  airYardShare: 'Air-yard share',
  targetShareTrend: 'Target share trend',
  snapShareTrend: 'Snap share trend',
  carryShare: 'Carry share',
  carryShareTrend: 'Carry share trend',
  rzOpps: 'Red-zone opps/g',
  ppg: 'Points per game',
  rushing: 'Rushing per game',
  passAtt: 'Pass attempts/g',
  passRzAtt: 'Red-zone pass att/g',
  teamPassVolume: 'Team pass att/g',
  teamRushVolume: 'Team rushing per game',
  teamPlays: 'Team plays/g',
}

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] || metric
}

const SHARES = ['targetShare', 'airYardShare', 'carryShare']
const TRENDS = ['targetShareTrend', 'snapShareTrend', 'carryShareTrend']

export function formatMetricValues(metric: string, values: number[]): string {
  if (SHARES.indexOf(metric) !== -1) return formatPct(values[0])
  if (TRENDS.indexOf(metric) !== -1) {
    const pts = Math.round(values[0] * 100)
    return `${pts > 0 ? '+' : pts < 0 ? '−' : '±'}${Math.abs(pts)} pts`
  }
  if (metric === 'rushing') return `${values[0].toFixed(1)} att, ${values[1].toFixed(1)} yd`
  if (metric === 'teamRushVolume') return `${values[0].toFixed(1)} att, ${values[1].toFixed(1)} RZ trips`
  return values[0].toFixed(1)
}
