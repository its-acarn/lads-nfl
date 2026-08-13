// Resolve config/board.json names to Sleeper player_ids using
// fixtures/players.trim.json. Never guesses: exits non-zero with a per-name
// report for every unresolved or ambiguous entry.
//
//   npm run resolve-board

import * as fs from 'fs'
import * as path from 'path'
import {
  BoardInput,
  BoardPlayerInput,
  PlayerMap,
  ResolvedBoard,
  ResolvedBoardPlayer,
  ResolvedPin,
  TrimmedPlayer,
} from '../helpers/draft/types'

const ROOT = path.join(__dirname, '..')
const BOARD_FILE = path.join(ROOT, 'config', 'board.json')
const PLAYERS_FILE = path.join(ROOT, 'fixtures', 'players.trim.json')
const OUT_FILE = path.join(ROOT, 'config', 'board.resolved.json')

// Lowercase, strip punctuation and generational suffixes so "Marvin Harrison Jr."
// matches "marvin harrison".
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Failure {
  name: string
  reason: string
}

function findMatches(entry: { name: string; pos: string; team?: string }, players: TrimmedPlayer[]): TrimmedPlayer[] {
  const wanted = normalizeName(entry.name)
  let matches = players.filter(
    (p) => p.position === entry.pos && normalizeName(p.full_name || `${p.first_name} ${p.last_name}`) === wanted
  )
  if (matches.length > 1 && entry.team) {
    matches = matches.filter((p) => p.team === entry.team)
  }
  return matches
}

function main(): void {
  if (!fs.existsSync(BOARD_FILE)) throw new Error(`missing ${BOARD_FILE}`)
  if (!fs.existsSync(PLAYERS_FILE)) throw new Error(`missing ${PLAYERS_FILE} — run \`npm run fixtures\` first`)

  const board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')) as BoardInput
  const playerMap = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8')) as PlayerMap
  const players: TrimmedPlayer[] = Object.keys(playerMap).map((id) => playerMap[id])

  const failures: Failure[] = []

  // --- schema sanity, hand-rolled and loud -------------------------------
  if (!Array.isArray(board.players) || board.players.length === 0) throw new Error('board.players missing/empty')
  if (typeof board.myUserId !== 'string') throw new Error('board.myUserId missing (Sleeper user_id as a string)')
  const rules = board.rules
  if (!rules || typeof rules.minRoundK !== 'number' || typeof rules.minRoundDEF !== 'number')
    throw new Error('board.rules.minRoundK/minRoundDEF missing')
  if (typeof rules.stashRound !== 'number' || typeof rules.offBoardDiscount !== 'number')
    throw new Error('board.rules.stashRound/offBoardDiscount missing')

  // Ranks must be unique; tiers must be monotone non-decreasing in rank order.
  const sorted = board.players.slice().sort((a, b) => a.rank - b.rank)
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    if (i > 0 && sorted[i - 1].rank === p.rank) failures.push({ name: p.name, reason: `duplicate rank ${p.rank}` })
    if (i > 0 && p.tier < sorted[i - 1].tier)
      failures.push({ name: p.name, reason: `tier ${p.tier} decreases after rank ${sorted[i - 1].rank} (tier ${sorted[i - 1].tier})` })
  }

  // --- resolve board players ---------------------------------------------
  const resolvedPlayers: ResolvedBoardPlayer[] = []
  for (let i = 0; i < sorted.length; i++) {
    const entry: BoardPlayerInput = sorted[i]
    const matches = findMatches(entry, players)
    if (matches.length === 1) {
      resolvedPlayers.push({ ...entry, player_id: matches[0].player_id })
    } else if (matches.length === 0) {
      failures.push({ name: entry.name, reason: `no ${entry.pos} named "${entry.name}"${entry.team ? ` on ${entry.team}` : ''}` })
    } else {
      const teams = matches.map((m) => `${m.player_id}/${m.team || '??'}`).join(', ')
      failures.push({ name: entry.name, reason: `ambiguous (${matches.length} matches: ${teams}) — add "team"` })
    }
  }

  // --- resolve do-not-draft + pins (name-only, any position) --------------
  const byName: Record<string, TrimmedPlayer[]> = {}
  for (let i = 0; i < players.length; i++) {
    const key = normalizeName(players[i].full_name || `${players[i].first_name} ${players[i].last_name}`)
    if (!byName[key]) byName[key] = []
    byName[key].push(players[i])
  }
  const resolveByName = (name: string, what: string): string | null => {
    const matches = byName[normalizeName(name)] || []
    if (matches.length === 1) return matches[0].player_id
    failures.push({
      name,
      reason:
        matches.length === 0
          ? `${what}: no player by this name`
          : `${what}: ambiguous (${matches.length} matches) — use the exact board entry instead`,
    })
    return null
  }

  const doNotDraftIds: string[] = []
  for (let i = 0; i < (board.doNotDraft || []).length; i++) {
    const id = resolveByName(board.doNotDraft[i], 'doNotDraft')
    if (id) doNotDraftIds.push(id)
  }
  const pins: ResolvedPin[] = []
  for (let i = 0; i < (board.pins || []).length; i++) {
    const pin = board.pins[i]
    const id = resolveByName(pin.name, 'pin')
    if (id) pins.push({ ...pin, player_id: id })
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`resolve-board FAILED — ${failures.length} problem(s):`)
    for (let i = 0; i < failures.length; i++) {
      // eslint-disable-next-line no-console
      console.error(`  - ${failures[i].name}: ${failures[i].reason}`)
    }
    process.exit(1)
  }

  const out: ResolvedBoard = {
    season: board.season,
    leagueId: board.leagueId,
    draftId: board.draftId,
    myUserId: board.myUserId,
    players: resolvedPlayers,
    doNotDraftIds,
    pins,
    rules: board.rules,
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n')
  // eslint-disable-next-line no-console
  console.log(`resolved ${resolvedPlayers.length} players -> ${path.relative(process.cwd(), OUT_FILE)}`)
}

if (require.main === module) {
  main()
}
