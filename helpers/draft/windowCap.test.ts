// A positional ceiling with a deadline: "no more than three running backs
// through round six". The mirror image of the quota -- a prohibition, like a
// floor or a cap, so it can always be satisfied by taking somebody else and
// can never fight another rule over the same picks. Beside RB 3 by round 5 it
// yields exactly three backs in the first six rounds, and since nothing but
// RB/WR/TE is draftable that early, three receivers or tight ends too.

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

const OPTS: SimOpts = { ...DEFAULT_SIM_OPTS, sims: 400 }
const TEAMS = 12
const ROUNDS = 14
const MY_PICKS = [5, 20, 29, 44, 53, 68, 77, 92, 101, 116, 125, 140, 149, 164]

function draftFor(): SleeperDraft {
  const order: Record<string, number> = {}
  const slotToRoster: Record<string, number> = {}
  for (let s = 1; s <= TEAMS; s++) {
    order[`user${s}`] = s
    slotToRoster[String(s)] = s
  }
  return {
    draft_id: 'cap-test',
    league_id: 'cap-league',
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
  minRoundByPos: { QB: 12 },
  maxCountByRound: { RB: { count: 3, byRound: 6 } },
  stashRound: 12,
  offBoardDiscount: 0.8,
  vonaFromRound: 8,
  useRosterNeed: false,
  useForcedStarters: true,
}

function poolPlayer(id: string, name: string, pos: Position, value: number, searchRank: number, team: string): PoolPlayer {
  return { player_id: id, name, pos, team, value, offBoard: false, tier: 1, boardRank: searchRank, searchRank, injuryStatus: null, status: null }
}

// The board leader is deliberately a BACK, so that below vonaFromRound --
// where the engine follows the board outright -- the ceiling is the only
// thing that could keep it from taking him.
function pool(): PoolPlayer[] {
  return [
    // Search ranks sit past pick 164 so the supply horizon covers every one
    // of my picks: a tiny pool with ranks 1-4 reads as "everyone gone before
    // my next pick" and trips the schedule-forced collapse, which is not
    // what this spec is about.
    poolPlayer('rb1', 'Best Back', 'RB', 100, 190, 'ATL'),
    poolPlayer('rb2', 'Second Back', 'RB', 98, 191, 'IND'),
    poolPlayer('wr1', 'Best Receiver', 'WR', 90, 192, 'CIN'),
    poolPlayer('te1', 'A Tight End', 'TE', 84, 193, 'LV'),
    // Last on the board, so only a rule -- never board order -- takes him.
    poolPlayer('qb1', 'A Quarterback', 'QB', 60, 194, 'DET'),
  ]
}

function stateAt(
  pickNo: number,
  rbsHeld: number,
  rules: BoardRules = RULES,
  posCounts?: Partial<Record<Position, number>>
): BoardState {
  const draft = draftFor()
  const cfg: DraftConfig = {
    draft,
    tradedPicks: [] as SleeperTradedPick[],
    myUserId: 'user5',
    rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
  }
  const board: ResolvedBoard = {
    season: 2026,
    leagueId: 'cap-league',
    draftId: 'cap-test',
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
    currentPickNo: pickNo,
    currentRound: roundOf(draft, pickNo),
    myPickNos: MY_PICKS,
    myRemainingPickNos: MY_PICKS.filter((n) => n >= pickNo),
    myRosterIds: [],
    myPosCounts: { QB: 0, RB: rbsHeld, WR: 0, TE: 0, K: 0, DEF: 0, ...(posCounts || {}) },
    myTeamCountsByPos: { QB: {}, RB: {}, WR: {}, TE: {}, K: {}, DEF: {} },
    posCountsByRoster: {},
    pool: pool(),
  }
}

describe('a positional ceiling inside its window', () => {
  it('pick 68 is round 6, inside the window', () => {
    expect(roundOf(draftFor(), 68)).toBe(6)
    expect(roundOf(draftFor(), 77)).toBe(7)
  })

  it('refuses a fourth back at pick 68 even though a back leads the board', () => {
    const rec = recommend(stateAt(68, 3), OPTS)
    expect(rec.primary.pos).not.toBe('RB')
    expect(rec.primary.pos).toBe('WR')
    expect(rec.rationale.join(' ')).toMatch(/ceiling|at most 3 RB/i)
  })

  it('still allows a third back at pick 68 when only two are held', () => {
    const rec = recommend(stateAt(68, 2), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })

  it('the SAME state without the rule takes the board leader', () => {
    const noCap: BoardRules = { ...RULES, maxCountByRound: undefined }
    const rec = recommend(stateAt(68, 3, noCap), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })
})

describe('the ceiling lifts after byRound', () => {
  it('allows a fourth back at pick 77, round 7', () => {
    const rec = recommend(stateAt(77, 3), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })
})

describe('beside the RB quota', () => {
  // Three by round 5 (an obligation) and at most three through round 6 (a
  // prohibition) together pin the first six rounds at exactly three backs.
  const both: BoardRules = { ...RULES, minCountByRound: { RB: { count: 3, byRound: 5 } } }

  it('with three backs already held at pick 68, the pick is a receiver or tight end', () => {
    const rec = recommend(stateAt(68, 3, both), OPTS)
    expect(['WR', 'TE']).toContain(rec.primary.pos)
  })

  it('at pick 53 with two held, the quota forces the third back and the ceiling does not object', () => {
    const rec = recommend(stateAt(53, 2, both), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })
})

// "Definitely a quarterback in round 12": the floor (no QB before 12) and a
// quota (one QB by the end of 12) meet at exactly one pick. Every earlier
// pick is blocked by the floor; at the round-12 pick the debt equals the
// picks left in the window and the quota binds. No new machinery.
describe('a quarterback in round 12, by floor plus quota', () => {
  const rules: BoardRules = { ...RULES, minCountByRound: { QB: { count: 1, byRound: 12 } } }
  const lineupOtherwiseFull = { RB: 3, WR: 5, TE: 1 }

  it('pick 125 is round 11 and pick 140 is round 12', () => {
    expect(roundOf(draftFor(), 125)).toBe(11)
    expect(roundOf(draftFor(), 140)).toBe(12)
  })

  it('does not take a quarterback at pick 125 -- the floor still holds and the quota has two picks left', () => {
    const rec = recommend(stateAt(125, 3, rules, lineupOtherwiseFull), OPTS)
    expect(rec.primary.pos).not.toBe('QB')
  })

  it('takes the quarterback at pick 140 even though he is last on the board', () => {
    const rec = recommend(stateAt(140, 3, rules, lineupOtherwiseFull), OPTS)
    expect(rec.primary.pos).toBe('QB')
    expect(rec.rationale.join(' ')).toMatch(/quota: 1 more QB/)
  })

  it('the SAME state without the quota takes the board leader instead', () => {
    const rec = recommend(stateAt(140, 3, { ...RULES, minCountByRound: undefined }, lineupOtherwiseFull), OPTS)
    expect(rec.primary.pos).not.toBe('QB')
  })
})

// The full early-round shape: 3 RB by round 5, at most 3 RB through round 6,
// no TE before round 7. With only RB/WR/TE draftable that early, rounds 1-6
// are exactly three backs and three receivers.
describe('three backs and three receivers in six rounds', () => {
  const rules: BoardRules = {
    ...RULES,
    minRoundByPos: { QB: 12, TE: 7 },
    minCountByRound: { RB: { count: 3, byRound: 5 }, TE: { count: 1, byRound: 10 } },
  }

  it('pick 68 with three backs held is a receiver: not a fourth back, not a tight end', () => {
    const rec = recommend(stateAt(68, 3, rules, { WR: 2 }), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })

  it('pick 77, round 7, may finally be the tight end', () => {
    // Backs and receivers are capped out here so the tight end is the only
    // legal candidate: the point is that the floor has lifted. The same
    // state one round earlier is blocked by it.
    const rec = recommend(stateAt(77, 8, rules, { WR: 8 }), OPTS)
    expect(rec.primary.pos).toBe('TE')
    const earlier = recommend(stateAt(68, 8, rules, { WR: 8 }), OPTS)
    expect(earlier.primary.pos).not.toBe('TE')
  })
})
