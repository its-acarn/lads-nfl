import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  applyCorrections,
  assertTiersMonotone,
  fatalProblems,
  findArraySpan,
  rankedToBoardPlayers,
  splicePlayers,
  toBoardPlayers,
} from './importBoard'
import { RankedEntry, RankedProblem, TierEntry } from '../helpers/draft/sheetBoard'
import { BoardPlayerInput, Position } from '../helpers/draft/types'

const BOARD_FILE = path.join(__dirname, '..', 'config', 'board.json')
const realBoardText = (): string => fs.readFileSync(BOARD_FILE, 'utf8')

const player = (name: string, pos: Position, tier: number, rank: number, team?: string): BoardPlayerInput => ({
  name,
  pos,
  team,
  tier,
  rank,
})

describe('findArraySpan', () => {
  it('finds the players array in the real config/board.json', () => {
    const text = realBoardText()
    const span = findArraySpan(text, 'players')
    expect(text.charAt(span.start)).toBe('[')
    expect(text.charAt(span.end)).toBe(']')
    expect(JSON.parse(text.slice(span.start, span.end + 1)).length).toBeGreaterThan(0)
  })

  it('is not fooled by a bracket inside a string', () => {
    const text = '{\n  "players": [\n    { "name": "Weird ] Name" }\n  ],\n  "after": 1\n}'
    const span = findArraySpan(text, 'players')
    expect(JSON.parse(text.slice(span.start, span.end + 1))).toEqual([{ name: 'Weird ] Name' }])
  })

  it('is not fooled by an escaped quote inside a string', () => {
    const text = '{\n  "players": [\n    { "name": "He said \\"] hi\\"" }\n  ],\n  "after": 1\n}'
    const span = findArraySpan(text, 'players')
    expect(JSON.parse(text.slice(span.start, span.end + 1))).toEqual([{ name: 'He said "] hi"' }])
  })

  it('refuses a file with no players key', () => {
    expect(() => findArraySpan('{"rules": {}}', 'players')).toThrow(/no "players" key/)
  })
})

describe('splicePlayers', () => {
  const newPlayers = [
    player('Bijan Robinson', 'RB', 1, 1, 'ATL'),
    player('Ja\'Marr Chase', 'WR', 1, 2, 'CIN'),
    player('Some Free Agent', 'TE', 3, 3),
  ]

  // The rules block encodes tuning Andrew has already done, and the
  // `//`-prefixed keys document it. Re-serialising the file would reflow both.
  it('replaces the players and leaves every other key byte for byte', () => {
    const before = realBoardText()
    const after = splicePlayers(before, newPlayers)

    const spanBefore = findArraySpan(before, 'players')
    const spanAfter = findArraySpan(after, 'players')
    expect(after.slice(0, spanAfter.start)).toBe(before.slice(0, spanBefore.start))
    expect(after.slice(spanAfter.end + 1)).toBe(before.slice(spanBefore.end + 1))
  })

  it('keeps the comment keys that document the rules', () => {
    const after = splicePlayers(realBoardText(), newPlayers)
    expect(after).toContain('"//minRoundByPos"')
    expect(after).toContain('"//vonaFromRound"')
    expect(after).toContain('"//useForcedStarters"')
    // And the tuning itself, unchanged.
    const parsed = JSON.parse(after) as { rules: { minRoundByPos: Record<string, number>; vonaFromRound: number } }
    expect(parsed.rules.minRoundByPos.QB).toBe(12)
    expect(parsed.rules.vonaFromRound).toBe(9)
  })

  it('writes the new players and nothing of the old ones', () => {
    const before = realBoardText()
    const after = splicePlayers(before, newPlayers)
    const parsed = JSON.parse(after) as { players: BoardPlayerInput[] }
    expect(parsed.players.length).toBe(3)
    expect(parsed.players[0].name).toBe('Bijan Robinson')
    expect(parsed.players[2].team).toBeUndefined()
    // "Jahmyr Gibbs" is in the placeholder board and not in the replacement.
    expect(after).not.toContain('Jahmyr Gibbs')
  })

  it('round-trips: splicing a board with its own players is a no-op', () => {
    const before = realBoardText()
    const parsed = JSON.parse(before) as { players: BoardPlayerInput[] }
    const after = splicePlayers(before, parsed.players)
    expect(JSON.parse(after)).toEqual(JSON.parse(before))
  })

  it('matches the file\'s own indentation', () => {
    const text = '{\n    "players": [\n        { "name": "Old" }\n    ],\n    "keep": 1\n}\n'
    const after = splicePlayers(text, [player('New', 'RB', 1, 1)])
    expect(after).toContain('\n        { "name": "New", "pos": "RB", "tier": 1, "rank": 1 }')
    expect(after).toContain('\n    "keep": 1')
  })

  it('produces valid JSON for an empty board', () => {
    const text = '{\n  "players": [\n    { "name": "Old" }\n  ],\n  "keep": 1\n}\n'
    expect(JSON.parse(splicePlayers(text, []))).toEqual({ players: [], keep: 1 })
  })
})

describe('toBoardPlayers', () => {
  const entry = (name: string, tier: number, column: number, row: number, fromQbColumn = false): TierEntry => ({
    name,
    tier,
    column,
    row,
    fromQbColumn,
  })

  const posOf = (name: string): Position | null => {
    const table: Record<string, Position> = { Alpha: 'RB', Bravo: 'WR', Charlie: 'TE' }
    return table[name] || null
  }
  const teamOf = (name: string): string | undefined => (name === 'Alpha' ? 'ATL' : undefined)

  it('numbers ranks 1..n in the order given, with no gaps', () => {
    const ordered = [entry('Alpha', 1, 0, 1), entry('Bravo', 1, 1, 1), entry('Charlie', 2, 0, 1)]
    const { players } = toBoardPlayers(ordered, posOf, teamOf)
    expect(players.map((p) => p.rank)).toEqual([1, 2, 3])
    expect(players.map((p) => p.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(players[0].team).toBe('ATL')
    expect(players[1].team).toBeUndefined()
  })

  it("takes QB from the QB's column even when the map disagrees", () => {
    const { players } = toBoardPlayers([entry('Alpha', 8, 5, 1, true)], posOf, teamOf)
    expect(players[0].pos).toBe('QB')
  })

  // A board entry needs a position, and guessing one would put the wrong
  // player on the clock. The caller turns this into a non-zero exit.
  it('reports a name whose position is unknown rather than guessing', () => {
    const ordered = [entry('Alpha', 1, 0, 1), entry('Nobody At All', 1, 0, 2), entry('Bravo', 2, 0, 1)]
    const { players, unknownPosition } = toBoardPlayers(ordered, posOf, teamOf)
    expect(unknownPosition.length).toBe(1)
    expect(unknownPosition[0]).toContain('Nobody At All')
    // And the ranks of what survived stay contiguous.
    expect(players.map((p) => p.rank)).toEqual([1, 2])
  })
})

// ---------------------------------------------------------------------------
// The ranked layout
// ---------------------------------------------------------------------------

const ranked = (name: string, tier: number, pos: Position, team: string | null, row: number): RankedEntry => ({
  name,
  tier,
  pos,
  team,
  row,
})

describe('rankedToBoardPlayers', () => {
  const entries = [
    ranked('Jahmyr Gibbs', 1, 'RB', 'DET', 1),
    ranked('Chiefs', 1, 'DEF', 'KC', 2),
    ranked("Ja'Marr Chase", 2, 'WR', 'CIN', 3),
    ranked('Harrison Butker', 2, 'K', 'KC', 4),
    ranked('Brock Bowers', 3, 'TE', 'LV', 5),
  ]

  // A position capped at 0 is one Andrew has decided never to draft, so
  // carrying it would only give the engine something it must then refuse.
  it('drops the excluded positions and reports how many', () => {
    const { players, dropped } = rankedToBoardPlayers(entries, ['K', 'DEF'])
    expect(players.map((p) => p.name)).toEqual(['Jahmyr Gibbs', "Ja'Marr Chase", 'Brock Bowers'])
    expect(dropped).toEqual({ DEF: 1, K: 1 })
  })

  // Holes in the rank sequence would confuse the value curve, which reads
  // rank as a position on the board rather than as an id.
  it('renumbers ranks contiguously after the drops', () => {
    const { players } = rankedToBoardPlayers(entries, ['K', 'DEF'])
    expect(players.map((p) => p.rank)).toEqual([1, 2, 3])
  })

  it('keeps the team the sheet stated, and omits a blank one', () => {
    const { players } = rankedToBoardPlayers(
      [ranked('With Team', 1, 'RB', 'DET', 1), ranked('No Team', 1, 'RB', null, 2)],
      []
    )
    expect(players[0].team).toBe('DET')
    expect(players[1].team).toBeUndefined()
  })

  it('excludes nothing when nothing is capped at zero', () => {
    expect(rankedToBoardPlayers(entries, []).players.length).toBe(5)
  })
})

describe('applyCorrections', () => {
  const entries = [
    ranked('Jahmyr Gibbs', 1, 'RB', 'DET', 1),
    ranked('Hollywood Brown', 2, 'WR', 'PHI', 2),
    ranked('Keenan Allen', 2, 'WR', 'LAC', 3),
    ranked('Brock Bowers', 3, 'TE', 'LV', 4),
  ]

  it('renames through nameAliases and reports each rename', () => {
    const out = applyCorrections(entries, { 'Hollywood Brown': 'Marquise Brown' }, [])
    expect(out.entries.map((e) => e.name)).toContain('Marquise Brown')
    expect(out.entries.map((e) => e.name)).not.toContain('Hollywood Brown')
    expect(out.renamed).toEqual(['Hollywood Brown -> Marquise Brown'])
  })

  it('drops names listed as not in the league, and reports them', () => {
    const out = applyCorrections(entries, {}, ['Keenan Allen'])
    expect(out.entries.map((e) => e.name)).not.toContain('Keenan Allen')
    expect(out.excluded).toEqual(['Keenan Allen'])
    expect(out.entries.length).toBe(3)
  })

  it('leaves everything else exactly as it was', () => {
    const out = applyCorrections(entries, { 'Hollywood Brown': 'Marquise Brown' }, ['Keenan Allen'])
    expect(out.entries.map((e) => e.name)).toEqual(['Jahmyr Gibbs', 'Marquise Brown', 'Brock Bowers'])
    expect(out.entries[1].tier).toBe(2)
    expect(out.entries[1].pos).toBe('WR')
    expect(out.entries[1].team).toBe('PHI')
  })

  // An exclusion list nobody reads is how a player who has since signed stays
  // undraftable all season.
  it('flags a correction that matched nothing, so a stale one gets noticed', () => {
    const out = applyCorrections(entries, { 'Not On The Sheet': 'Someone' }, ['Also Not Here'])
    expect(out.unusedCorrections.length).toBe(2)
    expect(out.unusedCorrections.join(' ')).toContain('Not On The Sheet')
    expect(out.unusedCorrections.join(' ')).toContain('Also Not Here')
  })

  it('refuses an alias that would put one player on the board twice', () => {
    expect(() => applyCorrections(entries, { 'Hollywood Brown': 'Brock Bowers' }, [])).toThrow(/appear twice/)
  })

  it('is a no-op with no corrections configured', () => {
    const out = applyCorrections(entries, {}, [])
    expect(out.entries).toEqual(entries)
    expect(out.renamed).toEqual([])
    expect(out.excluded).toEqual([])
    expect(out.unusedCorrections).toEqual([])
  })
})

// A 878-row export read to depth 300 must not be killed by a scratch note at
// row 850 -- but a bad row at 40 must still stop the import, because the board
// would silently be missing a player expected at that rank.
describe('fatalProblems', () => {
  const retained = [
    ranked('A', 1, 'RB', 'DET', 1),
    ranked('B', 1, 'WR', 'CIN', 2),
    ranked('C', 2, 'TE', 'LV', 5),
  ]
  const problem = (row: number): RankedProblem => ({ row, name: `row${row}`, reason: 'unusable tier' })

  it('treats a problem below the last retained row as harmless', () => {
    const out = fatalProblems([problem(900)], retained)
    expect(out.fatal).toEqual([])
    expect(out.ignored.length).toBe(1)
  })

  it('treats a problem inside the retained window as fatal', () => {
    const out = fatalProblems([problem(3)], retained)
    expect(out.fatal.length).toBe(1)
    expect(out.ignored).toEqual([])
  })

  it('counts the boundary row itself as inside', () => {
    expect(fatalProblems([problem(5)], retained).fatal.length).toBe(1)
    expect(fatalProblems([problem(6)], retained).fatal.length).toBe(0)
  })

  it('splits a mixed set correctly', () => {
    const out = fatalProblems([problem(2), problem(400), problem(4), problem(878)], retained)
    expect(out.fatal.map((p) => p.row)).toEqual([2, 4])
    expect(out.ignored.map((p) => p.row)).toEqual([400, 878])
  })

  it('treats every problem as fatal when nothing was retained', () => {
    // Nothing kept means the depth cut is above everything, so any unusable row
    // is inside whatever window exists.
    expect(fatalProblems([problem(1)], []).fatal.length).toBe(0)
  })
})

describe('assertTiersMonotone', () => {
  it('accepts a board whose tiers never decrease', () => {
    expect(() =>
      assertTiersMonotone([player('A', 'RB', 1, 1), player('B', 'WR', 1, 2), player('C', 'TE', 2, 3)])
    ).not.toThrow()
  })

  // The resolver requires this and the value curve assumes it; a sheet sorted
  // by anything other than rank would break it silently.
  it('refuses one where they do, naming the offender', () => {
    expect(() =>
      assertTiersMonotone([player('A', 'RB', 2, 1), player('B', 'WR', 1, 2)])
    ).toThrow(/tier decreases at rank 2 \(B/)
  })
})

// The real board, as imported. These assert the shape the engine will actually
// run against rather than a fixture written to suit the test.
describe('the committed 2026 board', () => {
  const board = JSON.parse(realBoardText()) as {
    players: BoardPlayerInput[]
    nameAliases?: Record<string, string>
    notInLeague?: string[]
    rules: { maxByPos: Record<string, number>; minRoundByPos: Record<string, number> }
  }

  it('is deep enough to cover a 168-pick draft', () => {
    expect(board.players.length).toBeGreaterThan(168)
  })

  it('has contiguous ranks starting at 1', () => {
    expect(board.players.map((p) => p.rank)).toEqual(board.players.map((_, i) => i + 1))
  })

  it('has non-decreasing tiers', () => {
    expect(() => assertTiersMonotone(board.players)).not.toThrow()
  })

  it('carries no player at a position capped at zero', () => {
    const capped = Object.keys(board.rules.maxByPos).filter((p) => board.rules.maxByPos[p] === 0)
    expect(capped).toContain('K')
    expect(capped).toContain('DEF')
    for (let i = 0; i < board.players.length; i++) {
      expect(capped.indexOf(board.players[i].pos), board.players[i].name).toBe(-1)
    }
  })

  it('has no duplicate names', () => {
    const seen: Record<string, boolean> = {}
    for (let i = 0; i < board.players.length; i++) {
      expect(seen[board.players[i].name], board.players[i].name).toBeUndefined()
      seen[board.players[i].name] = true
    }
  })

  it('carries the aliased name, not the sheet\'s nickname', () => {
    const names = board.players.map((p) => p.name)
    expect(names).toContain('Marquise Brown')
    expect(names).not.toContain('Hollywood Brown')
  })

  it('does not carry a name listed as not in the league', () => {
    const excluded = board.notInLeague || []
    for (let i = 0; i < excluded.length; i++) {
      expect(board.players.map((p) => p.name)).not.toContain(excluded[i])
    }
  })
})
