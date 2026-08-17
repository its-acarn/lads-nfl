// Reading Andrew's board out of a Google Sheets tab.
//
// Extracted from scripts/importSheet.ts so that ONE parser serves both
// consumers: the 2025 backtest (which also reads a market ADP tab and resolves
// ids itself) and the live 2026 board importer. Two copies of a tier parser
// would drift, and a board that parses differently from the board the backtest
// validated is a board nobody has checked.
//
// Nothing here touches player ids. The importer writes names and leaves
// resolution to `npm run resolve-board`, which refuses to guess (D1).

import { Position } from './types'

// The board tab is laid out one column per tier rather than one row per
// player, and the tier block occupies rows 2..24 only. Below that, column A
// continues with a 351-name scratch list which is NOT part of the board; a
// naive read of the whole column swallows it and reports 509 tiered players
// instead of 157.
export const TIER_BLOCK_FIRST_ROW = 1 // zero-based, i.e. the row after the header
export const TIER_BLOCK_LAST_ROW = 23 // zero-based inclusive -> spreadsheet row 24

// Column header -> tier number. The two adjacent columns both labelled "Last
// Tier" are one tier; nothing in the sheet distinguishes them. Quarterbacks
// have no tier of their own and are priced level with the last tier, which is
// an assumption recorded in the backtest plan's Decision Log, not something the
// sheet states.
export const TIER_OF_HEADER: Record<string, number> = {
  'Tier 1': 1,
  'Tier 2': 2,
  'Tier 3': 3,
  'Tier 4': 4,
  'Tier 5': 5,
  'Tier 6': 6,
  'Tier 7': 7,
  'Last Tier': 8,
  "QB's": 8,
}

export function fail(msg: string): never {
  throw new Error(`sheetBoard: ${msg}`)
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Minimal RFC4180 reader: quoted fields, doubled quotes, embedded commas and
// newlines. Hand-rolled to keep the dependency tree flat, matching the repo's
// existing "no schema library, no CSV library" decision.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let sawAny = false
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      sawAny = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
      sawAny = true
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      sawAny = false
    } else if (ch !== '\r') {
      field += ch
      sawAny = true
    }
  }
  if (sawAny || field.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function cell(rows: string[][], r: number, c: number): string {
  const row = rows[r]
  if (!row || c >= row.length) return ''
  return row[c].trim()
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

// Accepts a full spreadsheet URL or a bare document id, so a reader can paste
// straight from the browser.
export function docIdFrom(sheetArg: string): string {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(sheetArg)
  return m ? m[1] : sheetArg
}

// The gviz endpoint addresses a tab by name, which keeps this readable and
// survives the sheet being reordered; gids would not.
export async function fetchTab(docId: string, tab: string): Promise<string[][]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) fail(`GET tab "${tab}" -> HTTP ${res.status}. Is the sheet shared as "anyone with the link"?`)
    const text = await res.text()
    if (text.indexOf('<!DOCTYPE') === 0 || text.indexOf('<HTML') === 0) {
      fail(`tab "${tab}" returned HTML, not CSV — the sheet is not readable without signing in`)
    }
    return parseCsv(text)
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// The tiers tab -> board entries
// ---------------------------------------------------------------------------

export interface TierEntry {
  name: string
  tier: number
  column: number
  row: number
  fromQbColumn: boolean
}

export function parseTiersTab(rows: string[][]): TierEntry[] {
  const out: TierEntry[] = []
  let columns = 0
  for (let c = 0; c < 32; c++) {
    if (cell(rows, 0, c).length > 0) columns = c + 1
  }
  if (columns === 0) fail('tiers tab has no header row')

  for (let c = 0; c < columns; c++) {
    const header = cell(rows, 0, c)
    const tier = TIER_OF_HEADER[header]
    if (tier === undefined) fail(`tiers column ${c + 1} has an unrecognised header: "${header}"`)
    for (let r = TIER_BLOCK_FIRST_ROW; r <= TIER_BLOCK_LAST_ROW; r++) {
      const name = cell(rows, r, c)
      if (name.length === 0) continue
      out.push({ name, tier, column: c, row: r, fromQbColumn: header === "QB's" })
    }
  }
  return out
}

// Rank is DERIVED from the board's own shape -- tier first, then the order the
// names appear down each column -- and never read from a market ADP tab,
// because that is consensus and not Andrew's preference. Deriving it this way
// also makes the resolver's "tier must not decrease as rank increases" rule
// true by construction.
//
// This ordering is load-bearing: below `vonaFromRound` the engine follows board
// order outright, so a scrambled rank here is a wrong pick in round one.
export function deriveRanks(entries: TierEntry[]): TierEntry[] {
  const sorted = entries.slice().sort((a, b) => a.tier - b.tier || a.column - b.column || a.row - b.row)
  return sorted
}

// A position for a tier entry, where the sheet states one. The QB column
// settles it by construction; every other column says nothing about position,
// so the caller supplies a lookup.
export function positionOfEntry(
  entry: TierEntry,
  lookup: (name: string) => Position | null
): Position | null {
  if (entry.fromQbColumn) return 'QB'
  return lookup(entry.name)
}

// ---------------------------------------------------------------------------
// The ranked layout: one ROW per player
// ---------------------------------------------------------------------------
//
// The 2026 sheet is shaped nothing like the 2025 one. Instead of a tier grid it
// is a ranked table — the shape a FantasyPros export arrives in:
//
//   RK | TIERS | PLAYER NAME | TEAM | POS | BYE WEEK | UPSIDE | BUST | ...
//    1 |     1 | Jahmyr Gibbs| DET  | RB1 |        6 | ...
//
// Both layouts are supported because both are real: the backtest reads the
// 2025 grid and must keep working, and the live board reads whatever Andrew's
// current sheet looks like.

// Cells that identify a ranked table. Matched case-insensitively against the
// header row, which is how the two layouts are told apart.
const RANKED_NAME_HEADERS = ['player name', 'player', 'name']
const RANKED_TIER_HEADERS = ['tiers', 'tier']
const RANKED_POS_HEADERS = ['pos', 'position']
const RANKED_TEAM_HEADERS = ['team', 'tm']

export interface RankedEntry {
  name: string
  tier: number
  pos: Position
  team: string | null
  row: number
}

function headerIndex(header: string[], candidates: string[]): number {
  for (let c = 0; c < candidates.length; c++) {
    for (let i = 0; i < header.length; i++) {
      if (header[i].trim().toLowerCase() === candidates[c]) return i
    }
  }
  return -1
}

// Sleeper calls team defenses DEF; every ranking site calls them DST or D/ST.
const POSITION_ALIASES: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  PK: 'K',
  DEF: 'DEF',
  DST: 'DEF',
  DFS: 'DEF',
  D: 'DEF',
}

// "RB1", "WR355", "DST" -> the position alone. Ranking exports staple the
// positional rank onto the position, and that number is not a tier.
export function positionFromToken(token: string): Position | null {
  const letters = token.replace(/[^A-Za-z]/g, '').toUpperCase()
  return POSITION_ALIASES[letters] || null
}

// Does this header row describe a ranked table rather than a tier grid?
export function isRankedLayout(rows: string[][]): boolean {
  if (rows.length === 0) return false
  const header = rows[0]
  return headerIndex(header, RANKED_NAME_HEADERS) !== -1 && headerIndex(header, RANKED_TIER_HEADERS) !== -1
}

// A row this parser could not use, kept rather than thrown.
//
// Whether an unusable row is fatal depends on how deep the caller intends to
// read, and the parser does not know that. A 878-row export read to depth 300
// should not be killed by a scratch note at row 850 — but a bad row at 40 must
// still stop the import, because the board would silently be missing a player
// the drafter expects. So the parser reports and the caller decides.
export interface RankedProblem {
  row: number // zero-based row index, as RankedEntry.row
  name: string
  reason: string
}

export function parseRankedTab(rows: string[][]): { entries: RankedEntry[]; problems: RankedProblem[] } {
  if (rows.length === 0) fail('ranked tab is empty')
  const header = rows[0]
  const nameAt = headerIndex(header, RANKED_NAME_HEADERS)
  const tierAt = headerIndex(header, RANKED_TIER_HEADERS)
  const posAt = headerIndex(header, RANKED_POS_HEADERS)
  const teamAt = headerIndex(header, RANKED_TEAM_HEADERS)

  // A missing COLUMN is always fatal and never depth-dependent: no row can be
  // read without it.
  if (nameAt === -1) fail(`ranked tab has no player-name column (looked for ${RANKED_NAME_HEADERS.join(', ')})`)
  if (tierAt === -1) fail(`ranked tab has no tier column (looked for ${RANKED_TIER_HEADERS.join(', ')})`)
  if (posAt === -1) fail(`ranked tab has no position column (looked for ${RANKED_POS_HEADERS.join(', ')})`)

  const entries: RankedEntry[] = []
  const problems: RankedProblem[] = []
  for (let r = 1; r < rows.length; r++) {
    const name = cell(rows, r, nameAt)
    if (name.length === 0) continue

    const tierRaw = cell(rows, r, tierAt)
    const tier = parseInt(tierRaw, 10)
    // The whole value curve is built on tiers, so a row landing in tier NaN
    // prices wrong and everything downstream inherits it.
    if (!isFinite(tier) || tier <= 0) {
      problems.push({ row: r, name, reason: `unusable tier: "${tierRaw}"` })
      continue
    }

    const posRaw = cell(rows, r, posAt)
    const pos = positionFromToken(posRaw)
    if (!pos) {
      problems.push({ row: r, name, reason: `unrecognised position: "${posRaw}"` })
      continue
    }

    const team = teamAt === -1 ? '' : cell(rows, r, teamAt)
    entries.push({ name, tier, pos, team: team.length > 0 ? team : null, row: r })
  }
  if (entries.length === 0) fail('ranked tab has a header but no usable player rows')
  return { entries, problems }
}
