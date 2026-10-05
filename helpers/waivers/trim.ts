// Shrink raw Sleeper responses to what the scout reads, so committed fixtures
// stay small. Used by scripts/fetchWaiverFixtures.ts.

import { PlayerMap, PlayerMeta, STAT_KEYS, StatLine, WeekStats } from './types'

export const SCOUTED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

function isScouted(raw: any): boolean {
  return !!raw && SCOUTED_POSITIONS.indexOf(raw.position) !== -1
}

function pickStats(line: Record<string, number>): StatLine {
  const out: StatLine = {}
  STAT_KEYS.forEach((k) => {
    if (typeof line[k] === 'number') out[k] = line[k]
  })
  return out
}

// Keep TEAM_XXX rows and the rows of scouted positions; the feed also carries
// defensive players, who are dropped. Each row keeps the team he played for
// that week.
export function trimWeekStats(rows: any[]): WeekStats {
  const out: WeekStats = {}
  rows.forEach((row) => {
    const id = String(row.player_id)
    if (id.indexOf('TEAM_') === 0 || isScouted(row.player)) {
      out[id] = { team: row.team ?? null, stats: pickStats(row.stats || {}) }
    }
  })
  return out
}

export function toPlayerMeta(raw: any): PlayerMeta {
  return {
    player_id: raw.player_id,
    full_name: raw.full_name ?? null,
    position: raw.position ?? null,
    team: raw.team ?? null,
    active: !!raw.active,
    injury_status: raw.injury_status ?? null,
    depth_chart_position: raw.depth_chart_position ?? null,
    depth_chart_order: raw.depth_chart_order ?? null,
  }
}

// Keep scouted players whose id is in `seen` (stats or rosters), plus every
// DEF entry so streaming can name each defence.
export function trimPlayers(rawPlayers: Record<string, any>, seen: Set<string>): PlayerMap {
  const out: PlayerMap = {}
  Object.keys(rawPlayers).forEach((id) => {
    const raw = rawPlayers[id]
    if (!isScouted(raw)) return
    if (raw.position === 'DEF' || seen.has(id)) out[id] = toPlayerMeta(raw)
  })
  return out
}
