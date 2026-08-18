import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { userForSlot } from './marketBoard'
import { roundOf } from './snake'
import { rosterIdOfPick } from './state'
import { myRosterId } from './snake'
import {
  assertLogMatchesDraft,
  buildAudit,
  buildTeamReport,
  draftIdOfLog,
  LoggedMessage,
  parseLog,
  renderTeamReport,
} from './teamReport'
import { DraftConfig, Position, ResolvedBoard, Scored } from './types'

const fx = loadFixture('lads', '2025')
const players = loadTrimmedPlayers()

function resolvedBoard(): ResolvedBoard {
  const file = path.join(__dirname, '..', '..', 'config', 'board.resolved.json')
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ResolvedBoard
}

function cfgForSlot(slot: number): DraftConfig {
  return {
    draft: fx.draft,
    tradedPicks: fx.tradedPicks,
    myUserId: userForSlot(fx.draft, slot),
    rosterPositions: fx.league.roster_positions,
  }
}

// A board built from the fixture's own picks, so "ranked above" has something
// real to say about a 2025 draft. The committed config/board.resolved.json is
// a 2026 ten-player placeholder and would report almost everything off-board.
function boardFromFixture(depth: number): ResolvedBoard {
  const sorted = fx.picks.slice().sort((a, b) => a.pick_no - b.pick_no).slice(0, depth)
  return {
    season: 2025,
    leagueId: fx.league.league_id,
    draftId: fx.draft.draft_id,
    myUserId: cfgForSlot(2).myUserId,
    players: sorted.map((p, i) => ({
      name: (players[p.player_id] && players[p.player_id].full_name) || p.player_id,
      pos: (players[p.player_id] ? players[p.player_id].position : 'RB') as Position,
      tier: Math.floor(i / 12) + 1,
      rank: i + 1,
      player_id: p.player_id,
    })),
    doNotDraftIds: [],
    pins: [],
    rules: {
      maxByPos: { QB: 3, RB: 8, WR: 8, TE: 3, K: 1, DEF: 1 },
      stashRound: 12,
      offBoardDiscount: 0.8,
    },
  }
}

describe('buildTeamReport over the committed lads/2025 draft', () => {
  const cfg = cfgForSlot(2)
  const board = boardFromFixture(120)
  const report = buildTeamReport(cfg, fx.picks, board, players)

  it('reports fourteen players with no duplicates', () => {
    expect(report.picks.length).toBe(fx.draft.settings.rounds)
    const ids: Record<string, boolean> = {}
    for (let i = 0; i < report.picks.length; i++) {
      expect(ids[report.picks[i].player_id], report.picks[i].name).toBeUndefined()
      ids[report.picks[i].player_id] = true
    }
  })

  it('every pick belongs to my roster and to nobody else', () => {
    const mine = myRosterId(fx.draft, cfg.myUserId)
    for (let i = 0; i < report.picks.length; i++) {
      const pick = fx.picks.filter((p) => p.pick_no === report.picks[i].pickNo)[0]
      expect(rosterIdOfPick(pick, fx.draft)).toBe(mine)
    }
  })

  it("every pick's round agrees with the snake maths", () => {
    for (let i = 0; i < report.picks.length; i++) {
      expect(report.picks[i].round).toBe(roundOf(fx.draft, report.picks[i].pickNo))
    }
    // And they are in ascending pick order.
    for (let i = 1; i < report.picks.length; i++) {
      expect(report.picks[i].pickNo).toBeGreaterThan(report.picks[i - 1].pickNo)
    }
  })

  // The honest measure of whether the board was followed -- and the one thing
  // a Sleeper screenshot cannot show. It is only honest if the list contains
  // nobody who was already gone.
  it('the passed-over list holds only players genuinely undrafted at that pick', () => {
    for (let i = 0; i < report.picks.length; i++) {
      const p = report.picks[i]
      const takenBefore: Record<string, boolean> = {}
      for (let j = 0; j < fx.picks.length; j++) {
        if (fx.picks[j].pick_no < p.pickNo) takenBefore[fx.picks[j].player_id] = true
      }
      for (let k = 0; k < p.passedOver.length; k++) {
        const hit = board.players.filter((b) => b.name === p.passedOver[k].name)[0]
        expect(takenBefore[hit.player_id], `${p.passedOver[k].name} at pick ${p.pickNo}`).toBeUndefined()
      }
    }
  })

  it('the passed-over list holds only players the board ranked above the pick', () => {
    for (let i = 0; i < report.picks.length; i++) {
      const p = report.picks[i]
      if (p.boardRank === null) continue
      for (let k = 0; k < p.passedOver.length; k++) {
        expect(p.passedOver[k].boardRank).toBeLessThan(p.boardRank)
      }
    }
  })

  it('groups the roster by position, covering every pick exactly once', () => {
    let total = 0
    for (let i = 0; i < report.byPosition.length; i++) total += report.byPosition[i].names.length
    expect(total).toBe(report.picks.length)
  })

  it('omits the instruction section when no log is given', () => {
    expect(report.audit).toBe(null)
    expect(renderTeamReport(report)).not.toContain('Instructions vs. picks')
  })

  it('renders Markdown carrying every player, with a round and a tier where the board knows them', () => {
    const md = renderTeamReport(report)
    expect(md).toContain('## The team, in pick order')
    expect(md).toContain('## By position')
    expect(md).toContain('## What each pick cost')
    for (let i = 0; i < report.picks.length; i++) {
      expect(md).toContain(report.picks[i].name)
    }
    const onBoard = report.picks.filter((p) => p.boardRank !== null)
    expect(onBoard.length).toBeGreaterThan(0)
    expect(md).toContain(`#${onBoard[0].boardRank} (T${onBoard[0].tier})`)
  })

  it('works on any slot, not just Andrew\'s', () => {
    for (let slot = 1; slot <= fx.draft.settings.teams; slot++) {
      const r = buildTeamReport(cfgForSlot(slot), fx.picks, board, players)
      expect(r.picks.length, `slot ${slot}`).toBe(fx.draft.settings.rounds)
      expect(r.slot).toBe(slot)
    }
  })

  it('reports an off-board pick as off-board rather than inventing a rank', () => {
    const shallow = buildTeamReport(cfg, fx.picks, boardFromFixture(24), players)
    const off = shallow.picks.filter((p) => p.boardRank === null)
    expect(off.length).toBeGreaterThan(0)
    expect(renderTeamReport(shallow)).toContain('off-board')
  })

  // "Nothing passed over" means two different things and only one of them is
  // "you took the best player on your board".
  it('distinguishes an exhausted board from taking the top of it', () => {
    const md = renderTeamReport(buildTeamReport(cfg, fx.picks, boardFromFixture(24), players))
    expect(md).toContain('the top of your board')
    expect(md).toContain('your board was exhausted')
    // The false reading must not appear against an off-board pick.
    const lines = md.split('\n').filter((l) => l.indexOf('off-board — the top of your board') !== -1)
    expect(lines).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('the instruction audit', () => {
  const scored = (id: string, name: string, pos: Position): Scored => ({
    player_id: id,
    name,
    pos,
    team: null,
    value: 0,
    offBoard: false,
    score: 0,
    survivalToNextPct: null,
    rationale: [],
  })

  const cfg = cfgForSlot(2)
  const board = boardFromFixture(120)
  const base = buildTeamReport(cfg, fx.picks, board, players)

  // A synthetic log: instruct exactly what landed on the first half of the
  // picks and something else on the rest.
  function syntheticLog(): LoggedMessage[] {
    const out: LoggedMessage[] = []
    for (let i = 0; i < base.picks.length; i++) {
      const p = base.picks[i]
      const followed = i < Math.floor(base.picks.length / 2)
      out.push({
        kind: 'on_clock',
        pickNo: p.pickNo,
        instruction: followed ? scored(p.player_id, p.name, p.pos) : scored('nobody', 'Someone Else', 'RB'),
        fallbacks: [],
      })
    }
    return out
  }

  it('follow and override counts sum to the number of on_clock messages', () => {
    const log = syntheticLog()
    const audit = buildAudit(base.picks, log)
    expect(audit.total).toBe(log.length)
    expect(audit.followed + audit.overridden).toBe(audit.total)
    expect(audit.followed).toBe(Math.floor(base.picks.length / 2))
  })

  // M7 lets a pick carry more than one instruction: when the named player is
  // taken while the pick is still open, the bot names someone else. Any player
  // it named was a live instruction, so any of them landing counts as taken.
  it('counts a pick once even when it was re-instructed, and honours either name', () => {
    const p = base.picks[0]
    const audit = buildAudit(base.picks, [
      { kind: 'on_clock', pickNo: p.pickNo, instruction: scored('sniped', 'Got Sniped', 'WR'), fallbacks: [] },
      { kind: 'on_clock', pickNo: p.pickNo, instruction: scored(p.player_id, p.name, p.pos), fallbacks: [] },
    ])
    expect(audit.total).toBe(1)
    expect(audit.followed).toBe(1)
    expect(audit.rows[0].instructed.length).toBe(2)
  })

  it('ignores an instruction for a pick that never landed', () => {
    const audit = buildAudit(base.picks, [
      { kind: 'on_clock', pickNo: 9999, instruction: scored('x', 'Never Landed', 'RB'), fallbacks: [] },
    ])
    expect(audit.total).toBe(0)
  })

  it('ignores every message kind that is not an instruction', () => {
    const p = base.picks[0]
    const audit = buildAudit(base.picks, [
      { kind: 'loaded', draftId: fx.draft.draft_id, slot: 2, pickNos: [p.pickNo], rounds: 14, teams: 12 },
      { kind: 'draft_paused' },
      { kind: 'draft_resumed' },
      { kind: 'on_clock', pickNo: p.pickNo, instruction: scored(p.player_id, p.name, p.pos), fallbacks: [] },
      { kind: 'draft_complete', rosterSummary: '' },
    ])
    expect(audit.total).toBe(1)
    expect(audit.followed).toBe(1)
  })

  it('renders the audit section with the taken/overridden verdict per pick', () => {
    const md = renderTeamReport(buildTeamReport(cfg, fx.picks, board, players, syntheticLog()))
    expect(md).toContain('## Instructions vs. picks')
    expect(md).toContain('taken')
    expect(md).toContain('overridden')
  })
})

// Instructions are joined by pick NUMBER, and every 12x14 draft has a pick 20.
// Reading a log against the wrong draft therefore yields a fully-formed audit
// that is entirely wrong, with nothing in the output to suggest it.
describe('a log must belong to the draft it is read against', () => {
  const loaded = (draftId: string): LoggedMessage => ({
    kind: 'loaded',
    draftId,
    slot: 5,
    pickNos: [5, 20],
    rounds: 14,
    teams: 12,
  })

  it('reads the draft id out of the loaded banner', () => {
    expect(draftIdOfLog([loaded('abc123')])).toBe('abc123')
  })

  it('refuses a log from a different draft, naming both ids', () => {
    expect(() => assertLogMatchesDraft([loaded('draft-B')], 'draft-A')).toThrow(/from draft draft-B, not draft-A/)
  })

  it('accepts a log from the same draft', () => {
    expect(() => assertLogMatchesDraft([loaded('draft-A')], 'draft-A')).not.toThrow()
  })

  // "Cannot verify" is a different thing from "verified wrong", and the two
  // deserve different handling: a log written before draft-id stamping is
  // reported as unverifiable rather than rejected, so logs already on disk stay
  // usable.
  it('reports an unstamped log as unverifiable rather than rejecting it', () => {
    const legacy = [{ kind: 'loaded', slot: 5, pickNos: [5], rounds: 14, teams: 12 } as unknown as LoggedMessage]
    expect(draftIdOfLog(legacy)).toBe(null)
    expect(() => assertLogMatchesDraft(legacy, 'draft-A')).not.toThrow()
  })

  it('treats a log with no loaded banner at all as unverifiable', () => {
    expect(draftIdOfLog([{ kind: 'draft_complete', rosterSummary: '' }])).toBe(null)
  })
})

describe('parseLog', () => {
  it('reads a JSONL log written by JsonlNotifier, ignoring blank lines', () => {
    const text =
      '{"ts":"2026-08-16T11:47:24.000Z","kind":"loaded","slot":5,"pickNos":[5],"rounds":14,"teams":12}\n' +
      '\n' +
      '{"ts":"2026-08-16T11:48:00.000Z","kind":"draft_complete","rosterSummary":"RB: X"}\n'
    const rows = parseLog(text)
    expect(rows.length).toBe(2)
    expect(rows[0].kind).toBe('loaded')
    expect(rows[1].kind).toBe('draft_complete')
  })

  it('says which line is bad rather than failing opaquely', () => {
    expect(() => parseLog('{"kind":"loaded"}\nnot json at all\n')).toThrow(/line 2/)
  })
})

// The committed resolved board is a placeholder, but the report must not
// crash on it -- it is what `npm run team` reads by default.
describe('against the committed config/board.resolved.json', () => {
  it('renders without throwing', () => {
    const md = renderTeamReport(buildTeamReport(cfgForSlot(2), fx.picks, resolvedBoard(), players))
    expect(md).toContain('## The team, in pick order')
  })
})
