import { describe, expect, it } from 'vitest'
import { loadWaiverFixture } from '../waivers/fixtures.testutil'
import { missedGames, playerGames, windowGames } from './games'
import { game, makeInputs, meta, row } from './inputs.testutil'

describe('playerGames', () => {
  it('counts only played weeks', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB'), game(3, 'CAR', 'TB'), game(4, 'NO', 'CAR')],
      statsByWeek: {
        1: { r1: row('NO', { off_snp: 40, rush_yd: 50 }) },
        2: { r1: row('NO', { off_snp: 0 }) },
        3: {},
        4: { r1: row('NO', { off_snp: 30, rush_yd: 100 }) },
      },
      players: [meta('r1', 'RB', 'NO')],
    })
    const g = playerGames(inputs)
    expect(g.r1.map((x) => x.week)).toEqual([1, 4])
    expect(g.r1.map((x) => x.points)).toEqual([5, 10])
    expect(g.r1.map((x) => x.opponent)).toEqual(['ATL', 'CAR'])
  })

  it('keeps a played zero', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL')],
      statsByWeek: { 1: { w1: row('NO', { off_snp: 30 }) } },
      players: [meta('w1', 'WR', 'NO')],
    })
    expect(playerGames(inputs).w1).toEqual([{ week: 1, team: 'NO', opponent: 'ATL', points: 0 }])
  })

  it("uses that week's team for a traded player", () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NYJ', 'BUF'), game(1, 'KC', 'DEN'), game(2, 'KC', 'LV'), game(2, 'NYJ', 'MIA')],
      statsByWeek: {
        1: { w1: row('NYJ', { off_snp: 30 }) },
        2: { w1: row('KC', { off_snp: 30 }) },
      },
      players: [meta('w1', 'WR', 'KC')],
    })
    const g = playerGames(inputs).w1
    expect(g.map((x) => [x.team, x.opponent])).toEqual([
      ['NYJ', 'BUF'],
      ['KC', 'LV'],
    ])
  })

  it('K and DEF need gp', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB')],
      statsByWeek: {
        1: { k1: row('NO', { xpm: 2 }), k2: row('NO', {}), NO: row('NO', { sack: 3 }) },
        2: { k2: row('NO', { gp: 1 }), NO: row('NO', { gp: 1, sack: 2 }) },
      },
      players: [meta('k1', 'K', 'NO'), meta('k2', 'K', 'NO'), meta('NO', 'DEF', 'NO')],
    })
    const g = playerGames(inputs)
    expect(g.k1).toBeUndefined()
    expect(g.k2).toEqual([{ week: 2, team: 'NO', opponent: 'TB', points: 0 }])
    expect(g.NO).toEqual([{ week: 2, team: 'NO', opponent: 'TB', points: 2 }])
  })

  it('skips incomplete weeks', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL'), game(2, 'NO', 'TB'), game(2, 'CAR', 'GB', 'pre_game')],
      statsByWeek: {
        1: { r1: row('NO', { off_snp: 40 }) },
        2: { r1: row('NO', { off_snp: 40 }) },
      },
      players: [meta('r1', 'RB', 'NO')],
    })
    expect(playerGames(inputs).r1.map((x) => x.week)).toEqual([1])
  })

  it('ignores positions the page does not cover', () => {
    const inputs = makeInputs({
      schedule: [game(1, 'NO', 'ATL')],
      statsByWeek: { 1: { lb: row('NO', { off_snp: 40 }) } },
      players: [meta('lb', 'LB', 'NO')],
    })
    expect(playerGames(inputs).lb).toBeUndefined()
  })

  it('on the fixture, every game has an opponent and weeks ascend', () => {
    const g = playerGames(loadWaiverFixture('lads'))
    const ids = Object.keys(g)
    expect(ids.length).toBeGreaterThan(300)
    ids.forEach((id) => {
      g[id].forEach((x, i) => {
        expect(x.opponent).toMatch(/^[A-Z]{2,3}$/)
        if (i > 0) expect(x.week).toBeGreaterThan(g[id][i - 1].week)
      })
    })
  })
})

describe('windowGames', () => {
  it('takes the last N, all when fewer, everything for season', () => {
    expect(windowGames([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5])
    expect(windowGames([1, 2], 3)).toEqual([1, 2])
    expect(windowGames([1, 2, 3], 'season')).toEqual([1, 2, 3])
  })
})

describe('missedGames', () => {
  it('counts only games in finished weeks, so a Thursday game mid-week is not a miss', () => {
    const schedule = [
      game(1, 'KC', 'BUF'),
      game(2, 'KC', 'DEN'),
      game(3, 'KC', 'LV'), // Thursday: done
      game(3, 'MIA', 'NE', 'pre_game'), // the rest of week 3 has not been played
    ]
    const weeks = [1, 2] // week 3 is not finished
    expect(missedGames(schedule, 'KC', 1, weeks)).toBe(1)
    expect(missedGames(schedule, 'KC', 2, weeks)).toBe(0)
  })
})
