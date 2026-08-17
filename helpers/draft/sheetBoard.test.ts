import { describe, expect, it } from 'vitest'
import {
  deriveRanks,
  docIdFrom,
  isRankedLayout,
  parseCsv,
  parseRankedTab,
  parseTiersTab,
  positionFromToken,
  positionOfEntry,
  TIER_BLOCK_LAST_ROW,
  TierEntry,
} from './sheetBoard'

// A tier grid shaped like the sheet: one COLUMN per tier, header in row 1,
// names from row 2 down.
function grid(rows: string[][]): string[][] {
  return rows
}

describe('docIdFrom', () => {
  it('takes the id out of a pasted browser URL', () => {
    expect(docIdFrom('https://docs.google.com/spreadsheets/d/1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88/edit#gid=0')).toBe(
      '1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88'
    )
  })

  it('passes a bare document id straight through', () => {
    expect(docIdFrom('1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88')).toBe(
      '1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88'
    )
  })
})

describe('parseTiersTab row bounds', () => {
  // The tier block is rows 2..24 only. Below it, column A continues with a
  // long scratch list that is NOT part of the board -- reading the whole
  // column reported 509 tiered players instead of 157.
  it('stops at the end of the tier block and ignores the scratch list below', () => {
    const rows: string[][] = [['Tier 1', 'Tier 2']]
    for (let r = 1; r <= TIER_BLOCK_LAST_ROW; r++) rows.push([`In${r}`, `Two${r}`])
    for (let r = 0; r < 40; r++) rows.push([`ScratchListName${r}`, ''])

    const out = parseTiersTab(grid(rows))
    const names = out.map((e) => e.name)
    expect(names.some((n) => n.indexOf('Scratch') === 0)).toBe(false)
    // 23 rows of the block, in each of two columns.
    expect(out.length).toBe(TIER_BLOCK_LAST_ROW * 2)
  })

  it('skips blank cells inside the block rather than emitting empty names', () => {
    const rows = [['Tier 1'], ['Alpha'], [''], ['Bravo']]
    expect(parseTiersTab(grid(rows)).map((e) => e.name)).toEqual(['Alpha', 'Bravo'])
  })

  it('refuses a column header it does not recognise', () => {
    expect(() => parseTiersTab(grid([['Tier 1', 'Sleepers'], ['Alpha', 'Bravo']]))).toThrow(
      /unrecognised header/
    )
  })

  it('refuses a tab with no header row', () => {
    expect(() => parseTiersTab(grid([[''], ['Alpha']]))).toThrow(/no header row/)
  })
})

describe('deriveRanks', () => {
  // Load-bearing: below vonaFromRound the engine follows board order outright,
  // so a scrambled rank here is a wrong pick in round one.
  it('orders tier-major, then by column, then down the column', () => {
    const entries: TierEntry[] = [
      { name: 'T2-c0-r2', tier: 2, column: 0, row: 2, fromQbColumn: false },
      { name: 'T1-c1-r1', tier: 1, column: 1, row: 1, fromQbColumn: false },
      { name: 'T1-c0-r2', tier: 1, column: 0, row: 2, fromQbColumn: false },
      { name: 'T1-c0-r1', tier: 1, column: 0, row: 1, fromQbColumn: false },
    ]
    expect(deriveRanks(entries).map((e) => e.name)).toEqual([
      'T1-c0-r1',
      'T1-c0-r2',
      'T1-c1-r1',
      'T2-c0-r2',
    ])
  })

  it('makes tier non-decreasing across the derived order, which the resolver requires', () => {
    const rows = [
      ['Tier 1', 'Tier 3', 'Tier 2'],
      ['A', 'C', 'B'],
      ['A2', 'C2', 'B2'],
    ]
    const ordered = deriveRanks(parseTiersTab(grid(rows)))
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].tier).toBeGreaterThanOrEqual(ordered[i - 1].tier)
    }
  })

  it('does not mutate its input', () => {
    const entries: TierEntry[] = [
      { name: 'B', tier: 2, column: 0, row: 1, fromQbColumn: false },
      { name: 'A', tier: 1, column: 0, row: 1, fromQbColumn: false },
    ]
    deriveRanks(entries)
    expect(entries.map((e) => e.name)).toEqual(['B', 'A'])
  })
})

describe('positionOfEntry', () => {
  it("takes QB from the QB's column without consulting the lookup", () => {
    const entry: TierEntry = { name: 'Whoever', tier: 8, column: 5, row: 3, fromQbColumn: true }
    expect(
      positionOfEntry(entry, () => {
        throw new Error('lookup should not be consulted')
      })
    ).toBe('QB')
  })

  it('defers to the lookup for every other column', () => {
    const entry: TierEntry = { name: 'Bijan Robinson', tier: 1, column: 0, row: 1, fromQbColumn: false }
    expect(positionOfEntry(entry, () => 'RB')).toBe('RB')
    expect(positionOfEntry(entry, () => null)).toBe(null)
  })
})

describe('parseCsv', () => {
  // The gviz endpoint quotes liberally; a name with a comma in it would
  // otherwise split into two board entries.
  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('"Smith, Jr.",RB\n')).toEqual([['Smith, Jr.', 'RB']])
  })
})

// ---------------------------------------------------------------------------
// The ranked layout, which is what the 2026 sheet turned out to be.
// ---------------------------------------------------------------------------

const RANKED_HEADER = ['RK', 'TIERS', 'PLAYER NAME', 'TEAM', 'POS', 'BYE WEEK', 'UPSIDE', 'BUST']
const rankedRows = (): string[][] => [
  RANKED_HEADER,
  ['1', '1', 'Jahmyr Gibbs', 'DET', 'RB1', '6', '5 out of 5', '1 out of 5'],
  ['2', '1', "Ja'Marr Chase", 'CIN', 'WR1', '6', '5 out of 5', '1 out of 5'],
  ['3', '2', 'Brock Bowers', 'LV', 'TE1', '8', '4 out of 5', '2 out of 5'],
  ['4', '2', 'Josh Allen', 'BUF', 'QB1', '7', '4 out of 5', '2 out of 5'],
  ['5', '3', 'Chiefs', 'KC', 'DST', '10', '-', '-'],
  ['6', '3', 'Harrison Butker', 'KC', 'K1', '10', '-', '-'],
]

describe('isRankedLayout', () => {
  it('recognises a ranked table by its header', () => {
    expect(isRankedLayout(rankedRows())).toBe(true)
  })

  it('does not mistake a tier grid for one', () => {
    expect(isRankedLayout([['Tier 1', 'Tier 2'], ['Alpha', 'Bravo']])).toBe(false)
  })

  it('is false for an empty tab', () => {
    expect(isRankedLayout([])).toBe(false)
  })
})

describe('positionFromToken', () => {
  // Ranking exports staple the positional rank onto the position, and that
  // number is emphatically not a tier.
  it('strips the positional rank', () => {
    expect(positionFromToken('RB1')).toBe('RB')
    expect(positionFromToken('WR355')).toBe('WR')
    expect(positionFromToken('QB12')).toBe('QB')
  })

  // Sleeper says DEF; every ranking site says DST or D/ST.
  it('maps team-defense spellings onto Sleeper\'s DEF', () => {
    expect(positionFromToken('DST')).toBe('DEF')
    expect(positionFromToken('D/ST')).toBe('DEF')
    expect(positionFromToken('DEF')).toBe('DEF')
  })

  it('accepts a bare position and is case-insensitive', () => {
    expect(positionFromToken('te')).toBe('TE')
    expect(positionFromToken('K')).toBe('K')
  })

  it('returns null for something it does not recognise', () => {
    expect(positionFromToken('LB2')).toBe(null)
    expect(positionFromToken('')).toBe(null)
  })
})

describe('parseRankedTab', () => {
  it('reads name, tier, position and team from each row', () => {
    const out = parseRankedTab(rankedRows()).entries
    expect(out.length).toBe(6)
    expect(out[0]).toMatchObject({ name: 'Jahmyr Gibbs', tier: 1, pos: 'RB', team: 'DET' })
    expect(out[4]).toMatchObject({ name: 'Chiefs', tier: 3, pos: 'DEF', team: 'KC' })
  })

  it('keeps the sheet\'s own row order, which is the board order', () => {
    expect(parseRankedTab(rankedRows()).entries.map((e) => e.name)).toEqual([
      'Jahmyr Gibbs',
      "Ja'Marr Chase",
      'Brock Bowers',
      'Josh Allen',
      'Chiefs',
      'Harrison Butker',
    ])
  })

  it('skips blank rows rather than emitting empty names', () => {
    const rows = rankedRows()
    rows.splice(3, 0, ['', '', '', '', '', '', '', ''])
    expect(parseRankedTab(rows).entries.length).toBe(6)
  })

  it('finds its columns by header name, not by position', () => {
    const rows = [
      ['PLAYER NAME', 'POS', 'TIER', 'TEAM'],
      ['Jahmyr Gibbs', 'RB1', '1', 'DET'],
    ]
    expect(parseRankedTab(rows).entries[0]).toMatchObject({ name: 'Jahmyr Gibbs', pos: 'RB', tier: 1, team: 'DET' })
  })

  // Whether an unusable row is fatal depends on how deep the caller reads, and
  // the parser does not know that -- so it reports and the caller decides. A
  // scratch note 550 rows past a depth cut must not kill an import.
  it('reports a row whose tier will not parse, rather than throwing', () => {
    const rows = rankedRows()
    rows[1][1] = 'n/a'
    const out = parseRankedTab(rows)
    expect(out.problems.length).toBe(1)
    expect(out.problems[0].name).toBe('Jahmyr Gibbs')
    expect(out.problems[0].reason).toContain('unusable tier')
    expect(out.problems[0].row).toBe(1)
    // And the row is excluded rather than admitted with a broken tier.
    expect(out.entries.map((e) => e.name)).not.toContain('Jahmyr Gibbs')
  })

  it('reports a row whose position it does not recognise', () => {
    const rows = rankedRows()
    rows[1][4] = 'LB1'
    const out = parseRankedTab(rows)
    expect(out.problems.length).toBe(1)
    expect(out.problems[0].reason).toContain('unrecognised position')
  })

  it('keeps every good row when one row is bad', () => {
    const rows = rankedRows()
    rows[3][1] = 'oops'
    const out = parseRankedTab(rows)
    expect(out.entries.length).toBe(5)
    expect(out.problems.length).toBe(1)
  })

  // A missing COLUMN is different: no row can be read without it, so it is
  // fatal regardless of depth.
  it('refuses a tab with no tier column', () => {
    expect(() => parseRankedTab([['RK', 'PLAYER NAME', 'POS'], ['1', 'X', 'RB1']])).toThrow(/no tier column/)
  })

  it('refuses a header with no usable rows under it', () => {
    expect(() => parseRankedTab([RANKED_HEADER])).toThrow(/no usable player rows/)
  })
})
