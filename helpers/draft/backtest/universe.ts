// The set of players who existed to be drafted in August 2025, each carrying a
// pre-season ADP, built from nothing dated after the 2025 draft.
//
// Provenance rules, which are the whole point of this module:
//
//   ATTRIBUTES (position, team, injury designation) come from each pick's
//   `metadata`, which Sleeper freezes at pick time. Verified rather than
//   assumed: the lads/2020 fixture's newest metadata timestamp is 2020-09-05,
//   so the field is a genuine draft-day snapshot and not a live lookup.
//
//   ADP comes from Andrew's spreadsheet, which captured Sleeper's own
//   `search_rank` -- the same field the live bot consumes -- before the season.
//
//   fixtures/players.trim.json is an August 2026 snapshot and is NEVER read
//   here, for anything. Ids were resolved upstream (see playerIds.ts, where
//   the 2026 map is a last-resort id source only); no attribute of any player
//   in this universe originates from it.
//
// Pure: takes parsed data, touches no filesystem.

import { PlayerMap, Position, SleeperPick, TrimmedPlayer } from '../types'
import { JimmygPick, SheetAdpEntry } from './types'
import { joinName, normalizeName, parsePosToken } from './names'

// Sort keys past the end of the spreadsheet's own scale. The sheet ranks to
// 358, so 1000 and 2000 leave the body untouched while keeping the fallback
// layers strictly ordered behind it.
const JIMMYG_TAIL_BASE = 1000
const DETERMINISTIC_TAIL_BASE = 2000

export interface UniverseInputs {
  adp: SheetAdpEntry[]
  ladsPicks: SleeperPick[]
  jimmygPicks: JimmygPick[]
}

export interface AdpProvenance {
  // Sleeper's ADP as captured in the sheet -- the preferred layer.
  sheetSleeper: number
  // The sheet's own rank column, where the Sleeper column was blank.
  sheetRank: number
  // A player the sheet never listed, ordered by where an independent 2025
  // draft took them. Ranked behind everyone on the sheet: a name absent from a
  // 358-deep ADP list is by definition off the mainstream board.
  jimmygTail: number
  // Known to exist, but no source ranks them. Ordered by id for determinism.
  deterministicTail: number
}

export interface Universe {
  players: PlayerMap
  adpProvenance: AdpProvenance
  size: number
}

interface Attributes {
  name: string
  position: Position
  team: string | null
  injuryStatus: string | null
  status: string | null
}

// Empty strings in Sleeper's metadata mean "nothing recorded", not "".
function orNull(v: string | null | undefined): string | null {
  return v && v.length > 0 ? v : null
}

// Draft-day attributes, lads 2025 preferred over Jimmy G-whizz because it is
// the draft under test and eight days earlier.
function buildAttributes(ladsPicks: SleeperPick[], jimmygPicks: JimmygPick[]): Record<string, Attributes> {
  const out: Record<string, Attributes> = {}
  for (let i = 0; i < ladsPicks.length; i++) {
    const p = ladsPicks[i]
    const meta = p.metadata || {}
    const token = parsePosToken(meta.position || '')
    if (!token) continue
    out[p.player_id] = {
      name: joinName(meta.first_name || null, meta.last_name || null),
      position: token.pos,
      team: orNull(meta.team),
      injuryStatus: orNull((meta as Record<string, unknown>).injury_status as string | undefined),
      status: orNull((meta as Record<string, unknown>).status as string | undefined),
    }
  }
  for (let i = 0; i < jimmygPicks.length; i++) {
    const p = jimmygPicks[i]
    if (out[p.player_id]) continue
    const token = parsePosToken(p.position || '')
    if (!token) continue
    out[p.player_id] = {
      name: joinName(p.first_name, p.last_name),
      position: token.pos,
      team: p.team,
      injuryStatus: null,
      status: null,
    }
  }
  return out
}

interface Ranked {
  player_id: string
  sortKey: number
  layer: keyof AdpProvenance
}

export function buildUniverse(inputs: UniverseInputs): Universe {
  const attrs = buildAttributes(inputs.ladsPicks, inputs.jimmygPicks)

  const adpById: Record<string, SheetAdpEntry> = {}
  for (let i = 0; i < inputs.adp.length; i++) adpById[inputs.adp[i].player_id] = inputs.adp[i]

  const jimmygPickNo: Record<string, number> = {}
  for (let i = 0; i < inputs.jimmygPicks.length; i++) {
    const p = inputs.jimmygPicks[i]
    if (jimmygPickNo[p.player_id] === undefined) jimmygPickNo[p.player_id] = p.pick_no
  }

  // Membership: everyone the spreadsheet ranked, plus anyone either 2025 draft
  // actually took. A player taken in the draft under test must be in the
  // universe whatever the sheet says.
  const members: Record<string, boolean> = {}
  const adpIds = Object.keys(adpById)
  for (let i = 0; i < adpIds.length; i++) members[adpIds[i]] = true
  for (let i = 0; i < inputs.ladsPicks.length; i++) members[inputs.ladsPicks[i].player_id] = true
  for (let i = 0; i < inputs.jimmygPicks.length; i++) members[inputs.jimmygPicks[i].player_id] = true

  const ids = Object.keys(members).sort()
  const ranked: Ranked[] = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const entry = adpById[id]
    if (entry && entry.sleeper !== null) {
      ranked.push({ player_id: id, sortKey: entry.sleeper, layer: 'sheetSleeper' })
    } else if (entry) {
      ranked.push({ player_id: id, sortKey: entry.rank, layer: 'sheetRank' })
    } else if (jimmygPickNo[id] !== undefined) {
      ranked.push({ player_id: id, sortKey: JIMMYG_TAIL_BASE + jimmygPickNo[id], layer: 'jimmygTail' })
    } else {
      ranked.push({ player_id: id, sortKey: DETERMINISTIC_TAIL_BASE + i, layer: 'deterministicTail' })
    }
  }
  // Ties broken by id so the whole universe is reproducible byte for byte.
  ranked.sort((a, b) => a.sortKey - b.sortKey || (a.player_id < b.player_id ? -1 : 1))

  const provenance: AdpProvenance = { sheetSleeper: 0, sheetRank: 0, jimmygTail: 0, deterministicTail: 0 }
  const players: PlayerMap = {}
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i]
    provenance[r.layer]++
    const a = attrs[r.player_id]
    const entry = adpById[r.player_id]
    const position: Position | null = a ? a.position : entry ? entry.pos : null
    if (position === null) continue
    const name = (a && a.name.length > 0 ? a.name : null) || (entry ? entry.name : r.player_id)
    const trimmed: TrimmedPlayer = {
      player_id: r.player_id,
      full_name: name,
      first_name: null,
      last_name: null,
      position,
      team: a && a.team ? a.team : entry ? entry.team : null,
      // Dense 1..N, matching the scale of Sleeper's own search_rank, which is
      // what survival.ts consumes as -searchRank/temperature.
      search_rank: i + 1,
      injury_status: a ? a.injuryStatus : null,
      status: a ? a.status : null,
      // Redraft league: age is weighted zero by the engine, so it is not
      // reconstructed. Leaving it null is honest about what we know.
      age: null,
    }
    players[r.player_id] = trimmed
  }

  return { players, adpProvenance: provenance, size: Object.keys(players).length }
}

// ---------------------------------------------------------------------------
// Cross-check
// ---------------------------------------------------------------------------

export interface AdpDisagreement {
  name: string
  universeRank: number
  ffcAdp: number
  gap: number
}

export interface AdpCrossCheck {
  matched: number
  unmatched: number
  pearson: number
  largestDisagreements: AdpDisagreement[]
}

// Fantasy Football Calculator writes defenses as "Denver Defense" where
// Sleeper writes "Denver Broncos"; the city is the only shared part, so
// defenses key on everything but the final word.
function defenseKey(name: string): string {
  const parts = normalizeName(name).split(' ')
  if (parts.length <= 1) return parts.join(' ')
  return parts.slice(0, parts.length - 1).join(' ')
}

function crossCheckKey(name: string, pos: Position): string {
  return pos === 'DEF' ? `DEF|${defenseKey(name)}` : `${pos}|${normalizeName(name)}`
}

// Compares the prior actually in use against an independent pre-season
// consensus. A sharp divergence would mean one of the two sources is not what
// it appears to be, and is worth understanding before either is trusted.
export function crossCheckAdp(universe: Universe, ffc: { name: string; position: string; adp: number }[]): AdpCrossCheck {
  const byKey: Record<string, { rank: number; name: string }> = {}
  const ids = Object.keys(universe.players)
  for (let i = 0; i < ids.length; i++) {
    const p = universe.players[ids[i]]
    if (p.search_rank === null) continue
    const k = crossCheckKey(p.full_name || '', p.position)
    if (!byKey[k]) byKey[k] = { rank: p.search_rank, name: p.full_name || ids[i] }
  }

  const pairs: { x: number; y: number; name: string }[] = []
  let unmatched = 0
  for (let i = 0; i < ffc.length; i++) {
    const token = parsePosToken(ffc[i].position)
    if (!token) {
      unmatched++
      continue
    }
    const hit = byKey[crossCheckKey(ffc[i].name, token.pos)]
    if (!hit) {
      unmatched++
      continue
    }
    pairs.push({ x: hit.rank, y: ffc[i].adp, name: hit.name })
  }

  let pearson = 0
  if (pairs.length > 1) {
    let mx = 0
    let my = 0
    for (let i = 0; i < pairs.length; i++) {
      mx += pairs[i].x
      my += pairs[i].y
    }
    mx /= pairs.length
    my /= pairs.length
    let num = 0
    let dx = 0
    let dy = 0
    for (let i = 0; i < pairs.length; i++) {
      num += (pairs[i].x - mx) * (pairs[i].y - my)
      dx += (pairs[i].x - mx) * (pairs[i].x - mx)
      dy += (pairs[i].y - my) * (pairs[i].y - my)
    }
    pearson = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
  }

  const gaps: AdpDisagreement[] = []
  for (let i = 0; i < pairs.length; i++) {
    gaps.push({
      name: pairs[i].name,
      universeRank: pairs[i].x,
      ffcAdp: pairs[i].y,
      gap: Math.abs(pairs[i].x - pairs[i].y),
    })
  }
  gaps.sort((a, b) => b.gap - a.gap)

  return { matched: pairs.length, unmatched, pearson, largestDisagreements: gaps.slice(0, 10) }
}
