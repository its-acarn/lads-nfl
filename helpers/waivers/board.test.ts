import { describe, expect, it } from 'vitest'
import { buildWaiverBoard } from './board'
import { rosteredIds } from './availability'
import { waiverConfig } from '../../config/waivers'
import { loadWaiverFixture } from './fixtures.testutil'
import { POSITIONS, WaiverBoard, WaiverInputs } from './types'

const lads = loadWaiverFixture('lads')
const flexi = loadWaiverFixture('flexi')
const ownerOf = (inputs: WaiverInputs) => inputs.rosters.find((r) => r.roster_id === 1)!.owner_id as string

function allRows(board: WaiverBoard) {
  return [...POSITIONS.flatMap((p) => board.positions[p]), ...(board.kickers || []), ...(board.defences || [])]
}

describe('buildWaiverBoard on the fixture', () => {
  const board = buildWaiverBoard(lads, waiverConfig, ownerOf(lads))

  it('lists no rostered player anywhere', () => {
    const rostered = rosteredIds(lads.rosters)
    expect(allRows(board).filter((r) => rostered.has(r.playerId))).toEqual([])
  })

  it('lists up to topN per position, sorted by score, every score in 0..100', () => {
    POSITIONS.forEach((p) => {
      const rows = board.positions[p]
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.length).toBeLessThanOrEqual(waiverConfig.topN)
      rows.forEach((r, i) => {
        expect(r.position).toBe(p)
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(100)
        if (i > 0) expect(r.score).toBeLessThanOrEqual(rows[i - 1].score)
      })
    })
  })

  it('reports the last completed week and the upcoming one', () => {
    expect(board.throughWeek).toBeGreaterThanOrEqual(3)
    expect(board.upcomingWeek).toBeGreaterThan(board.throughWeek)
  })

  it('has K and DEF for LadsLadsLads and not for Flexi (no such slots)', () => {
    expect(board.kickers!.length).toBeGreaterThan(0)
    expect(board.defences!.length).toBeGreaterThan(0)
    const f = buildWaiverBoard(flexi, waiverConfig)
    expect(f.kickers).toBeNull()
    expect(f.defences).toBeNull()
  })

  it('suggests an upgrade only when the free agent beats the owner\'s weakest by the margin', () => {
    const rows = POSITIONS.flatMap((p) => board.positions[p]).filter((r) => r.upgradeOver)
    rows.forEach((r) => expect(r.score - r.upgradeOver!.score).toBeGreaterThanOrEqual(waiverConfig.upgradeMargin))
    const roster = lads.rosters.find((x) => x.roster_id === 1)!
    rows.forEach((r) => expect(roster.players).toContain(r.upgradeOver!.playerId))
  })

  it('has no upgrades and no alerts without an owner', () => {
    const anon = buildWaiverBoard(lads, waiverConfig)
    expect(POSITIONS.flatMap((p) => anon.positions[p]).some((r) => r.upgradeOver)).toBe(false)
    expect(anon.alerts).toEqual([])
  })

  it('matches the golden snapshot', () => {
    const compact = {
      throughWeek: board.throughWeek,
      upcomingWeek: board.upcomingWeek,
      positions: Object.fromEntries(
        POSITIONS.map((p) => [
          p,
          board.positions[p].slice(0, 10).map((r) =>
            `${r.name} ${r.team} ${r.score.toFixed(1)} [${r.flags.map((f) => f.label).join('; ')}]${r.upgradeOver ? ` > ${r.upgradeOver.name}` : ''}`
          ),
        ])
      ),
      kickers: board.kickers!.slice(0, 5).map((r) => `${r.name} v ${r.opponent} ${r.score.toFixed(1)}`),
      defences: board.defences!.slice(0, 5).map((r) => `${r.name} v ${r.opponent} ${r.score.toFixed(1)}`),
      alerts: board.alerts.map((a) => `${a.name} ${a.position} ${a.injuryStatus} -> ${a.bestReplacement ? a.bestReplacement.name : 'none'}`),
    }
    expect(compact).toMatchSnapshot()
  })
})

describe('buildWaiverBoard alerts', () => {
  it('flags the owner\'s injured active players with the best free agent at the position', () => {
    const roster = lads.rosters.find((r) => r.roster_id === 1)!
    const victim = roster.players!.find((id) => ['RB', 'WR'].includes(lads.players[id]?.position || '') && !(roster.reserve || []).includes(id))!
    const position = lads.players[victim].position as 'RB' | 'WR'
    const inputs: WaiverInputs = { ...lads, players: { ...lads.players, [victim]: { ...lads.players[victim], injury_status: 'Out' } } }
    const board = buildWaiverBoard(inputs, waiverConfig, roster.owner_id!)
    const alert = board.alerts.find((a) => a.playerId === victim)!
    expect(alert).toMatchObject({ position, injuryStatus: 'Out' })
    expect(alert.bestReplacement!.playerId).toBe(board.positions[position][0].playerId)
  })
})
