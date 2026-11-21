import { describe, expect, it } from 'vitest'
import { formConfig } from '../../config/form'
import { completedWeeks } from '../waivers/weeks'
import { playerGames } from './games'
import { game, makeInputs, meta, row } from './inputs.testutil'
import { ownerMap } from './owners'
import { buildPlayerForm, signalAvailable } from './playerForm'
import { buildPointsAllowed } from './pointsAllowed'
import { FormWindow, PlayerFormRow } from './types'
import { WaiverInputs } from '../waivers/types'

function formOf(inputs: WaiverInputs, window: FormWindow, mine?: string): Record<string, PlayerFormRow> {
  const games = playerGames(inputs)
  const weeks = completedWeeks(inputs.schedule, inputs.week)
  const allowed = buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, window)
  const rows = buildPlayerForm(inputs, games, window, allowed, ownerMap(inputs.rosters, inputs.users, mine), formConfig)
  return Object.fromEntries(rows.map((r) => [r.playerId, r]))
}

describe('ownerMap', () => {
  it('labels mine, other managers and orphans; reserve players are owned', () => {
    const owners = ownerMap(
      [
        { roster_id: 1, owner_id: 'me', players: ['a'], reserve: ['b'], taxi: null },
        { roster_id: 2, owner_id: 'u2', players: ['c'], reserve: null, taxi: null },
        { roster_id: 3, owner_id: null, players: ['x'], reserve: null, taxi: null },
      ],
      [
        { user_id: 'me', display_name: 'andrew', metadata: { team_name: 'Lads' } },
        { user_id: 'u2', display_name: 'dave' },
      ],
      'me'
    )
    expect(owners.a).toEqual({ kind: 'mine', label: 'Lads (andrew)' })
    expect(owners.b.kind).toBe('mine')
    expect(owners.c).toEqual({ kind: 'other', label: 'dave', ownerId: 'u2' })
    expect(owners.x).toEqual({ kind: 'other', label: 'Orphan', ownerId: null })
    expect(owners.zzz).toBeUndefined()
  })

  it('with no team picked, nothing is mine', () => {
    const owners = ownerMap(
      [{ roster_id: 1, owner_id: 'me', players: ['a'], reserve: null, taxi: null }],
      [{ user_id: 'me', display_name: 'andrew' }]
    )
    expect(owners.a.kind).toBe('other')
  })
})

describe('buildPlayerForm', () => {
  const twoGames = makeInputs({
    schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB'), game(3, 'NO', 'CAR')],
    statsByWeek: {
      1: { TEAM_NO: row('NO', { pass_att: 30 }), w1: row('NO', { off_snp: 50, tm_off_snp: 60, rec_yd: 30 }) },
      2: { TEAM_NO: row('NO', { pass_att: 30 }) },
      3: { TEAM_NO: row('NO', { pass_att: 30 }), w1: row('NO', { off_snp: 50, tm_off_snp: 60, rec_yd: 150 }) },
    },
    players: [meta('w1', 'WR', 'NO', { injury_status: 'Questionable' })],
    rosters: [{ roster_id: 2, owner_id: 'u2', players: ['w1'], reserve: null, taxi: null }],
    users: [{ user_id: 'u2', display_name: 'dave' }],
  })

  it('averages over games played, not the window size (GP 2 of 3)', () => {
    const w1 = formOf(twoGames, 3).w1
    expect(w1.gamesPlayed).toBe(2)
    expect(w1.windowSize).toBe(3)
    expect(w1.avg).toBeCloseTo(9, 5)
    expect(w1.games.map((g) => g.week)).toEqual([1, 3])
    expect(w1.owner).toEqual({ kind: 'other', label: 'dave', ownerId: 'u2' })
    expect(w1.injuryStatus).toBe('Questionable')
    expect(formOf(twoGames, 'season').w1.windowSize).toBeNull()
  })

  it('floor, hits and delta', () => {
    const w1 = formOf(twoGames, 1).w1
    expect(w1.avg).toBeCloseTo(15, 5)
    expect(w1.seasonAvg).toBeCloseTo(9, 5)
    expect(w1.delta).toBeCloseTo(6, 5)
    const all = formOf(twoGames, 3).w1
    expect(all.floor).toBeCloseTo(3, 5)
    expect(all.hits).toBe(1) // WR threshold 12: 15 counts, 3 does not
  })

  // Four NO running backs over two weeks. A: most used, fewest points.
  // C: least used of the pool, most points. D: a backup below 25% snaps.
  const backs = (() => {
    const week = {
      TEAM_NO: row('NO', { pass_att: 30, rush_att: 35, pass_air_yd: 100 }),
      a: row('NO', { off_snp: 50, tm_off_snp: 60, rush_att: 20, rec_tgt: 6, rush_rz_att: 4, rush_yd: 30 }),
      b: row('NO', { off_snp: 35, tm_off_snp: 60, rush_att: 10, rec_tgt: 3, rush_rz_att: 2, rush_yd: 60 }),
      c: row('NO', { off_snp: 20, tm_off_snp: 60, rush_att: 4, rec_tgt: 1, rush_yd: 120 }),
      d: row('NO', { off_snp: 5, tm_off_snp: 60, rush_att: 1, rush_yd: 200 }),
    }
    return makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB')],
      statsByWeek: { 1: week, 2: week },
      players: ['a', 'b', 'c', 'd'].map((id) => meta(id, 'RB', 'NO')),
    })
  })()

  it('flags buy low and sell high from the usage-points gap', () => {
    const f = formOf(backs, 3)
    expect(f.a.signal).toBe('buy')
    expect(f.a.usagePct).toBe(100)
    expect(f.a.pointsPct).toBe(0)
    expect(f.b.signal).toBeNull()
    expect(f.b.usagePct).toBe(50)
    expect(f.c.signal).toBe('sell')
    expect(f.a.usage!.snap).toBeCloseTo(50 / 60, 5)
    expect(f.a.usage!.carry).toBeCloseTo(20 / 35, 5)
    expect(f.a.usage!.rzOppsPerGame).toBe(4)
  })

  it('leaves backups below the snap cut-off out of the comparison', () => {
    const d = formOf(backs, 3).d
    expect(d.signal).toBeNull()
    expect(d.usagePct).toBeNull()
    expect(d.usage).not.toBeNull()
  })

  it('needs two games to join the comparison', () => {
    expect(formOf(backs, 1).a.signal).toBeNull()
  })

  it('K and DEF have no usage or signal', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB')],
      statsByWeek: {
        1: { k1: row('NO', { gp: 1, xpm: 3 }), NO: row('NO', { gp: 1, sack: 4 }) },
        2: { k1: row('NO', { gp: 1, fgm_30_39: 1 }), NO: row('NO', { gp: 1, sack: 1 }) },
      },
      players: [meta('k1', 'K', 'NO'), meta('NO', 'DEF', 'NO')],
    })
    const f = formOf(inputs, 3)
    expect(f.k1.usage).toBeNull()
    expect(f.k1.signal).toBeNull()
    expect(f.NO.name).toBe('NO DEF')
    expect(f.NO.avg).toBeCloseTo(2.5, 5)
  })

  it('records his last game and how many of his team games he has missed since', () => {
    // w1 played weeks 1 and 3; NO played 1, 2, 3. Nothing missed after week 3.
    expect(formOf(twoGames, 3).w1.lastWeek).toBe(3)
    expect(formOf(twoGames, 3).w1.missed).toBe(0)
    const sat = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'BYE1', 'BYE2'), game(3, 'NO', 'TB'), game(4, 'NO', 'CAR')],
      statsByWeek: {
        1: { w1: row('NO', { off_snp: 50, tm_off_snp: 60, rec_yd: 30 }) },
        2: {},
        3: {},
        4: {},
      },
      players: [meta('w1', 'WR', 'NO')],
    })
    // Week 2 is a bye for NO, so only weeks 3 and 4 are missed games.
    expect(formOf(sat, 3).w1.missed).toBe(2)
  })

  it('marks an idle player as returning when he is healthy and a starter on the depth chart', () => {
    const week = (backs as WaiverInputs).statsByWeek[1]
    const { a, b, ...rest } = week
    const idle = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB'), game(3, 'NO', 'CAR')],
      statsByWeek: { 1: week, 2: rest, 3: rest },
      players: [
        meta('a', 'RB', 'NO', { depth_chart_order: 1 }),
        meta('b', 'RB', 'NO', { depth_chart_order: 4 }),
        meta('c', 'RB', 'NO', { depth_chart_order: 1 }),
        meta('d', 'RB', 'NO'),
      ],
    })
    const f = formOf(idle, 3)
    expect(f.a.missed).toBe(2)
    expect(f.a.returning).toBe(true)
    expect(f.b.returning).toBe(false) // a backup who is not playing
    expect(f.c.returning).toBe(false) // never stopped playing
    const onIr = {
      ...idle,
      players: { ...idle.players, a: meta('a', 'RB', 'NO', { depth_chart_order: 1, injury_status: 'IR' }) },
    }
    expect(formOf(onIr, 3).a.returning).toBe(false) // still on IR
  })

  it('leaves injured players out of the signal and its percentiles', () => {
    const hurt = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB')],
      statsByWeek: (backs as WaiverInputs).statsByWeek,
      players: [
        meta('a', 'RB', 'NO', { injury_status: 'IR' }),
        meta('b', 'RB', 'NO'),
        meta('c', 'RB', 'NO'),
        meta('d', 'RB', 'NO'),
      ],
    })
    const f = formOf(hurt, 3)
    expect(f.a.signal).toBeNull()
    expect(f.a.usagePct).toBeNull()
    // Without a, b is now the most used of the pool: 100 usage, 0 points.
    expect(f.b.usagePct).toBe(100)
    expect(f.b.signal).toBe('buy')
  })

  it('leaves players who have stopped playing out of the signal', () => {
    const week = (backs as WaiverInputs).statsByWeek[1]
    const { a, ...others } = week
    const idle = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB'), game(3, 'NO', 'CAR'), game(4, 'NO', 'GB')],
      statsByWeek: { 1: week, 2: week, 3: others, 4: others },
      players: ['a', 'b', 'c', 'd'].map((id) => meta(id, 'RB', 'NO')),
    })
    const f = formOf(idle, 3)
    expect(f.a.missed).toBe(2)
    expect(f.a.signal).toBeNull()
    expect(f.a.usagePct).toBeNull()
  })

  it('sorts by window average, best first', () => {
    const rows = Object.values(formOf(backs, 3))
    expect(rows.map((r) => r.playerId)).toEqual(['d', 'c', 'b', 'a'])
  })
})

describe('signalAvailable', () => {
  it('is false when the window is shorter than the games the signal needs', () => {
    expect(signalAvailable(1, formConfig)).toBe(false)
    expect(signalAvailable(2, formConfig)).toBe(true)
    expect(signalAvailable('season', formConfig)).toBe(true)
  })
})
