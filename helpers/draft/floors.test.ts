// Round floors are absolute. No code path may breach one.
//
// Three paths used to be able to. The scarcity override waived a floor when a
// mandatory position ran thin; forced mode sat in an `else if` on the floor
// test, so an active collapse skipped the check entirely; and the relaxation
// ladder gave floors up first of all. Andrew streams quarterbacks, and
// `minRoundByPos.QB: 11` encodes that strategy rather than patching around an
// untiered column (D7, D8) -- so an override does not rescue him from a bad
// outcome, it imposes a strategy he rejected.

import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { loadTrimmedPlayers } from './fixtures.testutil'
import { computeNeeds, isForcedMode, parseLineup } from './needs'
import { recommend } from './recommend'
import { roundOf } from './snake'
import { buildState } from './state'
import { DEFAULT_SIM_OPTS, survival } from './survival'
import {
  BoardRules,
  BoardState,
  DraftConfig,
  PlayerMap,
  PoolPlayer,
  Position,
  ResolvedBoard,
  SimOpts,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
} from './types'

const OPTS: SimOpts = { ...DEFAULT_SIM_OPTS, sims: 400 }

// ---------------------------------------------------------------------------
// A state in which every removed breach path would have fired at once.
// ---------------------------------------------------------------------------

const TEAMS = 12
const ROUNDS = 14

function draftFor(): SleeperDraft {
  const order: Record<string, number> = {}
  const slotToRoster: Record<string, number> = {}
  for (let s = 1; s <= TEAMS; s++) {
    order[`user${s}`] = s
    slotToRoster[String(s)] = s
  }
  return {
    draft_id: 'floors-test',
    league_id: 'floors-league',
    type: 'snake',
    status: 'drafting',
    season: '2026',
    settings: { teams: TEAMS, rounds: ROUNDS },
    draft_order: order,
    slot_to_roster_id: slotToRoster,
    start_time: null,
  }
}

const RULES: BoardRules = {
  maxByPos: { QB: 1, RB: 8, WR: 8, TE: 1, K: 0, DEF: 0 },
  minRoundByPos: { QB: 11 },
  stashRound: 12,
  offBoardDiscount: 0.8,
  vonaFromRound: 9,
  useRosterNeed: false,
  useForcedStarters: true,
}

function poolPlayer(id: string, name: string, pos: Position, value: number, searchRank: number): PoolPlayer {
  return {
    player_id: id,
    name,
    pos,
    team: null,
    value,
    offBoard: false,
    tier: 1,
    boardRank: searchRank,
    searchRank,
    injuryStatus: null,
    status: null,
  }
}

// The plan's adversarial case, built directly so nothing about it is
// accidental: an unfilled mandatory QB slot, only three quarterbacks left in
// the whole pool, every one of them the most valuable player available (so the
// simulator predicts them extinct), forced mode active, and a round well below
// the floor.
function extremeState(rules: BoardRules, remainingPicks: number[]): BoardState {
  const draft = draftFor()
  const cfg: DraftConfig = {
    draft,
    tradedPicks: [] as SleeperTradedPick[],
    myUserId: 'user5',
    // One dedicated QB slot, so the slot is mandatory and unfilled.
    rosterPositions: ['QB', 'RB', 'WR', 'BN'],
  }
  const board: ResolvedBoard = {
    season: 2026,
    leagueId: 'floors-league',
    draftId: 'floors-test',
    myUserId: 'user5',
    players: [],
    doNotDraftIds: [],
    pins: [],
    rules,
  }
  const pool: PoolPlayer[] = [
    poolPlayer('qb1', 'Elite Passer', 'QB', 100, 1),
    poolPlayer('qb2', 'Second Passer', 'QB', 98, 2),
    poolPlayer('qb3', 'Third Passer', 'QB', 96, 3),
    poolPlayer('rb1', 'A Running Back', 'RB', 40, 40),
    poolPlayer('wr1', 'A Receiver', 'WR', 38, 41),
  ]
  return {
    cfg,
    board,
    totalPicks: TEAMS * ROUNDS,
    picksByNo: {},
    currentPickNo: remainingPicks[0],
    currentRound: roundOf(draft, remainingPicks[0]),
    myPickNos: remainingPicks,
    myRemainingPickNos: remainingPicks,
    myRosterIds: [],
    myPosCounts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 },
    posCountsByRoster: {},
    pool,
  }
}

describe('the adversarial case: every breach path armed at once', () => {
  // Pick 101 is round 9 of a 12x14 snake -- exactly where the rehearsal's
  // override fired, and two rounds below the QB floor of 11.
  const REMAINING = [101, 116]

  it('the state really does arm every path (otherwise the spec proves nothing)', () => {
    const st = extremeState(RULES, REMAINING)
    const shape = parseLineup(st.cfg.rosterPositions)
    const needs = computeNeeds(st.myPosCounts, shape, RULES)

    // ...an unfilled mandatory QB slot...
    expect(needs.unfilledMandatory.QB).toBeGreaterThan(0)
    // ...forced mode active (1 pick per unfilled starter is the trigger)...
    expect(isForcedMode(REMAINING.length, needs)).toBe(true)
    // ...fewer than five quarterbacks left...
    expect(st.pool.filter((p) => p.pos === 'QB').length).toBeLessThanOrEqual(5)
    // ...all predicted gone before my next pick...
    const report = survival(st, OPTS)
    expect(report.expectedBestValueByPos.QB).toBeLessThan(1e-9)
    // ...and the round is below the floor.
    expect(roundOf(st.cfg.draft, REMAINING[0])).toBeLessThan(RULES.minRoundByPos!.QB!)
  })

  it('does not recommend a quarterback', () => {
    const rec = recommend(extremeState(RULES, REMAINING), OPTS)
    expect(rec.primary.pos).not.toBe('QB')
    for (let i = 0; i < rec.fallbacks.length; i++) {
      expect(rec.fallbacks[i].pos).not.toBe('QB')
    }
  })

  it('never announces a waived floor, because there is no longer a way to waive one', () => {
    const rec = recommend(extremeState(RULES, REMAINING), OPTS)
    expect(rec.rationale.join(' ')).not.toContain('scarcity override')
    expect(rec.rationale.join(' ')).not.toContain('round floor')
  })

  // Without this the first spec would pass for the wrong reason -- an
  // unrelated preference for the running back rather than the floor.
  it('the SAME state with the floor removed does recommend one', () => {
    const noFloor: BoardRules = { ...RULES, minRoundByPos: {} }
    const rec = recommend(extremeState(noFloor, REMAINING), OPTS)
    expect(rec.primary.pos).toBe('QB')
  })

  it('at or above the floor a quarterback is available again', () => {
    // Pick 125 is round 11 -- the floor itself.
    const rec = recommend(extremeState(RULES, [125, 140]), OPTS)
    expect(roundOf(draftFor(), 125)).toBe(11)
    expect(rec.primary.pos).toBe('QB')
  })

  // Giving up the caps is the last resort and still must not reach past a
  // floor. With every non-QB capped out there is genuinely nothing legal left.
  it('fails loudly rather than quietly breaching when a floor leaves nothing', () => {
    const capped: BoardRules = { ...RULES, maxByPos: { QB: 1, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 } }
    const st = extremeState(capped, REMAINING)
    // Caps relax last, so RB/WR come back before a floor ever would; drop them
    // from the pool entirely to leave only floored quarterbacks.
    st.pool = st.pool.filter((p) => p.pos === 'QB')
    expect(() => recommend(st, OPTS)).toThrow(/round floor/)
    expect(() => recommend(st, OPTS)).toThrow(/QB \(floor round 11\)/)
  })
})

// ---------------------------------------------------------------------------
// The rehearsal itself, replayed offline.
// ---------------------------------------------------------------------------

const REHEARSAL_DIR = path.join(__dirname, '..', '..', 'fixtures', 'rehearsal2026')

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(REHEARSAL_DIR, file), 'utf8')) as T
}

function liveBoard(): ResolvedBoard {
  const file = path.join(__dirname, '..', '..', 'config', 'board.resolved.json')
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ResolvedBoard
}

describe('mock 1394452945935794176 replayed at all fourteen of Andrew\'s picks', () => {
  const draft = readJson<SleeperDraft>('draft.json')
  const picks = readJson<SleeperPick[]>('picks.json').sort((a, b) => a.pick_no - b.pick_no)
  const tradedPicks = readJson<SleeperTradedPick[]>('traded_picks.json')
  const league = readJson<SleeperLeague>('league.json')
  const players: PlayerMap = loadTrimmedPlayers()
  const board = liveBoard()

  const cfg: DraftConfig = {
    draft,
    tradedPicks,
    myUserId: board.myUserId,
    rosterPositions: league.roster_positions,
  }

  it('is the draft the plan describes: 168 picks, slot 5, every roster_id null', () => {
    expect(picks.length).toBe(168)
    expect(draft.draft_order![board.myUserId]).toBe(5)
    expect(picks.every((p) => p.roster_id === null)).toBe(true)
    expect(draft.settings.pick_timer).toBe(120)
  })

  it('never breaches a round floor at any of my picks', () => {
    const floors = board.rules.minRoundByPos || {}
    const myPicks = [5, 20, 29, 44, 53, 68, 77, 92, 101, 116, 125, 140, 149, 164]
    let checked = 0
    for (let i = 0; i < myPicks.length; i++) {
      const n = myPicks[i]
      const state = buildState(cfg, picks.filter((p) => p.pick_no < n), board, players)
      const rec = recommend(state, OPTS)
      const round = roundOf(draft, n)
      const all = [rec.primary].concat(rec.fallbacks)
      for (let j = 0; j < all.length; j++) {
        const floor = (floors as Record<string, number>)[all[j].pos]
        if (floor !== undefined) {
          expect(round, `pick ${n} recommended ${all[j].pos} ${all[j].name}`).toBeGreaterThanOrEqual(floor)
        }
      }
      checked++
    }
    expect(checked).toBe(14)
  })

  // The rehearsal's override fired first at pick 101 with an edge of +5.6, and
  // repeated at 116, 125, 140 and 149. 101, 116 and 125 are rounds 9-11, all
  // below the QB floor — raised from 11 to 12 by Andrew on 2026-08-31, which
  // put pick 125 below it too.
  it('offers no quarterback at picks 101, 116 or 125, where the override used to fire', () => {
    const qbFloor = (board.rules.minRoundByPos || {}).QB
    expect(qbFloor).toBe(12)
    const belowFloor = [101, 116, 125]
    for (let i = 0; i < belowFloor.length; i++) {
      const n = belowFloor[i]
      expect(roundOf(draft, n)).toBeLessThan(qbFloor!)
      const state = buildState(cfg, picks.filter((p) => p.pick_no < n), board, players)
      const rec = recommend(state, OPTS)
      const all = [rec.primary].concat(rec.fallbacks)
      for (let j = 0; j < all.length; j++) {
        expect(all[j].pos, `pick ${n}`).not.toBe('QB')
      }
    }
  })
})
