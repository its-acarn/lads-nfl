import { describe, expect, it } from 'vitest'
import { fetchWaiverInputs, readCache, writeCache, PLAYERS_CACHE_KEY } from './fetch'

class MemoryStorage {
  data: Record<string, string> = {}
  getItem(k: string) { return k in this.data ? this.data[k] : null }
  setItem(k: string, v: string) { this.data[k] = v }
  removeItem(k: string) { delete this.data[k] }
}
const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
const HOUR = 3600 * 1000

describe('readCache / writeCache', () => {
  it('returns a fresh value with its save time', () => {
    const s = new MemoryStorage()
    writeCache(s, 'k', { a: 1 }, 1000)
    expect(readCache(s, 'k', HOUR, 1000 + HOUR - 1)).toEqual({ value: { a: 1 }, savedAt: 1000 })
  })
  it('returns null when missing, expired, corrupt or storage throws', () => {
    const s = new MemoryStorage()
    expect(readCache(s, 'k', HOUR, 0)).toBeNull()
    writeCache(s, 'k', 1, 0)
    expect(readCache(s, 'k', HOUR, HOUR + 1)).toBeNull()
    s.setItem('bad', '{not json')
    expect(readCache(s, 'bad', HOUR, 0)).toBeNull()
    expect(readCache(throwing, 'k', HOUR, 0)).toBeNull()
    expect(readCache(null, 'k', HOUR, 0)).toBeNull()
  })
  it('swallows write failures', () => {
    expect(() => writeCache(throwing, 'k', 1, 0)).not.toThrow()
  })
})

const raw: Record<string, unknown> = {
  'https://api.sleeper.app/v1/state/nfl': { week: 2, season: '2026' },
  'https://api.sleeper.com/schedule/nfl/regular/2026': [{ week: 1, home: 'NO', away: 'KC', status: 'complete', game_id: 'x' }],
  'https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=50': [{ player_id: '1', count: 5 }],
  'https://api.sleeper.app/v1/league/L': { league_id: 'L', name: 'Lads', roster_positions: ['QB', 'K'], scoring_settings: { rec: 0.5, pass_td: 4 }, settings: {} },
  'https://api.sleeper.app/v1/league/L/rosters': [{ roster_id: 1, owner_id: 'u', players: ['1'], reserve: null, taxi: null, settings: {} }],
  'https://api.sleeper.app/v1/league/L/users': [{ user_id: 'u', display_name: 'Me', avatar: 'a', metadata: { team_name: 'Team' } }],
  'https://api.sleeper.app/v1/players/nfl': {
    '1': { player_id: '1', full_name: 'Wide Out', position: 'WR', team: 'NO', active: true, college: 'X' },
    '2': { player_id: '2', full_name: 'Old Guy', position: 'RB', team: null, active: false },
    NO: { player_id: 'NO', position: 'DEF', team: 'NO', active: true },
  },
  'https://api.sleeper.com/stats/nfl/2026/1?season_type=regular': [{ player_id: '1', team: 'NO', player: { position: 'WR' }, stats: { off_snp: 40, gp: 1 } }],
  'https://api.sleeper.com/stats/nfl/2026/2?season_type=regular': [{ player_id: 'TEAM_NO', team: 'NO', player: {}, stats: { pass_att: 30 } }],
}

function fakeFetch(calls: string[]) {
  return async (url: string) => {
    calls.push(url)
    if (!(url in raw)) throw new Error(`unexpected ${url}`)
    return raw[url]
  }
}

describe('fetchWaiverInputs', () => {
  it('assembles trimmed WaiverInputs for a league', async () => {
    const out = await fetchWaiverInputs('L', { getJson: fakeFetch([]), storage: new MemoryStorage(), now: 5 })
    expect(out.inputs.week).toBe(2)
    expect(out.inputs.statsByWeek[1]).toEqual({ '1': { team: 'NO', stats: { off_snp: 40 } } })
    expect(out.inputs.statsByWeek[2]).toEqual({ TEAM_NO: { team: 'NO', stats: { pass_att: 30 } } })
    expect(Object.keys(out.inputs.players).sort()).toEqual(['1', 'NO'])
    expect(out.inputs.league).toEqual({ league_id: 'L', name: 'Lads', roster_positions: ['QB', 'K'], scoring_settings: { rec: 0.5 } })
    expect(out.inputs.rosters[0]).toEqual({ roster_id: 1, owner_id: 'u', players: ['1'], reserve: null, taxi: null })
    expect(out.inputs.trending).toEqual([{ player_id: '1', count: 5 }])
    expect(out.playersSavedAt).toBe(5)
  })

  it('reuses the cached player map within six hours, and refetches after', async () => {
    const storage = new MemoryStorage()
    await fetchWaiverInputs('L', { getJson: fakeFetch([]), storage, now: 0 })
    expect(storage.getItem(PLAYERS_CACHE_KEY)).not.toBeNull()

    const soon: string[] = []
    const cached = await fetchWaiverInputs('L', { getJson: fakeFetch(soon), storage, now: 5 * 3600 * 1000 })
    expect(soon).not.toContain('https://api.sleeper.app/v1/players/nfl')
    expect(cached.playersSavedAt).toBe(0)

    const later: string[] = []
    await fetchWaiverInputs('L', { getJson: fakeFetch(later), storage, now: 7 * 3600 * 1000 })
    expect(later).toContain('https://api.sleeper.app/v1/players/nfl')
  })

  it('works with no storage at all', async () => {
    const out = await fetchWaiverInputs('L', { getJson: fakeFetch([]), storage: null, now: 0 })
    expect(out.inputs.users[0]).toEqual({ user_id: 'u', display_name: 'Me', metadata: { team_name: 'Team' } })
  })
})
