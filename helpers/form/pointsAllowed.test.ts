import { describe, expect, it } from 'vitest'
import { formConfig } from '../../config/form'
import { loadWaiverFixture } from '../waivers/fixtures.testutil'
import { completedWeeks } from '../waivers/weeks'
import { playerGames } from './games'
import { game, makeInputs, meta, row } from './inputs.testutil'
import { buildPointsAllowed, matchupTier, upcomingGames } from './pointsAllowed'
import { FORM_POSITIONS, PointsAllowedRow } from './types'

// MIA plays weeks 1 and 3 (bye in 2); BUF plays all three.
const inputs = makeInputs({
  schedule: [game(1, 'MIA', 'BUF'), game(2, 'BUF', 'NYJ'), game(3, 'MIA', 'NE'), game(3, 'BUF', 'KC')],
  statsByWeek: {
    1: {
      TEAM_MIA: row('MIA', {}),
      TEAM_BUF: row('BUF', {}),
      r1: row('BUF', { off_snp: 40, rush_yd: 100 }),
      r2: row('BUF', { off_snp: 20, rush_yd: 60 }),
      w1: row('MIA', { off_snp: 50, rec_yd: 80 }),
    },
    2: { TEAM_BUF: row('BUF', {}), TEAM_NYJ: row('NYJ', {}), r1: row('BUF', { off_snp: 40, rush_yd: 30 }) },
    3: {
      TEAM_MIA: row('MIA', {}),
      TEAM_NE: row('NE', {}),
      TEAM_BUF: row('BUF', {}),
      TEAM_KC: row('KC', {}),
      r3: row('NE', { off_snp: 40, rush_yd: 40 }),
    },
  },
  players: [meta('r1', 'RB', 'BUF'), meta('r2', 'RB', 'BUF'), meta('w1', 'WR', 'MIA'), meta('r3', 'RB', 'NE')],
})
const weeks = completedWeeks(inputs.schedule, inputs.week)
const games = playerGames(inputs)
const byTeam = (rows: PointsAllowedRow[]) => Object.fromEntries(rows.map((r) => [r.team, r]))

describe('buildPointsAllowed', () => {
  it('sums points against the opponent by position', () => {
    const mia = byTeam(buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, 1)).MIA
    // window 1 = MIA's last game (week 3): r3 ran for 40 yards
    expect(mia.perGame.RB).toBeCloseTo(4, 5)
    const season = byTeam(buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, 'season')).MIA
    expect(season.perGame.RB).toBeCloseTo((10 + 6 + 4) / 2, 5)
  })

  it("averages over the team's games, skipping its bye", () => {
    const rows = byTeam(buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, 3))
    expect(rows.MIA.games).toBe(2)
    expect(rows.BUF.games).toBe(3)
    expect(rows.BUF.perGame.WR).toBeCloseTo(8 / 3, 5)
  })

  it('ranks 1 = most allowed, as a permutation of 1..n', () => {
    const rows = buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, 'season')
    const r = byTeam(rows)
    expect(r.MIA.rank.RB).toBe(1)
    FORM_POSITIONS.forEach((p) => {
      expect(rows.map((x) => x.rank[p]).sort((a, b) => a - b)).toEqual(rows.map((_, i) => i + 1))
    })
  })

  it('covers all 32 teams on the fixture', () => {
    const lads = loadWaiverFixture('lads')
    const rows = buildPointsAllowed(playerGames(lads), lads.players, lads.statsByWeek, completedWeeks(lads.schedule, lads.week), 'season')
    expect(rows.length).toBe(32)
    rows.forEach((r) => expect(r.perGame.QB).toBeGreaterThan(5))
  })
})

describe('upcomingGames', () => {
  const allowed = buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, 'season')

  it('shows BYE for a week without a game', () => {
    const up = upcomingGames(inputs.schedule, 'MIA', 1, allowed, 'RB', formConfig)
    expect(up.map((g) => g.week)).toEqual([1, 2, 3])
    expect(up[1]).toEqual({ week: 2, opponent: null, tier: null })
    expect(up[0].opponent).toBe('BUF')
  })

  it('stops at the end of the schedule', () => {
    expect(upcomingGames(inputs.schedule, 'BUF', 3, allowed, 'RB', formConfig).length).toBe(1)
    expect(upcomingGames(inputs.schedule, 'BUF', null, allowed, 'RB', formConfig)).toEqual([])
  })

  it('tier boundaries', () => {
    expect(matchupTier(10, formConfig)).toBe('soft')
    expect(matchupTier(11, formConfig)).toBe('neutral')
    expect(matchupTier(22, formConfig)).toBe('neutral')
    expect(matchupTier(23, formConfig)).toBe('tough')
  })
})
