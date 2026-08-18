// One running back per NFL backfield.
//
// The 2026-08-17 mock came out holding Bucky Irving AND Kenny Gainwell (both
// TB), and Tony Pollard AND Tyjae Spears (both TEN). Two backs sharing a
// backfield split the touches that make either of them worth owning, and the
// injury that would open the job for one is the same injury that takes the
// other off the field -- so the pair is worth strictly less than its two ranks
// suggest, and the board has no way to say so. It ranks players, not rosters.
//
// Expressed as maxPerNflTeamByPos so it is a rule of Andrew's rather than a
// hardcoded opinion, and so it can say RB without saying WR: two receivers on
// one offence are not the same bet, and that mock's Godwin-alongside-Irving or
// Downs-alongside-Taylor drew no complaint.

import { describe, expect, it } from 'vitest'
import { recommend } from './recommend'
import { roundOf } from './snake'
import { DEFAULT_SIM_OPTS } from './survival'
import {
  BoardRules,
  BoardState,
  DraftConfig,
  PoolPlayer,
  Position,
  ResolvedBoard,
  SimOpts,
  SleeperDraft,
  SleeperTradedPick,
} from './types'

const OPTS: SimOpts = { ...DEFAULT_SIM_OPTS, sims: 200 }
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
    draft_id: 'stacks-test',
    league_id: 'stacks-league',
    type: 'snake',
    status: 'drafting',
    season: '2026',
    settings: { teams: TEAMS, rounds: ROUNDS },
    draft_order: order,
    slot_to_roster_id: slotToRoster,
    start_time: null,
  }
}

const BASE_RULES: BoardRules = {
  maxByPos: { QB: 1, RB: 8, WR: 8, TE: 1, K: 0, DEF: 0 },
  stashRound: 12,
  offBoardDiscount: 0.8,
  vonaFromRound: 9,
  useRosterNeed: false,
  useForcedStarters: false,
}

const ONE_RB_PER_TEAM: BoardRules = { ...BASE_RULES, maxPerNflTeamByPos: { RB: 1 } }

function poolPlayer(id: string, name: string, pos: Position, team: string | null, value: number): PoolPlayer {
  return {
    player_id: id,
    name,
    pos,
    team,
    value,
    offBoard: false,
    tier: 1,
    boardRank: Math.round(200 - value),
    searchRank: Math.round(200 - value),
    injuryStatus: null,
    status: null,
  }
}

// A roster already holding one Tampa Bay running back, and a pool whose single
// most valuable player is another one. Without the rule he is the pick by a
// clear margin, which is what makes the rule's effect unambiguous.
function stateWith(rules: BoardRules, pool: PoolPlayer[]): BoardState {
  const draft = draftFor()
  const cfg: DraftConfig = {
    draft,
    tradedPicks: [] as SleeperTradedPick[],
    myUserId: 'user5',
    rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN'],
  }
  const board: ResolvedBoard = {
    season: 2026,
    leagueId: 'stacks-league',
    draftId: 'stacks-test',
    myUserId: 'user5',
    players: [],
    doNotDraftIds: [],
    pins: [],
    rules,
  }
  return {
    cfg,
    board,
    totalPicks: TEAMS * ROUNDS,
    picksByNo: {},
    currentPickNo: 53,
    currentRound: roundOf(draft, 53),
    myPickNos: [53, 68],
    myRemainingPickNos: [53, 68],
    myRosterIds: ['tb-rb-held'],
    myPosCounts: { QB: 0, RB: 1, WR: 0, TE: 0, K: 0, DEF: 0 },
    // The held Tampa Bay back. This is the field the rule reads.
    myTeamCountsByPos: { QB: {}, RB: { TB: 1 }, WR: {}, TE: {}, K: {}, DEF: {} },
    posCountsByRoster: {},
    pool,
  }
}

const MIXED_POOL = (): PoolPlayer[] => [
  poolPlayer('tb-rb-2', 'Second Tampa Back', 'RB', 'TB', 100),
  poolPlayer('den-rb', 'A Denver Back', 'RB', 'DEN', 80),
  poolPlayer('tb-wr', 'A Tampa Receiver', 'WR', 'TB', 70),
]

describe('maxPerNflTeamByPos', () => {
  // Without this the next spec would pass for the wrong reason — some unrelated
  // preference for the Denver back rather than the rule under test.
  it('the Tampa back really is the pick when the rule is absent', () => {
    const rec = recommend(stateWith(BASE_RULES, MIXED_POOL()), OPTS)
    expect(rec.primary.name).toBe('Second Tampa Back')
  })

  it('refuses a second running back from a backfield already held', () => {
    const rec = recommend(stateWith(ONE_RB_PER_TEAM, MIXED_POOL()), OPTS)
    expect(rec.primary.name).not.toBe('Second Tampa Back')
    expect(rec.primary.name).toBe('A Denver Back')
  })

  it('does not offer him as a fallback either', () => {
    const rec = recommend(stateWith(ONE_RB_PER_TEAM, MIXED_POOL()), OPTS)
    for (let i = 0; i < rec.fallbacks.length; i++) {
      expect(rec.fallbacks[i].name).not.toBe('Second Tampa Back')
    }
  })

  // The rule is per position and says nothing about any other. A receiver from
  // that same offence is a different bet and stays available.
  it('leaves a receiver from the same NFL team alone', () => {
    const pool = [poolPlayer('tb-wr', 'A Tampa Receiver', 'WR', 'TB', 100)]
    const rec = recommend(stateWith(ONE_RB_PER_TEAM, pool), OPTS)
    expect(rec.primary.name).toBe('A Tampa Receiver')
  })

  it('says nothing about a position it does not name', () => {
    const rules: BoardRules = { ...BASE_RULES, maxPerNflTeamByPos: { TE: 1 } }
    const rec = recommend(stateWith(rules, MIXED_POOL()), OPTS)
    expect(rec.primary.name).toBe('Second Tampa Back')
  })

  // A free agent has no NFL team, and must not be treated as sharing one with
  // every other free agent.
  it('does not stack players who have no NFL team', () => {
    const pool = [
      poolPlayer('fa-1', 'First Free Agent', 'RB', null, 100),
      poolPlayer('fa-2', 'Second Free Agent', 'RB', null, 90),
    ]
    const st = stateWith(ONE_RB_PER_TEAM, pool)
    st.myTeamCountsByPos.RB = {}
    const rec = recommend(st, OPTS)
    expect(rec.primary.name).toBe('First Free Agent')
    expect(rec.fallbacks.map((f) => f.name)).toContain('Second Free Agent')
  })

  // The engine must always produce a pick. When the backfield rule is the only
  // thing standing between it and an empty candidate set it gives that up —
  // before position caps, which are the more considered constraint — and says
  // which rule it gave up rather than reaching silently.
  it('gives the rule up rather than have no pick at all, and announces it', () => {
    const pool = [poolPlayer('tb-rb-2', 'Second Tampa Back', 'RB', 'TB', 100)]
    const rec = recommend(stateWith(ONE_RB_PER_TEAM, pool), OPTS)
    expect(rec.primary.name).toBe('Second Tampa Back')
    expect(rec.rationale.join(' ')).toContain('one per NFL team')
  })

  it('gives it up BEFORE a position cap, being the cheaper rule to lose', () => {
    // Exactly two players left, each blocked by exactly one rule: the Tampa
    // back by the backfield rule, the Denver receiver by a WR cap of zero.
    // Whichever rule yields first decides who is recommended, so the pick
    // itself is the evidence of the ordering.
    const rules: BoardRules = {
      ...BASE_RULES,
      maxByPos: { QB: 1, RB: 8, WR: 0, TE: 0, K: 0, DEF: 0 },
      maxPerNflTeamByPos: { RB: 1 },
    }
    const pool = [
      poolPlayer('den-wr', 'A Denver Receiver', 'WR', 'DEN', 100),
      poolPlayer('tb-rb-2', 'Second Tampa Back', 'RB', 'TB', 95),
    ]
    const rec = recommend(stateWith(rules, pool), OPTS)
    expect(rec.primary.name).toBe('Second Tampa Back')
    expect(rec.rationale.join(' ')).toContain('one per NFL team')
    expect(rec.rationale.join(' ')).not.toContain('position caps')
  })
})
