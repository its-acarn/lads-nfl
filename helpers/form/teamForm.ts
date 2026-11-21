// Each league team's current strength: the best lineup its roster could field
// on form, by slot group, plus bench depth. Every rostered player counts,
// injured or on IR included (Andrew's call); injury is shown, not used.

import { PlayerMap, WaiverRoster } from '../waivers/types'
import { windowGames } from './games'
import {
  FormWindow,
  LineupPlayer,
  LineupSpot,
  Owner,
  PlayerGame,
  TEAM_FORM_GROUPS,
  TeamFormGroup,
  TeamFormRow,
} from './types'

const FIXED_SLOTS: TeamFormGroup[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const FLEX_POSITIONS = ['RB', 'WR', 'TE']
const BENCH_POSITIONS = ['RB', 'WR', 'TE']

function emptyGroups(): Record<TeamFormGroup, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0 }
}

export function buildTeamForm(
  rosters: WaiverRoster[],
  players: PlayerMap,
  games: Record<string, PlayerGame[]>,
  window: FormWindow,
  rosterPositions: string[],
  owners: Record<string, Owner>
): TeamFormRow[] {
  const rows: TeamFormRow[] = rosters.map((roster) => {
    const ids = ([] as string[]).concat(roster.players || [], roster.reserve || [], roster.taxi || [])
    const pool: LineupPlayer[] = Array.from(new Set(ids))
      .filter((id) => players[id] && (games[id] || []).length > 0)
      .map((id) => {
        const meta = players[id]
        const recent = windowGames(games[id], window)
        const position = meta.position || ''
        return {
          id,
          name: position === 'DEF' ? `${meta.team || id} DEF` : meta.full_name || id,
          position,
          injuryStatus: meta.injury_status,
          value: recent.reduce((a, g) => a + g.points, 0) / recent.length,
        }
      })
      .sort((a, b) => b.value - a.value)

    const used = new Set<string>()
    const take = (eligible: string[]): LineupPlayer | null => {
      const pick = pool.filter((c) => !used.has(c.id) && eligible.indexOf(c.position) !== -1)[0]
      if (!pick) return null
      used.add(pick.id)
      return pick
    }

    // Fixed slots first, then FLEX from what is left. Other slots (BN, IR,
    // anything this league doesn't use) are ignored. Starters are listed in
    // roster order.
    const filled: (LineupSpot | null)[] = rosterPositions.map((slot) =>
      FIXED_SLOTS.indexOf(slot as TeamFormGroup) !== -1 ? { slot: slot as TeamFormGroup, player: take([slot]) } : null
    )
    rosterPositions.forEach((slot, i) => {
      if (slot === 'FLEX') filled[i] = { slot: 'FLEX', player: take(FLEX_POSITIONS) }
    })
    const starters = filled.filter((s): s is LineupSpot => s !== null)
    const groups = emptyGroups()
    starters.forEach((s) => (groups[s.slot] += s.player ? s.player.value : 0))
    const benchPlayers = BENCH_POSITIONS.map((p) => take([p])).filter((p): p is LineupPlayer => p !== null)
    const bench = benchPlayers.reduce((acc, p) => acc + p.value, 0)
    const total = TEAM_FORM_GROUPS.reduce((acc, g) => acc + groups[g], 0)

    const owner = owners[ids[0]] || { kind: 'other', label: 'Orphan', ownerId: roster.owner_id }
    return {
      rosterId: roster.roster_id,
      owner,
      groups,
      total,
      bench,
      starters,
      benchPlayers,
      rank: { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0, total: 0, bench: 0 },
    }
  })

  const columns: (TeamFormGroup | 'total' | 'bench')[] = [...TEAM_FORM_GROUPS, 'total', 'bench']
  const valueOf = (r: TeamFormRow, c: TeamFormGroup | 'total' | 'bench'): number =>
    c === 'total' ? r.total : c === 'bench' ? r.bench : r.groups[c]
  columns.forEach((c) => {
    rows
      .slice()
      .sort((a, b) => valueOf(b, c) - valueOf(a, c))
      .forEach((r, i) => (r.rank[c] = i + 1))
  })
  return rows
}
