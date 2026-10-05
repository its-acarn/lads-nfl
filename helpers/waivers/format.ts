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
