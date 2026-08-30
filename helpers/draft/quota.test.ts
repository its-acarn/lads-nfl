// A positional quota with a deadline: "three running backs by the end of round
// six". Structurally the inverse of a round floor -- a floor is a prohibition
// that can always be satisfied by taking someone else, a quota is an
// obligation that eventually has to be paid.
//
// It binds JUST IN TIME. While enough picks remain in the window to settle the
// debt later, the engine follows the board exactly as it would without the
// rule; only when the running backs still owed equal the picks left inside the
// window does the candidate set narrow. On Andrew's board that is pick 44 at
// the earliest, and never at all if he takes a back early.

import { describe, expect, it } from 'vitest'
import { computeNeeds, isForcedMode, parseLineup } from './needs'
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

// Andrew's real picks from slot 5 of a 12x14 snake. Rounds one to six are
// 5, 20, 29, 44, 53, 68 -- six picks against a debt of three.
const MY_PICKS = [5, 20, 29, 44, 53, 68, 77, 92, 101, 116, 125, 140, 149, 164]

function draftFor(): SleeperDraft {
  const order: Record<string, number> = {}
  const slotToRoster: Record<string, number> = {}
  for (let s = 1; s <= TEAMS; s++) {
    order[`user${s}`] = s
    slotToRoster[String(s)] = s
  }
  return {
    draft_id: 'quota-test',
    league_id: 'quota-league',
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
  minCountByRound: { RB: { count: 3, byRound: 6 } },
  stashRound: 12,
  offBoardDiscount: 0.8,
  vonaFromRound: 9,
  useRosterNeed: false,
  useForcedStarters: true,
}

function poolPlayer(
  id: string,
  name: string,
  pos: Position,
  value: number,
  searchRank: number,
  team: string | null = null
): PoolPlayer {
  return {
    player_id: id,
    name,
    pos,
    team,
    value,
    offBoard: false,
    tier: 1,
    boardRank: searchRank,
    searchRank,
    injuryStatus: null,
    status: null,
  }
}

// The best player available is deliberately a receiver, so that below
// vonaFromRound -- where the engine follows board order outright and ignores
// position entirely -- the quota is the ONLY thing that could produce a back.
function defaultPool(): PoolPlayer[] {
  return [
    poolPlayer('wr1', 'Best Available', 'WR', 100, 1, 'CIN'),
    poolPlayer('wr2', 'Second Receiver', 'WR', 98, 2, 'DET'),
    poolPlayer('rb1', 'Best Back', 'RB', 90, 3, 'ATL'),
    poolPlayer('rb2', 'Second Back', 'RB', 88, 4, 'IND'),
    poolPlayer('rb3', 'Third Back', 'RB', 86, 5, 'TEN'),
    poolPlayer('te1', 'A Tight End', 'TE', 84, 6, 'LV'),
  ]
}

function stateAt(
  pickNo: number,
  rbsHeld: number,
  rules: BoardRules = RULES,
  pool: PoolPlayer[] = defaultPool()
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
    leagueId: 'quota-league',
    draftId: 'quota-test',
    myUserId: 'user5',
    players: [],
    doNotDraftIds: [],
    pins: [],
    rules,
  }
  const remaining = MY_PICKS.filter((n) => n >= pickNo)
  return {
    cfg,
    board,
    totalPicks: TEAMS * ROUNDS,
    picksByNo: {},
    currentPickNo: pickNo,
    currentRound: roundOf(draft, pickNo),
    myPickNos: MY_PICKS,
    myRemainingPickNos: remaining,
    myRosterIds: [],
    myPosCounts: { QB: 0, RB: rbsHeld, WR: 0, TE: 0, K: 0, DEF: 0 },
    myTeamCountsByPos: { QB: {}, RB: {}, WR: {}, TE: {}, K: {}, DEF: {} },
    posCountsByRoster: {},
    pool,
  }
}

describe('the quota binds only when it must', () => {
  it('the fixture really does put board order against the quota', () => {
    // Round 4 is below vonaFromRound, so the engine follows the board outright
    // and the best player available is a receiver...
    expect(roundOf(draftFor(), 44)).toBe(4)
    expect(RULES.vonaFromRound).toBeGreaterThan(4)
    expect(defaultPool()[0].pos).toBe('WR')
    // ...and forced mode is not what produces the back either.
    const st = stateAt(44, 0)
    const needs = computeNeeds(st.myPosCounts, parseLineup(st.cfg.rosterPositions), RULES)
    expect(isForcedMode(st.myRemainingPickNos.length, needs)).toBe(false)
  })

  it('recommends a running back at pick 44 when three are owed and three picks remain in the window', () => {
    const rec = recommend(stateAt(44, 0), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })

  // Without this the spec above could pass for the wrong reason.
  it('the SAME state without the rule takes the board leader instead', () => {
    const noQuota: BoardRules = { ...RULES, minCountByRound: undefined }
    const rec = recommend(stateAt(44, 0, noQuota), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })
})

describe('the window closes at the end of byRound', () => {
  it('does not bind at pick 77, which is round 7 and outside the window', () => {
    expect(roundOf(draftFor(), 77)).toBe(7)
    const rec = recommend(stateAt(77, 0), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })

  it('says nothing about a quota once the window has closed', () => {
    const rec = recommend(stateAt(77, 0), OPTS)
    expect(rec.rationale.join(' ')).not.toContain('quota')
  })
})

describe('a debt that can no longer be paid', () => {
  // A bot attached mid-draft, or a run of overrides: two picks left inside the
  // window and three backs still owed. Blocking the draft does not get the
  // missed picks back.
  it('stands down rather than forcing a back it can no longer pay for', () => {
    const rec = recommend(stateAt(53, 0), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })

  it('says so, so the miss is on the record', () => {
    const rec = recommend(stateAt(53, 0), OPTS)
    expect(rec.rationale.join(' ')).toContain('can no longer be met')
  })
})

describe('while the debt can still be settled later, the board decides', () => {
  it('does not bind at pick 29, where four picks remain against three owed', () => {
    expect(roundOf(draftFor(), 29)).toBe(3)
    const rec = recommend(stateAt(29, 0), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })

  it('does not bind at pick 5, the top of the draft', () => {
    const rec = recommend(stateAt(5, 0), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })

  it('does not bind once the count is already met, even inside the window', () => {
    const rec = recommend(stateAt(68, 3), OPTS)
    expect(rec.primary.pos).toBe('WR')
  })
})

describe('the debt counts down as backs are taken', () => {
  it('binds at pick 53 with one back held: two owed, two picks left', () => {
    const rec = recommend(stateAt(53, 1), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })

  // byRound is INCLUSIVE. Were it exclusive, round 6 would sit outside the
  // window, pick 68 would have nothing left to pay with, and the quota would
  // stand down here instead of binding.
  it('binds at pick 68 with two held, because round 6 is inside the window', () => {
    expect(roundOf(draftFor(), 68)).toBe(6)
    const rec = recommend(stateAt(68, 2), OPTS)
    expect(rec.primary.pos).toBe('RB')
  })
})

describe('the quota chooses a position, not a player', () => {
  it('still obeys one back per NFL backfield when picking which', () => {
    const rules: BoardRules = { ...RULES, maxPerNflTeamByPos: { RB: 1 } }
    // Pick 53 with one back held: two owed against two picks left, so the
    // quota binds -- and the best back available shares a backfield with the
    // one already on the roster.
    const st = stateAt(53, 1, rules)
    st.myTeamCountsByPos.RB = { ATL: 1 }
    const rec = recommend(st, OPTS)
    expect(rec.primary.pos).toBe('RB')
    expect(rec.primary.name).not.toBe('Best Back')
  })

  it('leaves the engine untouched when no quota is configured', () => {
    const noQuota: BoardRules = { ...RULES, minCountByRound: undefined }
    for (let i = 0; i < MY_PICKS.length; i++) {
      const rec = recommend(stateAt(MY_PICKS[i], 0, noQuota), OPTS)
      expect(rec.rationale.join(' '), `pick ${MY_PICKS[i]}`).not.toContain('quota')
    }
  })
})
