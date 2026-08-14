// Name and position-token normalisation for the backtest.
//
// Deliberately separate from scripts/resolveBoard.ts's normalizeName rather
// than shared with it. The backtest matches against sources the live resolver
// never sees -- a spreadsheet that writes defenses as "Denver Broncos" against
// Sleeper's first_name/last_name split, and position tokens like "DST1" that
// carry a positional rank -- and the live draft-day resolver must not be
// perturbed by anything this file needs.

import { Position } from '../types'

const FANTASY: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DEF: 'DEF',
  // The spreadsheet's ADP tab calls defenses DST; Sleeper calls them DEF.
  DST: 'DEF',
  DEF_ST: 'DEF',
}

// Lowercase, strip punctuation, drop generational suffixes, collapse spaces.
// "Marvin Harrison Jr." and "marvin harrison" both become "marvin harrison".
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`’-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface PosToken {
  pos: Position
  // Positional rank where the source supplied one: WR1 -> 1, DST -> null.
  index: number | null
}

// Parse a spreadsheet POS cell. Accepts "WR1", "RB12", "K3", "DST", "DST1".
// Returns null for anything unrecognised rather than guessing, so callers can
// report the cell instead of silently mis-positioning a player.
export function parsePosToken(token: string): PosToken | null {
  const raw = token.trim().toUpperCase()
  if (raw.length === 0) return null
  const m = /^([A-Z_]+?)(\d*)$/.exec(raw)
  if (!m) return null
  const pos = FANTASY[m[1]]
  if (!pos) return null
  return { pos, index: m[2].length > 0 ? parseInt(m[2], 10) : null }
}

// Sleeper stores defenses with the city in first_name and the nickname in
// last_name ("Denver" / "Broncos") and no full_name at all, so a joined
// first+last is the only thing a sheet's "Denver Broncos" can match against.
export function joinName(firstName: string | null, lastName: string | null, fullName?: string | null): string {
  if (fullName) return fullName
  return `${firstName || ''} ${lastName || ''}`.trim()
}
