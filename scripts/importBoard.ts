// Turn Andrew's tiered board spreadsheet into config/board.json.
//
//   npm run board:import -- --sheet <doc-id-or-url> --tab "LLL Tiers"
//   npm run resolve-board
//
// Writes NAMES, not ids (D1). scripts/resolveBoard.ts owns id resolution and
// refuses to guess, exiting non-zero with a per-name report on every
// unresolved or ambiguous entry -- and that check is exactly what should stand
// between a spreadsheet and a live draft, where a silent mismatch means the
// wrong player's name on the clock. The backtest importer's more forgiving
// resolver was appropriate to reconstructing history; it is not appropriate
// here.
//
// Only the `players` array is rewritten. Every other key survives byte for
// byte -- season, leagueId, draftId, myUserId, doNotDraft, pins, the rules
// block and the `//`-prefixed comment keys that document it. The rules block
// encodes tuning Andrew has already done (one QB, one TE, no kicker, no
// defense, vonaFromRound 9, minRoundByPos.QB 11) and overwriting it would be a
// real loss, so this splices text rather than re-serialising the file.
//
// Network-touching. See docs/plans/mock-draft-rehearsal/mock-draft-rehearsal-execplan.md, M1.

import * as fs from 'fs'
import * as path from 'path'
import {
  deriveRanks,
  docIdFrom,
  fetchTab,
  isRankedLayout,
  parseRankedTab,
  parseTiersTab,
  positionOfEntry,
  RankedEntry,
  TierEntry,
  TIER_OF_HEADER,
} from '../helpers/draft/sheetBoard'
import { normalizeName } from './resolveBoard'
import { BoardInput, BoardPlayerInput, PlayerMap, Position, TrimmedPlayer } from '../helpers/draft/types'

const ROOT = path.join(__dirname, '..')
const BOARD_FILE = path.join(ROOT, 'config', 'board.json')
const PLAYERS_FILE = path.join(ROOT, 'fixtures', 'players.trim.json')
const DEFAULT_TAB = 'LLL Tiers'

// A board this short is not a board. Andrew's 2025 sheet held 157 tiered
// players; a partial parse -- a renamed column, a changed row bound, a tab
// that came back half-empty -- produces something that still looks plausible
// and drafts badly, so it is a hard failure rather than a warning.
const MIN_PLAUSIBLE_BOARD = 50

// How deep to read a ranked sheet. A 12x14 draft is 168 picks, so 300 covers
// every pick with most of a round to spare, plus the depth the survival
// simulator looks down. Past that a ranked export is mostly players who will
// never be drafted and, increasingly, players Sleeper's current map has never
// heard of -- unsigned veterans and camp bodies that the resolver would then
// refuse, blocking an import over names that could not matter.
const DEFAULT_DEPTH = 300

function fail(msg: string): never {
  throw new Error(`importBoard: ${msg}`)
}

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  const next = process.argv[idx + 1]
  if (idx === -1 || !next || next.indexOf('--') === 0) return null
  return next
}

// ---------------------------------------------------------------------------
// The splice
// ---------------------------------------------------------------------------

// Find the extent of a top-level array value by bracket counting, respecting
// string literals and their escapes so a "]" inside a name cannot end it.
export function findArraySpan(text: string, key: string): { start: number; end: number } {
  const keyAt = text.indexOf(`"${key}"`)
  if (keyAt === -1) fail(`config/board.json has no "${key}" key`)
  const open = text.indexOf('[', keyAt)
  if (open === -1) fail(`config/board.json's "${key}" is not an array`)

  let depth = 0
  let inString = false
  for (let i = open; i < text.length; i++) {
    const ch = text.charAt(i)
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return { start: open, end: i }
    }
  }
  return fail(`config/board.json's "${key}" array is unterminated`)
}

function renderPlayer(p: BoardPlayerInput): string {
  const parts = [`"name": ${JSON.stringify(p.name)}`, `"pos": ${JSON.stringify(p.pos)}`]
  if (p.team) parts.push(`"team": ${JSON.stringify(p.team)}`)
  parts.push(`"tier": ${p.tier}`, `"rank": ${p.rank}`)
  return `{ ${parts.join(', ')} }`
}

// Rewrite ONLY the players array, leaving every other byte of the file exactly
// where it was.
export function splicePlayers(text: string, players: BoardPlayerInput[]): string {
  const span = findArraySpan(text, 'players')

  // Match the file's own indentation rather than assuming two spaces: the
  // outer indent from the line the key sits on, and the element indent from
  // the first element already in the array, so whatever convention the file
  // uses survives the rewrite.
  const lineStart = text.lastIndexOf('\n', span.start) + 1
  const keyIndent = /^[ \t]*/.exec(text.slice(lineStart, span.start))
  const outer = keyIndent ? keyIndent[0] : '  '
  const firstElement = /\[[^\S\n]*\n([ \t]*)\S/.exec(text.slice(span.start, span.end + 1))
  const inner = firstElement ? firstElement[1] : outer + '  '

  const body = players.map((p) => `${inner}${renderPlayer(p)}`).join(',\n')
  const rendered = players.length === 0 ? '[]' : `[\n${body}\n${outer}]`

  const out = text.slice(0, span.start) + rendered + text.slice(span.end + 1)

  // Prove the splice did what it claims before anything is written. A
  // mis-computed span would silently eat the rules block, which is the one
  // thing this script exists to protect.
  const before = JSON.parse(text) as Record<string, unknown>
  const after = JSON.parse(out) as Record<string, unknown>
  const keys = Object.keys(before)
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === 'players') continue
    if (JSON.stringify(before[keys[i]]) !== JSON.stringify(after[keys[i]])) {
      fail(`splice changed "${keys[i]}", which it must not — aborting without writing`)
    }
  }
  if (Object.keys(after).length !== keys.length) {
    fail('splice added or removed a top-level key — aborting without writing')
  }
  if (text.slice(0, span.start) !== out.slice(0, span.start)) {
    fail('splice altered bytes before the players array — aborting without writing')
  }
  if (text.slice(span.end + 1) !== out.slice(out.length - (text.length - span.end - 1))) {
    fail('splice altered bytes after the players array — aborting without writing')
  }
  return out
}

// ---------------------------------------------------------------------------
// Position lookup
// ---------------------------------------------------------------------------

// The sheet states a position only for the QB column. Everything else comes
// from the Sleeper player map -- which is a lookup of what a player IS, not an
// id resolution, so D1 still holds: no player_id is written here.
function positionIndex(players: PlayerMap): (name: string) => Position | null {
  const byName: Record<string, TrimmedPlayer[]> = {}
  const ids = Object.keys(players)
  for (let i = 0; i < ids.length; i++) {
    const p = players[ids[i]]
    const full = p.full_name || `${p.first_name} ${p.last_name}`
    const key = normalizeName(full)
    if (key.length === 0) continue
    if (!byName[key]) byName[key] = []
    byName[key].push(p)
  }
  return (name: string): Position | null => {
    const hits = byName[normalizeName(name)]
    if (!hits || hits.length === 0) return null
    // Two players with one name and two positions is genuinely ambiguous, and
    // guessing would put the wrong position on the board.
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].position !== hits[0].position) return null
    }
    return hits[0].position
  }
}

function teamIndex(players: PlayerMap): (name: string) => string | undefined {
  const byName: Record<string, string[]> = {}
  const ids = Object.keys(players)
  for (let i = 0; i < ids.length; i++) {
    const p = players[ids[i]]
    const full = p.full_name || `${p.first_name} ${p.last_name}`
    const key = normalizeName(full)
    if (key.length === 0 || !p.team) continue
    if (!byName[key]) byName[key] = []
    if (byName[key].indexOf(p.team) === -1) byName[key].push(p.team)
  }
  return (name: string): string | undefined => {
    const hits = byName[normalizeName(name)]
    // A single unambiguous team only. resolveBoard uses team to disambiguate
    // a duplicated name, so a wrong one there is worse than none.
    return hits && hits.length === 1 ? hits[0] : undefined
  }
}

// ---------------------------------------------------------------------------

export function toBoardPlayers(
  ordered: TierEntry[],
  posOf: (name: string) => Position | null,
  teamOf: (name: string) => string | undefined
): { players: BoardPlayerInput[]; unknownPosition: string[] } {
  const players: BoardPlayerInput[] = []
  const unknownPosition: string[] = []
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]
    const pos = positionOfEntry(e, posOf)
    if (!pos) {
      unknownPosition.push(`${e.name} (tier ${e.tier}, column ${e.column + 1}, row ${e.row + 1})`)
      continue
    }
    players.push({
      name: e.name,
      pos,
      team: teamOf(e.name),
      tier: e.tier,
      // Tier-major, then column order within a tier, matching how the sheet
      // reads -- so the board's ordering IS the sheet's ordering.
      rank: players.length + 1,
    })
  }
  return { players, unknownPosition }
}

// A ranked table already states position and team per row, so nothing needs
// looking up. Its own row order is the board order; ranks are renumbered
// contiguously after the excluded positions are dropped, so `rank` stays
// 1..n with no holes for the value curve to trip over.
export function rankedToBoardPlayers(
  entries: RankedEntry[],
  excluded: Position[]
): { players: BoardPlayerInput[]; dropped: Record<string, number> } {
  const players: BoardPlayerInput[] = []
  const dropped: Record<string, number> = {}
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (excluded.indexOf(e.pos) !== -1) {
      dropped[e.pos] = (dropped[e.pos] || 0) + 1
      continue
    }
    players.push({
      name: e.name,
      pos: e.pos,
      team: e.team || undefined,
      tier: e.tier,
      rank: players.length + 1,
    })
  }
  return { players, dropped }
}

// Corrections for a sheet the drafter did not author: a ranking site's
// nickname for someone Sleeper lists differently, and names with no Sleeper
// player behind them at all. Applied before anything else looks at the rows.
//
// Both are reported on every run rather than applied silently. An exclusion
// list that nobody ever reads is how a player who has since signed stays
// undraftable all season.
export function applyCorrections(
  entries: RankedEntry[],
  aliases: Record<string, string>,
  notInLeague: string[]
): { entries: RankedEntry[]; renamed: string[]; excluded: string[]; unusedCorrections: string[] } {
  const excludeSet: Record<string, boolean> = {}
  for (let i = 0; i < notInLeague.length; i++) excludeSet[notInLeague[i]] = true

  const out: RankedEntry[] = []
  const renamed: string[] = []
  const excluded: string[] = []
  const seenAlias: Record<string, boolean> = {}

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (excludeSet[e.name]) {
      excluded.push(e.name)
      continue
    }
    const alias = aliases[e.name]
    if (alias !== undefined) {
      renamed.push(`${e.name} -> ${alias}`)
      seenAlias[e.name] = true
      out.push({ ...e, name: alias })
      continue
    }
    out.push(e)
  }

  // A correction that matches nothing is either a typo or a leftover, and
  // either way the reader should be told rather than left believing it works.
  const unusedCorrections: string[] = []
  const aliasKeys = Object.keys(aliases)
  for (let i = 0; i < aliasKeys.length; i++) {
    if (!seenAlias[aliasKeys[i]]) unusedCorrections.push(`nameAliases["${aliasKeys[i]}"]`)
  }
  for (let i = 0; i < notInLeague.length; i++) {
    if (excluded.indexOf(notInLeague[i]) === -1) unusedCorrections.push(`notInLeague["${notInLeague[i]}"]`)
  }

  // Aliasing onto a name already on the sheet would put one player on the
  // board twice, at two ranks.
  const seen: Record<string, number> = {}
  for (let i = 0; i < out.length; i++) seen[out[i].name] = (seen[out[i].name] || 0) + 1
  const dupes = Object.keys(seen).filter((n) => seen[n] > 1)
  if (dupes.length > 0) fail(`after applying nameAliases these names appear twice: ${dupes.join(', ')}`)

  return { entries: out, renamed, excluded, unusedCorrections }
}

// The resolver requires tier not to decrease as rank increases, and the value
// curve assumes it. Checked here rather than trusted, because a sheet sorted
// by anything other than rank would break it silently.
export function assertTiersMonotone(players: BoardPlayerInput[]): void {
  for (let i = 1; i < players.length; i++) {
    if (players[i].tier < players[i - 1].tier) {
      fail(
        `tier decreases at rank ${players[i].rank} (${players[i].name}, tier ${players[i].tier} ` +
          `after ${players[i - 1].name}, tier ${players[i - 1].tier}) — the sheet is not in board order`
      )
    }
  }
}

async function main(): Promise<void> {
  const sheetArg = arg('sheet')
  if (!sheetArg) {
    fail(
      'no --sheet given. Usage: npm run board:import -- --sheet <doc-id-or-url> --tab "LLL Tiers"\n' +
        '  The sheet must be shared as "anyone with the link can view".'
    )
  }
  const tab = arg('tab') || DEFAULT_TAB
  const docId = docIdFrom(sheetArg)

  if (!fs.existsSync(PLAYERS_FILE)) {
    fail(`missing ${path.relative(ROOT, PLAYERS_FILE)} — run \`npm run fixtures\` first`)
  }
  const playerMap = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8')) as PlayerMap

  // eslint-disable-next-line no-console
  console.log(`reading tab "${tab}" from spreadsheet ${docId}`)
  const rows = await fetchTab(docId, tab)

  // A position the board caps at zero is one Andrew has decided never to
  // draft, so carrying it would only give the engine something it must then
  // refuse. Read from the rules rather than hardcoded, so changing the cap
  // changes the import.
  const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')) as BoardInput
  const excluded: Position[] = []
  const caps = board.rules.maxByPos
  const capKeys = Object.keys(caps) as Position[]
  for (let i = 0; i < capKeys.length; i++) {
    if (caps[capKeys[i]] === 0) excluded.push(capKeys[i])
  }

  const depthArg = arg('depth')
  const depth = depthArg ? parseInt(depthArg, 10) : DEFAULT_DEPTH
  if (!isFinite(depth) || depth < MIN_PLAUSIBLE_BOARD) {
    fail(`--depth must be a number of at least ${MIN_PLAUSIBLE_BOARD}; got "${depthArg}"`)
  }

  let players: BoardPlayerInput[]
  let unknownPosition: string[] = []

  if (isRankedLayout(rows)) {
    // One row per player: the sheet states rank, tier, position and team, so
    // nothing is inferred.
    // eslint-disable-next-line no-console
    console.log('layout: ranked table (one row per player)')
    const parsed = parseRankedTab(rows)
    // Corrections first, so `depth` counts usable rows rather than rows that
    // are about to be thrown away.
    const corrected = applyCorrections(parsed, board.nameAliases || {}, board.notInLeague || [])
    for (let i = 0; i < corrected.renamed.length; i++) {
      // eslint-disable-next-line no-console
      console.log(`  renamed (nameAliases): ${corrected.renamed[i]}`)
    }
    if (corrected.excluded.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  excluded (notInLeague): ${corrected.excluded.join(', ')}`)
    }
    for (let i = 0; i < corrected.unusedCorrections.length; i++) {
      // eslint-disable-next-line no-console
      console.log(`  NOTE: ${corrected.unusedCorrections[i]} matched nothing on the sheet — stale?`)
    }

    const entries = corrected.entries
    const limited = entries.slice(0, depth)
    const result = rankedToBoardPlayers(limited, excluded)
    players = result.players
    const droppedKeys = Object.keys(result.dropped)
    if (droppedKeys.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `  dropped ${droppedKeys.map((k) => `${result.dropped[k]} ${k}`).join(', ')} ` +
          '(capped at 0 in board.rules.maxByPos — drafted off waivers)'
      )
    }
    if (entries.length > depth) {
      // eslint-disable-next-line no-console
      console.log(
        `  read the top ${depth} of ${entries.length} rows (--depth to change). ` +
          'Anyone past that is priced by ADP interpolation, which is what off-board means.'
      )
    }
  } else {
    // One column per tier: the 2025 layout.
    // eslint-disable-next-line no-console
    console.log('layout: tier grid (one column per tier)')
    const ordered = deriveRanks(parseTiersTab(rows))
    for (let i = 0; i < ordered.length; i++) {
      if (!isFinite(ordered[i].tier) || ordered[i].tier <= 0) {
        fail(`"${ordered[i].name}" has no usable tier — recognised headers are ${Object.keys(TIER_OF_HEADER).join(', ')}`)
      }
    }
    const result = toBoardPlayers(ordered.slice(0, depth), positionIndex(playerMap), teamIndex(playerMap))
    players = result.players
    unknownPosition = result.unknownPosition
  }

  assertTiersMonotone(players)

  if (unknownPosition.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\nimportBoard FAILED — ${unknownPosition.length} name(s) have no position in the Sleeper player map.\n` +
        'A board entry needs a position, and guessing one would put the wrong player on the clock.\n' +
        'Fix the spelling in the sheet (or refresh the map with `npm run fixtures`) and re-run:'
    )
    for (let i = 0; i < unknownPosition.length; i++) {
      // eslint-disable-next-line no-console
      console.error(`  ${unknownPosition[i]}`)
    }
    process.exit(1)
  }

  if (players.length < MIN_PLAUSIBLE_BOARD) {
    fail(
      `parsed only ${players.length} players from tab "${tab}" (minimum ${MIN_PLAUSIBLE_BOARD}). ` +
        'A partially-parsed board looks plausible and drafts badly, so this is fatal rather than a warning. ' +
        'Check the tab name and that the tier block still occupies spreadsheet rows 2-24.'
    )
  }

  const text = fs.readFileSync(BOARD_FILE, 'utf8')
  const spliced = splicePlayers(text, players)
  fs.writeFileSync(BOARD_FILE, spliced)
  if (board.draftReady === true) {
    // eslint-disable-next-line no-console
    console.log(
      '\nNOTE: this board is still marked draftReady — the player list just changed underneath it. ' +
        'Re-check it before drafting live.'
    )
  }

  const tierCount: Record<number, number> = {}
  const posCount: Record<string, number> = {}
  for (let i = 0; i < players.length; i++) {
    tierCount[players[i].tier] = (tierCount[players[i].tier] || 0) + 1
    posCount[players[i].pos] = (posCount[players[i].pos] || 0) + 1
  }
  const tierNos = Object.keys(tierCount).map(Number).sort((a, b) => a - b)

  // eslint-disable-next-line no-console
  console.log(`wrote ${players.length} players in ${tierNos.length} tiers -> config/board.json`)
  // eslint-disable-next-line no-console
  console.log(`  by tier: ${tierNos.map((t) => `T${t}=${tierCount[t]}`).join(' ')}`)
  // eslint-disable-next-line no-console
  console.log(`  by position: ${Object.keys(posCount).sort().map((p) => `${p}=${posCount[p]}`).join(' ')}`)
  // eslint-disable-next-line no-console
  console.log(`  first 15: ${players.slice(0, 15).map((p) => `${p.rank}. ${p.pos} ${p.name}`).join(', ')}`)
  // eslint-disable-next-line no-console
  console.log('\nevery other key in config/board.json is untouched. Next: npm run resolve-board')
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}

// Re-exported so the board type is visible to a reader of this file.
export type { BoardInput }
