// The plain-English reasons shown on each row. Each flag is one rule with one
// threshold from config/waivers.ts; the label states the number behind it.

import { WaiverConfig } from '../../config/waivers'
import { NextManUp } from './injury'
import { Flag, PlayerUsage, Position } from './types'

export interface FlagContext {
  medianPpg: number // of scored players at this position
  nextManUp: NextManUp | null
  trendingRank: number | null
  newRole: boolean
}

const pct = (x: number): number => Math.round(x * 100)

export function flagsFor(
  position: Position,
  u: PlayerUsage,
  injuryStatus: string | null,
  ctx: FlagContext,
  config: WaiverConfig
): Flag[] {
  const t = config.flags
  const receiver = position === 'WR' || position === 'TE'
  const flags: Flag[] = []

  if (u.prior && u.lastGameSnap - u.prior.snap >= t.snapSurge) {
    flags.push({ kind: 'snapSurge', label: `Snap share +${pct(u.lastGameSnap - u.prior.snap)} pts` })
  }
  const hogAt = receiver ? t.targetHogReceiver : position === 'RB' ? t.targetHogRb : null
  if (hogAt !== null && u.window.target >= hogAt) {
    flags.push({ kind: 'targetHog', label: `Target share ${pct(u.window.target)}%` })
  }
  if (position === 'RB' && u.window.carry >= t.workhorse) {
    flags.push({ kind: 'workhorse', label: `Carry share ${pct(u.window.carry)}%` })
  }
  if (receiver && u.window.airYards >= t.buyLowAirShare && u.ppg < ctx.medianPpg) {
    flags.push({ kind: 'buyLow', label: `Air-yard share ${pct(u.window.airYards)}%, ${u.ppg.toFixed(1)} PPG` })
  }
  if (u.rzOppsPerGame >= t.redZoneOpps) {
    flags.push({ kind: 'redZone', label: `${u.rzOppsPerGame.toFixed(1)} RZ opps/g` })
  }
  if (ctx.nextManUp) {
    flags.push({ kind: 'nextManUp', label: `Next man up: ${ctx.nextManUp.starterName} ${ctx.nextManUp.starterStatus}` })
  }
  if (ctx.trendingRank !== null) flags.push({ kind: 'trending', label: `Trending #${ctx.trendingRank}` })
  if (ctx.newRole) flags.push({ kind: 'newRole', label: `New role: ${pct(u.lastGameSnap)}% snaps last game` })
  if (injuryStatus && injuryStatus !== 'Active') flags.push({ kind: 'injured', label: injuryStatus })
  return flags
}
