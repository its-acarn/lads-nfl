import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { deriveRanks, parseCsv, parseListTab, parseTiersTab } from './importSheet'
import { Position, ResolvedBoard } from '../helpers/draft/types'

const ROOT = path.join(__dirname, '..')

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8')) as T
}

describe('parseCsv', () => {
  it('reads quoted fields, embedded commas and doubled quotes', () => {
    const rows = parseCsv('"a","b,c","say ""hi"""\n"1","2","3"\n')
    expect(rows).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '2', '3'],
    ])
  })

  it('handles a trailing row with no newline, and ignores carriage returns', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('keeps empty trailing fields, which the sheet emits by the dozen', () => {
    expect(parseCsv('"x","","",""\n')).toEqual([['x', '', '', '']])
  })
})

describe('parseListTab', () => {
  const header = ['Rank', 'Player', 'Team', 'Bye', 'POS', 'Sleeper']

  it('parses rank, position and the Sleeper ADP column', () => {
    const out = parseListTab([header, ['1', "Ja'Marr Chase", 'CIN', '10', 'WR1', '1']])
    expect(out).toEqual([
      { player_id: null, name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', rank: 1, sleeper: 1 },
    ])
  })

  it('records a blank Sleeper column as null rather than zero', () => {
    // 45 of the 358 rows are blank here; a zero would read as the best ADP in
    // the league and put a kicker at the top of the opponent model.
    const out = parseListTab([header, ['229', 'Brandon McManus', 'GB', '5', 'K7', '']])
    expect(out[0].sleeper).toBeNull()
    expect(out[0].rank).toBe(229)
  })

  it('drops the team for defenses, whose Team cell holds the literal DST', () => {
    const out = parseListTab([header, ['124', 'Denver Broncos', 'DST', '12', 'DST1', '147']])
    expect(out[0].pos).toBe('DEF')
    expect(out[0].team).toBeNull()
  })

  it('rejects a changed header instead of reading columns by position', () => {
    expect(() => parseListTab([['Rank', 'Name', 'Team', 'Bye', 'POS', 'Sleeper']])).toThrow(/header changed/)
  })

  it('rejects an unrecognised position rather than guessing', () => {
    expect(() => parseListTab([header, ['5', 'Some Linebacker', 'NYJ', '7', 'LB1', '5']])).toThrow(/unrecognised POS/)
  })
})

describe('parseTiersTab', () => {
  // Header plus 30 body rows. The tier block is rows 2..24 of the sheet, which
  // is body indices 1..23; anything below that in column A is a scratch list.
  function grid(): string[][] {
    const rows: string[][] = [['Tier 1', 'Tier 2', 'Last Tier', 'Last Tier', "QB's"]]
    for (let r = 1; r <= 30; r++) rows.push(['', '', '', '', ''])
    rows[1][0] = 'Alpha'
    rows[2][0] = 'Bravo'
    rows[1][1] = 'Charlie'
    rows[1][2] = 'Delta'
    rows[1][3] = 'Echo'
    rows[1][4] = 'Quarterback One'
    rows[24][0] = 'SCRATCH ONE' // sheet row 25 — below the block
    rows[28][0] = 'SCRATCH TWO'
    return rows
  }

  it('maps column headers to tier numbers, both Last Tier columns to tier 8', () => {
    const out = parseTiersTab(grid())
    const byName: Record<string, number> = {}
    for (let i = 0; i < out.length; i++) byName[out[i].name] = out[i].tier
    expect(byName['Alpha']).toBe(1)
    expect(byName['Charlie']).toBe(2)
    expect(byName['Delta']).toBe(8)
    expect(byName['Echo']).toBe(8)
  })

  it('prices quarterbacks at tier 8 and flags where they came from', () => {
    const out = parseTiersTab(grid())
    const qb = out.filter((e) => e.name === 'Quarterback One')[0]
    expect(qb.tier).toBe(8)
    expect(qb.fromQbColumn).toBe(true)
  })

  it('ignores the scratch list below the tier block', () => {
    // This is the specific mistake that reported 509 tiered players instead of
    // 157 on the first read of the real sheet.
    const names = parseTiersTab(grid()).map((e) => e.name)
    expect(names).not.toContain('SCRATCH ONE')
    expect(names).not.toContain('SCRATCH TWO')
    expect(names.length).toBe(6)
  })

  it('rejects an unrecognised column header rather than silently skipping it', () => {
    const g = grid()
    g[0][1] = 'Sleepers?'
    expect(() => parseTiersTab(g)).toThrow(/unrecognised header/)
  })
})

describe('deriveRanks', () => {
  it('orders by tier first, then column, then row', () => {
    const entries = [
      { name: 'later tier', tier: 2, column: 0, row: 1, fromQbColumn: false },
      { name: 'second col', tier: 1, column: 1, row: 1, fromQbColumn: false },
      { name: 'first', tier: 1, column: 0, row: 1, fromQbColumn: false },
      { name: 'first col row 2', tier: 1, column: 0, row: 2, fromQbColumn: false },
    ]
    expect(deriveRanks(entries).map((e) => e.name)).toEqual([
      'first',
      'first col row 2',
      'second col',
      'later tier',
    ])
  })
})

describe('the committed board artifact', () => {
  const board = readJson<ResolvedBoard>('config', 'board.2025.json')

  it('holds the whole tier block and nothing else', () => {
    expect(board.players.length).toBe(157)
    expect(board.season).toBe(2025)
  })

  it('contains no kicker and no defense', () => {
    // Andrew's board omits both and his real 2025 roster had neither, so their
    // presence would mean the import pulled from List, which is market data.
    const positions: Record<string, number> = {}
    for (let i = 0; i < board.players.length; i++) {
      positions[board.players[i].pos] = (positions[board.players[i].pos] || 0) + 1
    }
    expect(positions.K).toBeUndefined()
    expect(positions.DEF).toBeUndefined()
  })

  it('has tiers non-decreasing across the derived rank order', () => {
    const sorted = board.players.slice().sort((a, b) => a.rank - b.rank)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].tier, `rank ${sorted[i].rank} ${sorted[i].name}`).toBeGreaterThanOrEqual(sorted[i - 1].tier)
    }
    expect(sorted[0].rank).toBe(1)
    expect(sorted[sorted.length - 1].rank).toBe(157)
  })

  it('gives every player a Sleeper id and a unique rank', () => {
    const ids: Record<string, boolean> = {}
    const ranks: Record<number, boolean> = {}
    for (let i = 0; i < board.players.length; i++) {
      const p = board.players[i]
      expect(p.player_id, p.name).toBeTruthy()
      expect(ids[p.player_id], `duplicate id for ${p.name}`).toBeUndefined()
      expect(ranks[p.rank], `duplicate rank ${p.rank}`).toBeUndefined()
      ids[p.player_id] = true
      ranks[p.rank] = true
    }
  })

  it('caps K and DEF at zero so the engine can never take one', () => {
    expect(board.rules.maxByPos.K).toBe(0)
    expect(board.rules.maxByPos.DEF).toBe(0)
  })
})

describe('the committed ADP artifact', () => {
  const adp = readJson<{ player_id: string; name: string; pos: Position; rank: number; sleeper: number | null }[]>(
    'fixtures',
    'backtest2025',
    'adp.sheet.json'
  )

  it('resolved every entry it kept', () => {
    for (let i = 0; i < adp.length; i++) expect(adp[i].player_id, adp[i].name).toBeTruthy()
  })

  it('covers the full draftable depth', () => {
    // Anything unresolved inside 168 is fatal at import time, so the kept set
    // must contain every rank from 1 to 168.
    const seen: Record<number, boolean> = {}
    for (let i = 0; i < adp.length; i++) seen[adp[i].rank] = true
    for (let r = 1; r <= 168; r++) expect(seen[r], `missing ADP rank ${r}`).toBe(true)
  })

  it('includes the kickers and defenses the board deliberately omits', () => {
    // The opponent model needs them even though Andrew will not draft them:
    // other managers do, and their picks shape what survives to his turn.
    const byPos: Record<string, number> = {}
    for (let i = 0; i < adp.length; i++) byPos[adp[i].pos] = (byPos[adp[i].pos] || 0) + 1
    expect(byPos.K).toBeGreaterThan(0)
    expect(byPos.DEF).toBeGreaterThan(0)
  })
})
