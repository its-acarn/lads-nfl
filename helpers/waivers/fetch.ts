// Live inputs for the /waivers page, fetched in the browser (every endpoint
// is CORS-open). The player map is ~2.5 MB compressed, so a trimmed copy is
// cached in localStorage for six hours; every storage call is guarded so the
// page still works when storage is blocked.

import { shapeLeague, shapeRoster, shapeSchedule, shapeUser, trimPlayers, trimWeekStats } from './trim'
import { PlayerMap, WaiverInputs } from './types'

const API = 'https://api.sleeper.app/v1'
const SCHEDULE_API = 'https://api.sleeper.com/schedule/nfl/regular'
// The api.sleeper.com stats feed carries each player's team for that week.
const STATS_API = 'https://api.sleeper.com/stats/nfl'

export const PLAYERS_CACHE_KEY = 'waivers.players.v1'
export const PLAYERS_TTL_MS = 6 * 3600 * 1000

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readCache<T>(storage: KeyValueStorage | null, key: string, ttlMs: number, now: number): { value: T; savedAt: number } | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt >= ttlMs) return null
    return { value: parsed.value as T, savedAt: parsed.savedAt }
  } catch (e) {
    return null
  }
}

export function writeCache(storage: KeyValueStorage | null, key: string, value: unknown, now: number): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, value }))
  } catch (e) {
    // Quota or blocked storage: the page works without the cache.
  }
}

// window.localStorage itself throws when site data is blocked.
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch (e) {
    return null
  }
}

export async function getJson(url: string): Promise<any> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error(`Could not reach ${url}`)
  }
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`)
  return res.json()
}

export interface FetchOptions {
  getJson: (url: string) => Promise<any>
  storage: KeyValueStorage | null
  now: number
}

async function loadPlayers(opts: FetchOptions): Promise<{ players: PlayerMap; savedAt: number }> {
  const cached = readCache<PlayerMap>(opts.storage, PLAYERS_CACHE_KEY, PLAYERS_TTL_MS, opts.now)
  if (cached) return { players: cached.value, savedAt: cached.savedAt }
  const raw = await opts.getJson(`${API}/players/nfl`)
  // Keep active scouted players (and every DEF); retired players never matter.
  const players = trimPlayers(raw, new Set(Object.keys(raw).filter((id) => raw[id] && raw[id].active)))
  writeCache(opts.storage, PLAYERS_CACHE_KEY, players, opts.now)
  return { players, savedAt: opts.now }
}

export async function fetchWaiverInputs(
  leagueId: string,
  opts: FetchOptions
): Promise<{ inputs: WaiverInputs; playersSavedAt: number }> {
  const state = await opts.getJson(`${API}/state/nfl`)
  const weeks: number[] = []
  for (let w = 1; w <= state.week; w++) weeks.push(w)

  const [schedule, trending, league, rosters, users, players, stats] = await Promise.all([
    opts.getJson(`${SCHEDULE_API}/${state.season}`),
    opts.getJson(`${API}/players/nfl/trending/add?lookback_hours=48&limit=50`),
    opts.getJson(`${API}/league/${leagueId}`),
    opts.getJson(`${API}/league/${leagueId}/rosters`),
    opts.getJson(`${API}/league/${leagueId}/users`),
    loadPlayers(opts),
    Promise.all(weeks.map((w) => opts.getJson(`${STATS_API}/${state.season}/${w}?season_type=regular`))),
  ])

  const statsByWeek: WaiverInputs['statsByWeek'] = {}
  weeks.forEach((w, i) => (statsByWeek[w] = trimWeekStats(stats[i])))

  return {
    inputs: {
      week: state.week,
      schedule: shapeSchedule(schedule),
      statsByWeek,
      players: players.players,
      trending: trending.map((t: any) => ({ player_id: t.player_id, count: t.count })),
      league: shapeLeague(league),
      rosters: rosters.map(shapeRoster),
      users: users.map(shapeUser),
    },
    playersSavedAt: players.savedAt,
  }
}
