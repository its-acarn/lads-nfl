// Turn a finished draft into a readable account of the team, good enough to
// judge whether the board did its job.
//
// Reads a completed draft by id rather than only the bot's own final state
// (D6), so it works on any draft: this mock, the real September one, or any of
// the committed fixtures.
//
// The section that earns its keep is "what each pick cost" -- for every pick,
// the players the board ranked ABOVE the one taken who were still on the table
// at that moment. That is the honest measure of whether the board was
// followed, and it is the one thing a Sleeper screenshot cannot show.

import { myDraftSlot, myRosterId, roundOf } from './snake'
import { nameOfPick, positionOfPick, rosterIdOfPick } from './state'
import {
  DraftConfig,
  DraftMessage,
  PlayerMap,
  Position,
  ResolvedBoard,
  SleeperPick,
} from './types'

const POSITION_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// How many passed-over names to print per pick before summarising the rest. A
// late pick can have a hundred board players still sitting there, and a list
// that long stops being readable and starts being noise.
const PASSED_OVER_SHOWN = 5

export interface PassedOver {
  name: string
  pos: Position
  boardRank: number
  tier: number
}

export interface ReportPick {
  pickNo: number
  round: number
  player_id: string
  name: string
  pos: Position
  boardRank: number | null
  tier: number | null
  passedOver: PassedOver[]
  passedOverTotal: number
}

export interface InstructionRow {
  pickNo: number
  instructed: { player_id: string; name: string; pos: Position }[]
  landed: { player_id: string; name: string; pos: Position }
  followed: boolean
}

export interface InstructionAudit {
  total: number
  followed: number
  overridden: number
  rows: InstructionRow[]
}

export interface TeamReport {
  draftId: string
  season: string
  teams: number
  rounds: number
  slot: number
  picks: ReportPick[]
  byPosition: { pos: Position; names: string[] }[]
  audit: InstructionAudit | null
}

// A logged message as JsonlNotifier writes it: the DraftMessage plus a ts.
export type LoggedMessage = DraftMessage & { ts?: string }

// Which draft a log belongs to, from its `loaded` banner.
//
// Returns null for a log written before `loaded` carried a draftId — those
// cannot be verified either way, which is a different thing from being wrong
// and the caller should say so differently.
export function draftIdOfLog(log: LoggedMessage[]): string | null {
  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    if (m.kind === 'loaded') {
      const id = (m as { draftId?: string }).draftId
      return typeof id === 'string' && id.length > 0 ? id : null
    }
  }
  return null
}

// Instructions are joined to picks by pick NUMBER, and pick numbers collide
// across drafts — every 12x14 draft has a pick 20. Reading a log against the
// wrong draft therefore produces a fully-formed audit that is entirely wrong,
// with nothing in the output to suggest it. With several mock ids in play and
// logs named by date, that is an easy mistake to make and an expensive one to
// believe.
export function assertLogMatchesDraft(log: LoggedMessage[], draftId: string): void {
  const logDraftId = draftIdOfLog(log)
  if (logDraftId !== null && logDraftId !== draftId) {
    throw new Error(
      `this log is from draft ${logDraftId}, not ${draftId}. Instructions are matched by pick ` +
        'number, which every draft reuses, so the audit would be confident and wrong. ' +
        'Pass the log written during THIS draft, or omit --log.'
    )
  }
}

export function parseLog(text: string): LoggedMessage[] {
  const out: LoggedMessage[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue
    try {
      out.push(JSON.parse(line) as LoggedMessage)
    } catch (e) {
      throw new Error(`log line ${i + 1} is not valid JSON: ${line.slice(0, 80)}`)
    }
  }
  return out
}

export function buildTeamReport(
  cfg: DraftConfig,
  picks: SleeperPick[],
  board: ResolvedBoard,
  players: PlayerMap,
  log?: LoggedMessage[]
): TeamReport {
  const draft = cfg.draft
  const myRoster = myRosterId(draft, cfg.myUserId)

  const sorted = picks.slice().sort((a, b) => a.pick_no - b.pick_no)

  // Board metadata by id, and the board's own order, so "ranked above" is the
  // board's judgement and not the market's. Sorted here rather than trusted to
  // arrive in order, because the early-exit below depends on it.
  const boardByAny: Record<string, { rank: number; tier: number; name: string; pos: Position }> = {}
  for (let i = 0; i < board.players.length; i++) {
    const bp = board.players[i]
    boardByAny[bp.player_id] = { rank: bp.rank, tier: bp.tier, name: bp.name, pos: bp.pos }
  }
  const byRank = board.players.slice().sort((a, b) => a.rank - b.rank)

  const mine: ReportPick[] = []
  const takenBefore: Record<string, boolean> = {}

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const isMine = rosterIdOfPick(p, draft) === myRoster
    if (isMine) {
      const meta = boardByAny[p.player_id]
      // Everything the board rated above this pick that nobody had taken yet.
      // When the pick is off-board there is no rank to compare against, so
      // every surviving board player counts as passed over -- which is the
      // honest reading of taking someone the board never listed.
      const ceiling = meta ? meta.rank : Infinity
      const passed: PassedOver[] = []
      for (let b = 0; b < byRank.length; b++) {
        const bp = byRank[b]
        if (bp.rank >= ceiling) break
        if (takenBefore[bp.player_id]) continue
        passed.push({ name: bp.name, pos: bp.pos, boardRank: bp.rank, tier: bp.tier })
      }
      mine.push({
        pickNo: p.pick_no,
        round: roundOf(draft, p.pick_no),
        player_id: p.player_id,
        name: nameOfPick(p, players),
        pos: positionOfPick(p, players),
        boardRank: meta ? meta.rank : null,
        tier: meta ? meta.tier : null,
        passedOver: passed.slice(0, PASSED_OVER_SHOWN),
        passedOverTotal: passed.length,
      })
    }
    takenBefore[p.player_id] = true
  }

  const byPosition: { pos: Position; names: string[] }[] = []
  for (let i = 0; i < POSITION_ORDER.length; i++) {
    const names: string[] = []
    for (let j = 0; j < mine.length; j++) {
      if (mine[j].pos === POSITION_ORDER[i]) names.push(mine[j].name)
    }
    if (names.length > 0) byPosition.push({ pos: POSITION_ORDER[i], names })
  }

  return {
    draftId: draft.draft_id,
    season: draft.season,
    teams: draft.settings.teams,
    rounds: draft.settings.rounds,
    slot: myDraftSlot(draft, cfg.myUserId),
    picks: mine,
    byPosition,
    audit: log ? buildAudit(mine, log) : null,
  }
}

// Join the instructions the bot issued against what actually landed. Without a
// log this section is omitted rather than guessed at: the picks feed alone
// cannot tell a considered override from a recommendation that never arrived.
export function buildAudit(mine: ReportPick[], log: LoggedMessage[]): InstructionAudit {
  // A pick can carry MORE THAN ONE on_clock message: when the named player is
  // taken while the pick is still open the bot issues a fresh single-name
  // instruction. Every player it named counts as instructed, because any of
  // them was a live instruction at some point in that pick.
  const instructedByPick: Record<number, { player_id: string; name: string; pos: Position }[]> = {}
  for (let i = 0; i < log.length; i++) {
    const m = log[i]
    if (m.kind !== 'on_clock') continue
    if (!instructedByPick[m.pickNo]) instructedByPick[m.pickNo] = []
    const list = instructedByPick[m.pickNo]
    let seen = false
    for (let j = 0; j < list.length; j++) {
      if (list[j].player_id === m.instruction.player_id) seen = true
    }
    if (!seen) {
      list.push({ player_id: m.instruction.player_id, name: m.instruction.name, pos: m.instruction.pos })
    }
  }

  const rows: InstructionRow[] = []
  let followed = 0
  const pickNos = Object.keys(instructedByPick)
    .map(Number)
    .sort((a, b) => a - b)
  for (let i = 0; i < pickNos.length; i++) {
    const n = pickNos[i]
    let landed: ReportPick | null = null
    for (let j = 0; j < mine.length; j++) {
      if (mine[j].pickNo === n) landed = mine[j]
    }
    // An instruction with no matching pick means the draft ended before that
    // pick landed. Reporting it as an override would be a lie, so skip it.
    if (!landed) continue
    const instructed = instructedByPick[n]
    let hit = false
    for (let j = 0; j < instructed.length; j++) {
      if (instructed[j].player_id === landed.player_id) hit = true
    }
    if (hit) followed++
    rows.push({
      pickNo: n,
      instructed,
      landed: { player_id: landed.player_id, name: landed.name, pos: landed.pos },
      followed: hit,
    })
  }

  return { total: rows.length, followed, overridden: rows.length - followed, rows }
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function boardCell(p: ReportPick): string {
  if (p.boardRank === null) return 'off-board'
  return `#${p.boardRank} (T${p.tier})`
}

export function renderTeamReport(r: TeamReport): string {
  const out: string[] = []
  out.push(`# Draft ${r.draftId} — ${r.season}, slot ${r.slot}`)
  out.push('')
  out.push(`${r.teams} teams, ${r.rounds} rounds, ${r.picks.length} picks made.`)
  out.push('')

  out.push('## The team, in pick order')
  out.push('')
  out.push('| Rd | Pick | Pos | Player | Board |')
  out.push('| --: | --: | :-- | :-- | :-- |')
  for (let i = 0; i < r.picks.length; i++) {
    const p = r.picks[i]
    out.push(`| ${p.round} | ${p.pickNo} | ${p.pos} | ${p.name} | ${boardCell(p)} |`)
  }
  out.push('')

  out.push('## By position')
  out.push('')
  if (r.byPosition.length === 0) {
    out.push('_No picks._')
  } else {
    for (let i = 0; i < r.byPosition.length; i++) {
      const row = r.byPosition[i]
      out.push(`- **${row.pos}** (${row.names.length}): ${row.names.join(', ')}`)
    }
  }
  out.push('')

  out.push('## What each pick cost')
  out.push('')
  out.push('Players your board ranked above the one taken, still available at that pick.')
  out.push('')
  for (let i = 0; i < r.picks.length; i++) {
    const p = r.picks[i]
    const head = `**Pick ${p.pickNo}** (R${p.round}) — ${p.pos} ${p.name} ${boardCell(p)}`
    if (p.passedOverTotal === 0) {
      // Nothing passed over means two different things, and calling them both
      // "the top of your board" would be false for the second: either this WAS
      // the best board player left, or the board had run out and the pick came
      // from ADP interpolation.
      out.push(
        p.boardRank === null
          ? `${head} — your board was exhausted; nothing left to pass over.`
          : `${head} — the top of your board. Nothing passed over.`
      )
    } else {
      const names = p.passedOver.map((q) => `#${q.boardRank} ${q.pos} ${q.name} (T${q.tier})`)
      const more = p.passedOverTotal - p.passedOver.length
      out.push(`${head} — passed over ${p.passedOverTotal}: ${names.join(', ')}${more > 0 ? `, +${more} more` : ''}`)
    }
  }
  out.push('')

  if (r.audit) {
    out.push('## Instructions vs. picks')
    out.push('')
    const a = r.audit
    const pct = a.total === 0 ? 0 : Math.round((a.followed / a.total) * 100)
    out.push(`${a.followed} of ${a.total} instructions taken (${pct}%); ${a.overridden} overridden.`)
    out.push('')
    if (a.rows.length > 0) {
      out.push('| Pick | Instructed | Landed | |')
      out.push('| --: | :-- | :-- | :-- |')
      for (let i = 0; i < a.rows.length; i++) {
        const row = a.rows[i]
        const instructed = row.instructed.map((q) => `${q.pos} ${q.name}`).join(' → ')
        out.push(`| ${row.pickNo} | ${instructed} | ${row.landed.pos} ${row.landed.name} | ${row.followed ? 'taken' : 'overridden'} |`)
      }
      out.push('')
    }
  }

  return out.join('\n')
}
