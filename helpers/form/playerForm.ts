// One row per player with a game in the window: league points form,
// consistency, usage over the same games, the buy-low / sell-high signal and
// the next few matchups.
//
// The signal compares, within a position, how heavily a player is used with
// how much he has scored. Only players with a real role join the comparison
// (config/form.ts), so garbage-time backups don't set the percentiles.

import { FormConfig } from '../../config/form'
import { stat, sharesOver } from '../waivers/metrics'
import { percentiles } from '../waivers/score'
import { Position, WaiverInputs } from '../waivers/types'
import { completedWeeks } from '../waivers/weeks'
import { isFormPosition, missedGames, windowGames } from './games'
import { teamNextWeek, upcomingGames } from './pointsAllowed'
import { FormUsage, FormWindow, Owner, PlayerFormRow, PlayerGame, PointsAllowedRow } from './types'

const FREE_AGENT: Owner = { kind: 'fa' }

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function usageOver(inputs: WaiverInputs, id: string, games: PlayerGame[], position: Position): FormUsage {
  const weeks = games.map((g) => g.week)
  const perGame = (f: (w: number) => number): number => mean(weeks.map(f))
  const line = (w: number) => inputs.statsByWeek[w]?.[id]?.stats
  const shares = sharesOver(inputs.statsByWeek, id, weeks)
  return {
    ...shares,
    rzOppsPerGame: perGame((w) =>
      position === 'QB'
        ? stat(line(w), 'pass_rz_att') + stat(line(w), 'rush_rz_att')
        : stat(line(w), 'rec_rz_tgt') + stat(line(w), 'rush_rz_att')
    ),
    passAttPerGame: perGame((w) => stat(line(w), 'pass_att')),
    rushAttPerGame: perGame((w) => stat(line(w), 'rush_att')),
  }
}

// The usage measures that matter for each position.
const USAGE_MEASURES: Record<Position, ((u: FormUsage) => number)[]> = {
  QB: [(u) => u.passAttPerGame, (u) => u.rushAttPerGame, (u) => u.rzOppsPerGame],
  RB: [(u) => u.snap, (u) => u.carry, (u) => u.target, (u) => u.rzOppsPerGame],
  WR: [(u) => u.snap, (u) => u.target, (u) => u.airYards, (u) => u.rzOppsPerGame],
  TE: [(u) => u.snap, (u) => u.target, (u) => u.airYards, (u) => u.rzOppsPerGame],
}

function applySignals(rows: PlayerFormRow[], config: FormConfig): void {
  const c = config.signal
  ;(Object.keys(USAGE_MEASURES) as Position[]).forEach((position) => {
    const pool = rows.filter(
      (r) =>
        r.position === position &&
        r.usage &&
        r.gamesPlayed >= c.minGames &&
        r.usage.snap >= c.minSnapShare[position] &&
        r.missed <= c.maxMissed &&
        c.excludeInjury.indexOf(r.injuryStatus || '') === -1
    )
    if (pool.length === 0) return
    const measurePcts = USAGE_MEASURES[position].map((f) => percentiles(pool.map((r) => f(r.usage as FormUsage))))
    const pointsPcts = percentiles(pool.map((r) => r.avg))
    pool.forEach((r, i) => {
      r.usagePct = mean(measurePcts.map((p) => p[i]))
      r.pointsPct = pointsPcts[i]
      const gap = r.usagePct - r.pointsPct
      r.signal = gap >= c.buyGap ? 'buy' : gap <= c.sellGap ? 'sell' : null
    })
  })
}

// Whether the window can hold enough games for the buy/sell signal at all.
export function signalAvailable(window: FormWindow, config: FormConfig): boolean {
  return window === 'season' || window >= config.signal.minGames
}

export function buildPlayerForm(
  inputs: WaiverInputs,
  games: Record<string, PlayerGame[]>,
  window: FormWindow,
  allowed: PointsAllowedRow[],
  owners: Record<string, Owner>,
  config: FormConfig
): PlayerFormRow[] {
  const rows: PlayerFormRow[] = []
  const weeks = completedWeeks(inputs.schedule, inputs.week)
  Object.keys(games).forEach((id) => {
    const meta = inputs.players[id]
    const all = games[id]
    const recent = windowGames(all, window)
    if (!meta || !isFormPosition(meta.position) || recent.length === 0) return
    const position = meta.position
    const points = recent.map((g) => g.points)
    const avg = mean(points)
    const seasonAvg = mean(all.map((g) => g.points))
    const team = meta.team || all[all.length - 1].team
    const offensive = position !== 'K' && position !== 'DEF'
    rows.push({
      playerId: id,
      name: position === 'DEF' ? `${team} DEF` : meta.full_name || id,
      position,
      team,
      injuryStatus: meta.injury_status,
      owner: owners[id] || FREE_AGENT,
      games: recent,
      lastWeek: all[all.length - 1].week,
      missed: missedGames(inputs.schedule, team, all[all.length - 1].week, weeks),
      gamesPlayed: recent.length,
      windowSize: window === 'season' ? null : window,
      avg,
      seasonAvg,
      delta: avg - seasonAvg,
      floor: Math.min(...points),
      hits: points.filter((p) => p >= config.hitThresholds[position]).length,
      usage: offensive ? usageOver(inputs, id, recent, position as Position) : null,
      usagePct: null,
      pointsPct: null,
      signal: null,
      upcoming: upcomingGames(inputs.schedule, team, teamNextWeek(inputs.schedule, team), allowed, position, config),
    })
  })
  applySignals(rows, config)
  return rows.sort((a, b) => b.avg - a.avg)
}
