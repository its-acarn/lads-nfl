// The 0-100 breakout score. Each metric is turned into a percentile within
// the player's position, across every scorable player (rostered or free), so
// "90th percentile" means something. Weighted percentiles sum to the raw
// score; next-man-up adds a bonus, the player's own injury multiplies it down,
// and the result is capped at 100.
//
// Trend metrics need earlier games to compare against. A player with none is
// scored without them, their weight spread proportionally over his other
// metrics, and trends are ranked only among players who have earlier games --
// otherwise early in the season everyone shares a flat 50th percentile.

import { MetricKey, WaiverConfig } from '../../config/waivers'
import { flagsFor } from './flags'
import { NextManUp } from './injury'
import {
  MetricContribution,
  PlayerMap,
  PlayerUsage,
  POSITIONS,
  Position,
  ScoredPlayer,
  TeamVolume,
  TrendingAdd,
} from './types'

export interface ScoreInputs {
  usage: Record<string, PlayerUsage>
  volumes: Record<string, TeamVolume>
  players: PlayerMap
  nextManUp: Record<string, NextManUp>
  trending: TrendingAdd[]
}

const NO_VOLUME: TeamVolume = { team: '', games: 0, passAttPerGame: 0, rushAttPerGame: 0, rzAttPerGame: 0, playsPerGame: 0 }

// Each metric is one or more components; a multi-component metric is the
// average of its components' percentiles.
type Component = (u: PlayerUsage, v: TeamVolume) => number
const trend = (pick: (s: PlayerUsage['window']) => number): Component => (u) =>
  u.prior ? pick(u.window) - pick(u.prior) : 0

export const METRICS: Record<MetricKey, Component[]> = {
  targetShare: [(u) => u.window.target],
  airYardShare: [(u) => u.window.airYards],
  targetShareTrend: [trend((s) => s.target)],
  snapShareTrend: [trend((s) => s.snap)],
  carryShare: [(u) => u.window.carry],
  carryShareTrend: [trend((s) => s.carry)],
  rzOpps: [(u) => u.rzOppsPerGame],
  ppg: [(u) => u.ppg],
  rushing: [(u) => u.rushAttPerGame, (u) => u.rushYdPerGame],
  passAtt: [(u) => u.passAttPerGame],
  passRzAtt: [(u) => u.passRzAttPerGame],
  teamPassVolume: [(u, v) => v.passAttPerGame],
  teamRushVolume: [(u, v) => v.rushAttPerGame, (u, v) => v.rzAttPerGame],
  teamPlays: [(u, v) => v.playsPerGame],
}

export const TREND_METRICS: MetricKey[] = ['targetShareTrend', 'snapShareTrend', 'carryShareTrend']

export function percentiles(values: number[]): number[] {
  const n = values.length
  if (n === 1) return [50]
  const sorted = values.slice().sort((a, b) => a - b)
  return values.map((v) => {
    const first = sorted.indexOf(v)
    const last = sorted.lastIndexOf(v)
    return (((first + last) / 2) / (n - 1)) * 100
  })
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function scorePlayers(inputs: ScoreInputs, config: WaiverConfig): ScoredPlayer[] {
  const { usage, players, volumes, nextManUp, trending } = inputs
  const trendingRank: Record<string, number> = {}
  trending.forEach((t, i) => (trendingRank[t.player_id] = i + 1))

  const out: ScoredPlayer[] = []
  POSITIONS.forEach((position: Position) => {
    // Sample guard: regulars, plus players whose latest team game was a real role.
    const newRole: Record<string, boolean> = {}
    const pop = Object.keys(usage).filter((id) => {
      if (players[id]?.position !== position) return false
      const u = usage[id]
      if (u.playedOfLastThreeTeamGames >= config.minPlayedOfLastThree) return true
      if (u.playedLastTeamGame && u.lastGameSnap >= config.newRoleSnap) return (newRole[id] = true)
      return false
    })
    if (pop.length === 0) return

    const weights = config.weights[position] as Partial<Record<MetricKey, number>>
    const metrics = Object.keys(weights) as MetricKey[]
    const hasPrior = (id: string): boolean => usage[id].prior !== null
    const volumeOf = (id: string): TeamVolume => volumes[usage[id].team] || NO_VOLUME

    // Per metric: who it is ranked among, and each of their percentiles.
    const ranked: Partial<Record<MetricKey, Record<string, { values: number[]; percentile: number }>>> = {}
    metrics.forEach((metric) => {
      const among = TREND_METRICS.indexOf(metric) !== -1 ? pop.filter(hasPrior) : pop
      const components = METRICS[metric]
      const pcts = components.map((c) => percentiles(among.map((id) => c(usage[id], volumeOf(id)))))
      const byId: Record<string, { values: number[]; percentile: number }> = {}
      among.forEach((id, i) => {
        byId[id] = {
          values: components.map((c) => c(usage[id], volumeOf(id))),
          percentile: pcts.reduce((acc, p) => acc + p[i], 0) / components.length,
        }
      })
      ranked[metric] = byId
    })

    const breakdowns: MetricContribution[][] = pop.map((id) => {
      const mine = metrics.filter((m) => (ranked[m] as Record<string, unknown>)[id] !== undefined)
      const total = mine.reduce((acc, m) => acc + (weights[m] as number), 0)
      return mine.map((m) => {
        const r = (ranked[m] as Record<string, { values: number[]; percentile: number }>)[id]
        const weight = ((weights[m] as number) * 100) / total
        return { metric: m, values: r.values, percentile: r.percentile, weight, points: (weight * r.percentile) / 100 }
      })
    })
    const raw = breakdowns.map((rows) => rows.reduce((acc, r) => acc + r.points, 0))

    const medianPpg = median(pop.map((id) => usage[id].ppg))
    pop.forEach((id, i) => {
      const meta = players[id]
      const injury = meta.injury_status
      const bonus = nextManUp[id] ? config.nextManUpBonus : 0
      const multiplier = injury && config.injuryMultipliers[injury] !== undefined ? config.injuryMultipliers[injury] : null
      const adjusted = (raw[i] + bonus) * (multiplier === null ? 1 : multiplier)
      out.push({
        playerId: id,
        name: meta.full_name || id,
        position,
        team: usage[id].team,
        score: Math.min(100, adjusted),
        rawScore: raw[i],
        breakdown: { metrics: breakdowns[i], nextManUpBonus: bonus, injuryMultiplier: multiplier, capped: adjusted > 100 },
        usage: usage[id],
        injuryStatus: injury,
        flags: flagsFor(
          position,
          usage[id],
          injury,
          { medianPpg, nextManUp: nextManUp[id] || null, trendingRank: trendingRank[id] || null, newRole: !!newRole[id] },
          config
        ),
        trendingRank: trendingRank[id] || null,
      })
    })
  })
  return out
}
