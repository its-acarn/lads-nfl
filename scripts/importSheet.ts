// Turn Andrew's 2025 board spreadsheet into the two artifacts the backtest
// needs, which are deliberately kept apart:
//
//   config/board.2025.json               PREFERENCE. What the engine should
//                                        want. From the "LLL Tiers" tab.
//   fixtures/backtest2025/adp.sheet.json MARKET. What the room will do. From
//                                        the "List" tab.
//
// Mixing the two would let market consensus leak into the value function and
// quietly turn the backtest into a test of ADP rather than a test of the
// board, so nothing here ever writes a List rank into the board.
//
//   npm run backtest:board
//   npm run backtest:board -- --sheet <doc-id-or-url>
//
// Network-touching; its output is committed so the backtest itself runs
// offline. See docs/plans/draft-backtest-2025/draft-backtest-2025-execplan.md,
// M2.

import * as fs from 'fs'
import * as path from 'path'
import { ladsLeagueId2025 } from '../config/config'
import { buildIdIndex, IdEntry } from '../helpers/draft/backtest/playerIds'
import { joinName, parsePosToken } from '../helpers/draft/backtest/names'
import {
  PlayerMap,
  Position,
  ResolvedBoard,
  ResolvedBoardPlayer,
  SleeperPick,
} from '../helpers/draft/types'
import { JimmygPick, SheetAdpEntry } from '../helpers/draft/backtest/types'

const ROOT = path.join(__dirname, '..')
const DEFAULT_DOC_ID = '1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88'
const LADS_2025_DRAFT_ID = '1181351037804883969'
const ANDREW_USER_ID = '82919512949014528'

// The board tab is laid out one column per tier rather than one row per
// player, and the tier block occupies rows 2..24 only. Below that, column A
// continues with a 351-name scratch list which is NOT part of the board; a
// naive read of the whole column swallows it and reports 509 tiered players
// instead of 157.
const TIER_BLOCK_FIRST_ROW = 1 // zero-based, i.e. the row after the header
const TIER_BLOCK_LAST_ROW = 23 // zero-based inclusive -> spreadsheet row 24

// Column header -> tier number. The two adjacent columns both labelled "Last
// Tier" are one tier; nothing in the sheet distinguishes them. Quarterbacks
// have no tier of their own and are priced level with the last tier, which is
// an assumption recorded in the plan's Decision Log, not something the sheet
// states -- M6 reports which round the engine actually takes a QB in as the
// check on it.
const TIER_OF_HEADER: Record<string, number> = {
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

const EXPECTED_LIST_HEADER = ['Rank', 'Player', 'Team', 'Bye', 'POS', 'Sleeper']

// The lads 2025 draft is 12 teams x 14 rounds. An ADP entry ranked inside that
// depth is a player the room could plausibly take, so failing to resolve one is
// fatal. Deeper entries are background for the opponent model only.
//
// The deep tail does not resolve cleanly and cannot be made to: those players
// were drafted in neither 2025 fixture AND have since dropped out of Sleeper's
// 2026 map because they are no longer on an NFL roster, so no source of any
// vintage can supply an id for them. They are reported and dropped rather than
// blocking the import. Note this cannot silently lose anyone who mattered: the
// id index is built from the lads 2025 picks feed, so every player actually
// drafted that year resolves by construction.
const DRAFTABLE_DEPTH = 168

// Andrew's roster rules, as stated: one quarterback, one tight end, no kicker
// and no defense. RB and WR are left permissive so the board drives those, not
// the cap -- with 14 picks and the four other positions settled, everything
// else is running backs and receivers anyway.
//
// vonaFromRound 9: rounds 1-8 take the highest-ranked player on the board and
// ignore positional scarcity entirely; from round 9 the scarcity rule takes
// over. Without this the board's within-tier ordering is worth hundredths of a
// point against several points of scarcity and is simply never heard -- which
// is how the first run passed over Bijan Robinson, ranked 2, for CeeDee Lamb,
// ranked 4, at pick 2.
//
// The forced-mode sensitivity run in M6 overrides the K and DEF caps.
const BOARD_RULES = {
  maxByPos: { QB: 1, RB: 8, WR: 8, TE: 1, K: 0, DEF: 0 },
  minRoundByPos: { QB: 11, K: 13, DEF: 12 },
  stashRound: 12,
  offBoardDiscount: 0.8,
  vonaFromRound: 9,
  // Andrew's call: judge a pick on his board and on scarcity alone. No
  // roster-need weighting, and no collapsing to unfilled starters at the end.
  useRosterNeed: false,
  useForcedStarters: true,
}

function fail(msg: string): never {
  throw new Error(`importSheet: ${msg}`)
}

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
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

function cell(rows: string[][], r: number, c: number): string {
  const row = rows[r]
  if (!row || c >= row.length) return ''
  return row[c].trim()
}

// The gviz endpoint addresses a tab by name, which keeps this readable and
// survives the sheet being reordered; gids would not.
async function fetchTab(docId: string, tab: string): Promise<string[][]> {
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
// The List tab -> ADP
// ---------------------------------------------------------------------------

// An ADP row mid-import, before its id is resolved. The committed shape
// (helpers/draft/backtest/types.ts) has a non-null player_id because entries
// that never resolve are dropped rather than written.
export interface PendingAdpEntry {
  player_id: string | null
  name: string
  pos: Position
  team: string | null
  rank: number
  // Sleeper's own ADP as captured in the sheet. Blank for 45 of the 358 rows,
  // mostly kickers and defenses; the universe falls back to `rank` there.
  sleeper: number | null
}

export function parseListTab(rows: string[][]): PendingAdpEntry[] {
  const header = EXPECTED_LIST_HEADER.map((_, i) => cell(rows, 0, i))
  if (header.join(',') !== EXPECTED_LIST_HEADER.join(',')) {
    fail(`List tab header changed: got [${header.join(', ')}], expected [${EXPECTED_LIST_HEADER.join(', ')}]`)
  }
  const out: PendingAdpEntry[] = []
  for (let r = 1; r < rows.length; r++) {
    const name = cell(rows, r, 1)
    if (name.length === 0) continue
    const rankRaw = cell(rows, r, 0)
    const rank = parseInt(rankRaw, 10)
    if (!isFinite(rank)) fail(`List row ${r + 1} ("${name}") has an unparseable Rank: "${rankRaw}"`)
    const posRaw = cell(rows, r, 4)
    const token = parsePosToken(posRaw)
    if (!token) fail(`List row ${r + 1} ("${name}") has an unrecognised POS: "${posRaw}"`)
    const teamRaw = cell(rows, r, 2)
    const sleeperRaw = cell(rows, r, 5)
    const sleeper = sleeperRaw.length > 0 ? parseInt(sleeperRaw, 10) : NaN
    out.push({
      player_id: null,
      name,
      pos: token.pos,
      // Defense rows carry the literal "DST" in the Team column rather than a
      // team abbreviation, so there is no team to record for them.
      team: token.pos === 'DEF' || teamRaw.length === 0 ? null : teamRaw,
      rank,
      sleeper: isFinite(sleeper) ? sleeper : null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The LLL Tiers tab -> board
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
  if (columns === 0) fail('LLL Tiers tab has no header row')

  for (let c = 0; c < columns; c++) {
    const header = cell(rows, 0, c)
    const tier = TIER_OF_HEADER[header]
    if (tier === undefined) fail(`LLL Tiers column ${c + 1} has an unrecognised header: "${header}"`)
    for (let r = TIER_BLOCK_FIRST_ROW; r <= TIER_BLOCK_LAST_ROW; r++) {
      const name = cell(rows, r, c)
      if (name.length === 0) continue
      out.push({ name, tier, column: c, row: r, fromQbColumn: header === "QB's" })
    }
  }
  return out
}

// Rank is DERIVED from the board's own shape -- tier first, then the order the
// names appear down each column -- and never read from the List tab, because
// List is market data and not Andrew's preference. Deriving it this way also
// makes the resolver's "tier must not decrease as rank increases" rule true by
// construction.
export function deriveRanks(entries: TierEntry[]): TierEntry[] {
  const sorted = entries.slice().sort((a, b) => a.tier - b.tier || a.column - b.column || a.row - b.row)
  return sorted
}

// ---------------------------------------------------------------------------

interface Diagnostics {
  unresolved: string[]
  provenance: Record<string, number>
}

function buildLayers(): { layers: IdEntry[][]; byId: Record<string, { pos: Position; team: string | null }> } {
  const byId: Record<string, { pos: Position; team: string | null }> = {}

  const ladsPicks = readJson<SleeperPick[]>(path.join(ROOT, 'fixtures', 'lads', '2025', 'picks.json'))
  const lads: IdEntry[] = []
  for (let i = 0; i < ladsPicks.length; i++) {
    const p = ladsPicks[i]
    const meta = p.metadata || {}
    const token = parsePosToken(meta.position || '')
    if (!token) continue
    const name = joinName(meta.first_name || null, meta.last_name || null)
    if (name.length === 0) continue
    lads.push({ player_id: p.player_id, name, position: token.pos, provenance: 'lads2025' })
    byId[p.player_id] = { pos: token.pos, team: meta.team || null }
  }

  const jimmy = readJson<JimmygPick[]>(path.join(ROOT, 'fixtures', 'backtest2025', 'adp.jimmyg.json'))
  const jimmyLayer: IdEntry[] = []
  for (let i = 0; i < jimmy.length; i++) {
    const p = jimmy[i]
    const token = parsePosToken(p.position || '')
    if (!token) continue
    const name = joinName(p.first_name, p.last_name)
    if (name.length === 0) continue
    jimmyLayer.push({ player_id: p.player_id, name, position: token.pos, provenance: 'jimmyg2025' })
    if (!byId[p.player_id]) byId[p.player_id] = { pos: token.pos, team: p.team }
  }

  const trim = readJson<PlayerMap>(path.join(ROOT, 'fixtures', 'players.trim.json'))
  const trimLayer: IdEntry[] = []
  const ids = Object.keys(trim)
  for (let i = 0; i < ids.length; i++) {
    const p = trim[ids[i]]
    const name = joinName(p.first_name, p.last_name, p.full_name)
    if (name.length === 0) continue
    trimLayer.push({ player_id: p.player_id, name, position: p.position, provenance: 'trim2026' })
    if (!byId[p.player_id]) byId[p.player_id] = { pos: p.position, team: p.team }
  }

  return { layers: [lads, jimmyLayer, trimLayer], byId }
}

async function main(): Promise<void> {
  const sheetArg = arg('sheet')
  let docId = DEFAULT_DOC_ID
  if (sheetArg) {
    const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(sheetArg)
    docId = m ? m[1] : sheetArg
  }

  const { layers, byId } = buildLayers()
  const index = buildIdIndex(layers)
  const ambiguous = index.ambiguousKeys()

  const adp = parseListTab(await fetchTab(docId, 'List'))
  const tiers = deriveRanks(parseTiersTab(await fetchTab(docId, 'LLL Tiers')))

  // --- resolve ADP ---------------------------------------------------------
  const adpDiag: Diagnostics = { unresolved: [], provenance: {} }
  const adpByName: Record<string, PendingAdpEntry> = {}
  for (let i = 0; i < adp.length; i++) {
    const e = adp[i]
    const hit = index.resolve(e.name, e.pos)
    if (hit) {
      e.player_id = hit.player_id
      adpDiag.provenance[hit.provenance] = (adpDiag.provenance[hit.provenance] || 0) + 1
    } else {
      adpDiag.unresolved.push(`${e.name} (${e.pos}, rank ${e.rank})`)
    }
    adpByName[e.name] = e
  }

  // --- resolve board -------------------------------------------------------
  const players: ResolvedBoardPlayer[] = []
  const boardUnresolved: string[] = []
  const posCounts: Record<string, number> = {}
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const fromList = adpByName[t.name]
    // Position: the QB column settles it by construction; otherwise prefer the
    // sheet's own ADP tab, falling back to what Sleeper had on draft day.
    let pos: Position | null = t.fromQbColumn ? 'QB' : fromList ? fromList.pos : null
    const hit = index.resolve(t.name, pos)
    if (!hit) {
      boardUnresolved.push(`${t.name} (tier ${t.tier}${pos ? `, ${pos}` : ''})`)
      continue
    }
    if (!pos) pos = byId[hit.player_id] ? byId[hit.player_id].pos : null
    if (!pos) {
      boardUnresolved.push(`${t.name} (tier ${t.tier}) — resolved to ${hit.player_id} but no position known`)
      continue
    }
    const team = fromList && fromList.team ? fromList.team : byId[hit.player_id] ? byId[hit.player_id].team : null
    posCounts[pos] = (posCounts[pos] || 0) + 1
    players.push({
      name: t.name,
      pos,
      team: team || undefined,
      tier: t.tier,
      rank: players.length + 1,
      player_id: hit.player_id,
    })
  }

  // --- loud failure --------------------------------------------------------
  // An unresolved BOARD name is always fatal: the engine cannot draft a player
  // it cannot identify. An unresolved ADP name is fatal only inside the
  // draftable depth; past that it is background the opponent model can do
  // without, so it is reported and dropped.
  const fatalAdp: string[] = []
  const droppedAdp: string[] = []
  for (let i = 0; i < adp.length; i++) {
    if (adp[i].player_id !== null) continue
    const label = `${adp[i].name} (${adp[i].pos}, rank ${adp[i].rank})`
    if (adp[i].rank <= DRAFTABLE_DEPTH) fatalAdp.push(label)
    else droppedAdp.push(label)
  }

  if (boardUnresolved.length > 0 || fatalAdp.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`\nimportSheet FAILED — ${boardUnresolved.length} board and ${fatalAdp.length} draftable ADP name(s) unresolved:`)
    for (let i = 0; i < boardUnresolved.length; i++) {
      // eslint-disable-next-line no-console
      console.error(`  board: ${boardUnresolved[i]}`)
    }
    for (let i = 0; i < fatalAdp.length; i++) {
      // eslint-disable-next-line no-console
      console.error(`  adp:   ${fatalAdp[i]}`)
    }
    if (ambiguous.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`  ambiguous keys: ${ambiguous.join(', ')}`)
    }
    process.exit(1)
  }

  // Drop the unresolvable tail rather than writing entries with a null id that
  // every consumer would have to filter.
  const adpResolved: SheetAdpEntry[] = []
  for (let i = 0; i < adp.length; i++) {
    const e = adp[i]
    if (e.player_id === null) continue
    adpResolved.push({ player_id: e.player_id, name: e.name, pos: e.pos, team: e.team, rank: e.rank, sleeper: e.sleeper })
  }

  // --- invariants ----------------------------------------------------------
  if (posCounts.K || posCounts.DEF) {
    fail(`board contains ${posCounts.K || 0} K and ${posCounts.DEF || 0} DEF; the board must contain neither`)
  }
  for (let i = 1; i < players.length; i++) {
    if (players[i].tier < players[i - 1].tier) {
      fail(`tier decreases at rank ${players[i].rank} (${players[i].name}) — derived ranks are not monotone`)
    }
  }

  const board: ResolvedBoard = {
    season: 2025,
    leagueId: ladsLeagueId2025,
    draftId: LADS_2025_DRAFT_ID,
    myUserId: ANDREW_USER_ID,
    players,
    doNotDraftIds: [],
    pins: [],
    rules: BOARD_RULES,
  }

  writeJson(path.join(ROOT, 'config', 'board.2025.json'), board)
  writeJson(path.join(ROOT, 'fixtures', 'backtest2025', 'adp.sheet.json'), adpResolved)

  if (droppedAdp.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `\ndropped ${droppedAdp.length} ADP entries past rank ${DRAFTABLE_DEPTH} with no resolvable id ` +
        `(never drafted in either 2025 fixture, and gone from the 2026 player map):`
    )
    for (let i = 0; i < droppedAdp.length; i++) {
      // eslint-disable-next-line no-console
      console.log(`  ${droppedAdp[i]}`)
    }
  }

  const tierCount: Record<number, number> = {}
  for (let i = 0; i < players.length; i++) tierCount[players[i].tier] = (tierCount[players[i].tier] || 0) + 1
  const tierNos = Object.keys(tierCount).map(Number).sort((a, b) => a - b)
  // eslint-disable-next-line no-console
  console.log(`board: ${players.length} players in ${tierNos.length} tiers -> config/board.2025.json`)
  // eslint-disable-next-line no-console
  console.log(`  by tier: ${tierNos.map((t) => `T${t}=${tierCount[t]}`).join(' ')}`)
  // eslint-disable-next-line no-console
  console.log(`  by position: ${Object.keys(posCounts).sort().map((p) => `${p}=${posCounts[p]}`).join(' ')}`)
  // eslint-disable-next-line no-console
  console.log(
    `adp: ${adpResolved.length} players -> fixtures/backtest2025/adp.sheet.json` +
      ` (${adp.length} on the sheet, ${droppedAdp.length} dropped past rank ${DRAFTABLE_DEPTH})`
  )
  // eslint-disable-next-line no-console
  console.log(`  id provenance: ${Object.keys(adpDiag.provenance).sort().map((k) => `${k}=${adpDiag.provenance[k]}`).join(' ')}`)
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
