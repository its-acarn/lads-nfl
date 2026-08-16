// Fold the Sleeper picks feed into a BoardState: available pool, per-roster
// positional counts, my roster, current (lowest unfilled) pick number, and my
// remaining picks. Validators throw rather than guessing.

import { myPickNumbers, myRosterId, slotToRoster, assertSupportedDraft } from './snake'
import {
  BoardState,
  DraftConfig,
  PlayerMap,
  PoolPlayer,
  Position,
  ResolvedBoard,
  SleeperPick,
} from './types'
import { buildValuer, ValueOpts } from './value'

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const OFF_BOARD_SEARCH_RANK = 9999999

function emptyCounts(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
}

// Which roster a pick belongs to.
//
// Sleeper leaves `roster_id` null on EVERY pick of a mock draft — there are no
// rosters behind a mock to point at. Trusting the field blindly meant every
// pick was skipped in mock mode, so the engine believed it held nobody: caps
// stopped binding (it offered a second TE and, on the last pick, a second QB
// against maxByPos.QB = 1), forced-starter logic read an empty lineup, and
// DRAFT COMPLETE printed a blank roster. Found by running a real mock; invisible
// to all nine committed fixtures, which are real drafts where the field is set.
//
// `draft_slot` is always present, and slot_to_roster_id maps it — identity for
// a mock, the real mapping for a league. Prefer the explicit field where it
// exists so real drafts are unaffected.
export function rosterIdOfPick(pick: SleeperPick, draft: DraftConfig['draft']): number | null {
  if (pick.roster_id !== null && pick.roster_id !== undefined) return pick.roster_id
  if (typeof pick.draft_slot !== 'number') return null
  try {
    return slotToRoster(draft, pick.draft_slot)
  } catch (e) {
    return null
  }
}

export function positionOfPick(pick: SleeperPick, players: PlayerMap): Position {
  const known = players[pick.player_id]
  if (known) return known.position
  const metaPos = pick.metadata && pick.metadata.position
  if (metaPos && POSITIONS.indexOf(metaPos as Position) !== -1) return metaPos as Position
  throw new Error(
    `pick ${pick.pick_no}: player ${pick.player_id} unknown to players map and pick.metadata.position is unusable (${String(metaPos)})`
  )
}

export function nameOfPick(pick: SleeperPick, players: PlayerMap): string {
  const known = players[pick.player_id]
  if (known && known.full_name) return known.full_name
  const meta = pick.metadata
  if (meta && (meta.first_name || meta.last_name)) {
    return `${meta.first_name || ''} ${meta.last_name || ''}`.trim()
  }
  return pick.player_id
}

export function buildState(
  cfg: DraftConfig,
  picks: SleeperPick[],
  board: ResolvedBoard,
  players: PlayerMap,
  valueOpts?: Partial<ValueOpts>
): BoardState {
  assertSupportedDraft(cfg.draft)
  const teams = cfg.draft.settings.teams
  const rounds = cfg.draft.settings.rounds
  const totalPicks = teams * rounds

  const picksByNo: Record<number, SleeperPick> = {}
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    if (p.pick_no < 1 || p.pick_no > totalPicks) throw new Error(`pick_no ${p.pick_no} out of range 1..${totalPicks}`)
    if (picksByNo[p.pick_no]) throw new Error(`duplicate pick_no ${p.pick_no} in picks feed`)
    picksByNo[p.pick_no] = p
  }

  // Lowest unfilled pick number — robust to a non-contiguous feed (keepers).
  let currentPickNo = totalPicks + 1
  for (let n = 1; n <= totalPicks; n++) {
    if (!picksByNo[n]) {
      currentPickNo = n
      break
    }
  }
  const currentRound = Math.min(rounds, Math.floor((currentPickNo - 1) / teams) + 1)

  const posCountsByRoster: Record<number, Record<Position, number>> = {}
  const pickedIds: Record<string, boolean> = {}
  const myRoster = myRosterId(cfg.draft, cfg.myUserId)
  const myRosterIds: string[] = []
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    pickedIds[p.player_id] = true
    const rosterId = rosterIdOfPick(p, cfg.draft)
    const pos = positionOfPick(p, players)
    if (rosterId !== null && rosterId !== undefined) {
      if (!posCountsByRoster[rosterId]) posCountsByRoster[rosterId] = emptyCounts()
      posCountsByRoster[rosterId][pos]++
      if (rosterId === myRoster) myRosterIds.push(p.player_id)
    }
  }
  const myPosCounts = posCountsByRoster[myRoster] || emptyCounts()

  const myPickNos = myPickNumbers(cfg)
  const myRemainingPickNos = myPickNos.filter((n) => n >= currentPickNo)

  // Available pool, valued off the board.
  const searchRankById: Record<string, number | null> = {}
  const allIds = Object.keys(players)
  for (let i = 0; i < allIds.length; i++) {
    searchRankById[allIds[i]] = players[allIds[i]].search_rank
  }
  const valuer = buildValuer(board, searchRankById, valueOpts)

  const boardRankById: Record<string, number> = {}
  const tierById: Record<string, number> = {}
  for (let i = 0; i < board.players.length; i++) {
    boardRankById[board.players[i].player_id] = board.players[i].rank
    tierById[board.players[i].player_id] = board.players[i].tier
  }

  // Sleeper publishes no search_rank for team defenses -- all 32 are null.
  // Null and its own 9999999 sentinel both mean "no ADP".
  const hasRealRank = (sr: number | null): boolean =>
    typeof sr === 'number' && sr < OFF_BOARD_SEARCH_RANK

  // Estimate an ADP for board players Sleeper has none for, by interpolating
  // the board's own (board rank -> ADP) relationship. A defense sitting at
  // board rank 120 gets roughly the ADP of the other players ranked near 120,
  // which is a defensible guess at when the room takes him.
  //
  // Parking them on a far sentinel instead -- which is what happened before --
  // makes the simulation believe no defense is ever drafted: every one
  // survives with probability 1, so E[best DEF] equals the best defense's own
  // value and its edge is exactly zero. A defense could then never be chosen
  // on score, only by forced mode.
  const adpCurve: { boardRank: number; adp: number }[] = []
  for (let i = 0; i < board.players.length; i++) {
    const sr = players[board.players[i].player_id] ? players[board.players[i].player_id].search_rank : null
    if (hasRealRank(sr)) adpCurve.push({ boardRank: board.players[i].rank, adp: sr as number })
  }
  adpCurve.sort((a, b) => a.boardRank - b.boardRank)

  let maxKnownRank = 0
  for (let i = 0; i < allIds.length; i++) {
    const sr = players[allIds[i]].search_rank
    if (hasRealRank(sr) && (sr as number) > maxKnownRank) maxKnownRank = sr as number
  }

  const estimateAdp = (boardRank: number): number => {
    if (adpCurve.length === 0) return maxKnownRank + 1 + boardRank
    if (boardRank <= adpCurve[0].boardRank) return adpCurve[0].adp
    const last = adpCurve[adpCurve.length - 1]
    if (boardRank >= last.boardRank) return last.adp + (boardRank - last.boardRank)
    for (let i = 1; i < adpCurve.length; i++) {
      if (boardRank <= adpCurve[i].boardRank) {
        const a = adpCurve[i - 1]
        const b = adpCurve[i]
        const t = (boardRank - a.boardRank) / (b.boardRank - a.boardRank)
        return Math.round(a.adp + (b.adp - a.adp) * t)
      }
    }
    return last.adp
  }

  const pool: PoolPlayer[] = []
  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i]
    if (pickedIds[id]) continue
    const p = players[id]
    const onBoardValue = valuer.valueForBoardPlayer(id)
    const boardRank = boardRankById[id]
    const searchRank = hasRealRank(p.search_rank)
      ? (p.search_rank as number)
      : boardRank !== undefined
      ? estimateAdp(boardRank)
      : OFF_BOARD_SEARCH_RANK
    const value = onBoardValue !== null ? onBoardValue : valuer.valueForOffBoard(searchRank)
    pool.push({
      player_id: id,
      name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id,
      pos: p.position,
      team: p.team,
      value,
      offBoard: onBoardValue === null,
      tier: tierById[id] !== undefined ? tierById[id] : null,
      boardRank: boardRankById[id] !== undefined ? boardRankById[id] : null,
      searchRank,
      injuryStatus: p.injury_status,
      status: p.status,
    })
  }
  // Value desc; deterministic tie-breaks by searchRank then player_id.
  pool.sort((a, b) => b.value - a.value || a.searchRank - b.searchRank || (a.player_id < b.player_id ? -1 : 1))

  return {
    cfg,
    board,
    totalPicks,
    picksByNo,
    currentPickNo,
    currentRound,
    myPickNos,
    myRemainingPickNos,
    myRosterIds,
    myPosCounts,
    posCountsByRoster,
    pool,
  }
}
