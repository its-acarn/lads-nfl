// Resolve player names to Sleeper player ids using CONTEMPORANEOUS sources.
//
// Why this exists rather than just reading fixtures/players.trim.json: that
// file is an August 2026 snapshot and no longer contains players who were
// central to 2025 -- Tyreek Hill, Austin Ekeler and Keenan Allen are all
// absent, because they are not on an NFL roster now. Resolving 2025 names
// against it would silently drop exactly the players the backtest exists to
// keep.
//
// So the lookup is layered by provenance, most contemporaneous first:
//
//   1. the 2025 lads picks feed      -- metadata stamped on draft day
//   2. the Jimmy G-whizz picks feed  -- same, eight days later
//   3. fixtures/players.trim.json    -- 2026, last resort, ids only
//
// Layers 1 and 2 carry player_id alongside first_name/last_name/position in
// each pick's metadata, so they are both authoritative and of the right
// vintage. Layer 3 exists only for players neither draft touched; team
// abbreviations (which is what defense ids are) are stable across seasons, so
// it is safe for those.
//
// Pure: takes already-parsed data, touches no filesystem, so it is directly
// testable.

import { Position } from '../types'
import { normalizeName } from './names'

export interface IdEntry {
  player_id: string
  name: string
  position: Position
  // Human-readable origin, surfaced in diagnostics so a surprising resolution
  // can be traced to the layer that produced it.
  provenance: string
}

export interface Resolution {
  player_id: string
  provenance: string
}

export interface IdIndex {
  resolve(name: string, pos: Position | null): Resolution | null
  // Keys that matched more than one distinct player_id within a single layer.
  // Never resolved, always reported.
  ambiguousKeys(): string[]
  size(): number
}

function key(name: string, pos: Position | null): string {
  return `${normalizeName(name)}|${pos || '*'}`
}

// Entries are supplied in preference order; the first layer to claim a key
// wins, and later layers never override it. Within a single layer, two
// different ids claiming one key is an ambiguity: neither wins, and the key is
// reported rather than guessed at.
export function buildIdIndex(layers: IdEntry[][]): IdIndex {
  const byKey: Record<string, Resolution> = {}
  const byNameOnly: Record<string, Resolution> = {}
  const ambiguous: Record<string, boolean> = {}

  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l]
    // Collect this layer's claims first so that an ambiguity inside the layer
    // is detected before anything is committed.
    const claims: Record<string, Resolution[]> = {}
    const nameClaims: Record<string, Resolution[]> = {}
    for (let i = 0; i < layer.length; i++) {
      const e = layer[i]
      const k = key(e.name, e.position)
      const n = key(e.name, null)
      const res: Resolution = { player_id: e.player_id, provenance: e.provenance }
      if (!claims[k]) claims[k] = []
      if (!nameClaims[n]) nameClaims[n] = []
      let seen = false
      for (let j = 0; j < claims[k].length; j++) {
        if (claims[k][j].player_id === e.player_id) seen = true
      }
      if (!seen) claims[k].push(res)
      let seenName = false
      for (let j = 0; j < nameClaims[n].length; j++) {
        if (nameClaims[n][j].player_id === e.player_id) seenName = true
      }
      if (!seenName) nameClaims[n].push(res)
    }

    const ks = Object.keys(claims)
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i]
      if (claims[k].length > 1) {
        ambiguous[k] = true
        continue
      }
      if (!byKey[k]) byKey[k] = claims[k][0]
    }
    const ns = Object.keys(nameClaims)
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i]
      if (nameClaims[n].length > 1) continue // name-only fallback stays silent on collisions
      if (!byNameOnly[n]) byNameOnly[n] = nameClaims[n][0]
    }
  }

  return {
    resolve(name: string, pos: Position | null): Resolution | null {
      const k = key(name, pos)
      if (ambiguous[k]) return null
      if (byKey[k]) return byKey[k]
      // Fall back to a name-only match: the spreadsheet occasionally disagrees
      // with Sleeper about a player's listed position (a converted RB/WR, a
      // tight end filed as a receiver), and the name is the stronger signal.
      const n = key(name, null)
      if (byNameOnly[n]) return byNameOnly[n]
      return null
    },
    ambiguousKeys(): string[] {
      return Object.keys(ambiguous).sort()
    },
    size(): number {
      return Object.keys(byKey).length
    },
  }
}
