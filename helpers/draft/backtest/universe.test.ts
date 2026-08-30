import { describe, expect, it } from 'vitest'
import { buildUniverse, crossCheckAdp, Universe } from './universe'
import {
  loadFfc,
  loadJimmygPicks,
  loadLads2025Picks,
  loadSheetAdp,
  loadTrim2026,
} from './load'

function build(): Universe {
  return buildUniverse({
    adp: loadSheetAdp(),
    ladsPicks: loadLads2025Picks(),
    jimmygPicks: loadJimmygPicks(),
  })
}

const universe = build()
const trim2026 = loadTrim2026()

function findByName(name: string): string[] {
  const ids = Object.keys(universe.players)
  const out: string[] = []
  for (let i = 0; i < ids.length; i++) {
    if ((universe.players[ids[i]].full_name || '') === name) out.push(ids[i])
  }
  return out
}

describe('the 2025 universe', () => {
  it('contains every player the draft under test actually took', () => {
    // Not by construction: membership comes from the spreadsheet alone, never
    // from the pick feed, because a pool built from who got drafted would tell
    // the engine which names the room is going to take. This asserts the
    // spreadsheet happens to cover the whole draft.
    const picks = loadLads2025Picks()
    for (let i = 0; i < picks.length; i++) {
      expect(universe.players[picks[i].player_id], `pick ${picks[i].pick_no}`).toBeTruthy()
    }
    expect(picks.length).toBe(168)
    expect(universe.draftedButAbsent).toEqual([])
  })

  it('gives everyone an ADP from the spreadsheet, with no fallback layer needed', () => {
    const p = universe.adpProvenance
    expect(p.sheetSleeper + p.sheetRank).toBeGreaterThanOrEqual(150)
    // Both fallbacks are implemented but currently inert: every player either
    // draft took is already on the 358-row List tab. If a future sheet stops
    // covering the field these turn non-zero rather than failing.
    expect(p.jimmygTail).toBe(0)
    expect(p.deterministicTail).toBe(0)
  })

  it('has a dense, unique, gap-free search_rank', () => {
    // survival.ts consumes this as -searchRank/temperature, so the scale
    // matters: dense 1..N matches Sleeper's own search_rank, which is what the
    // live bot reads.
    const ids = Object.keys(universe.players)
    const seen: Record<number, boolean> = {}
    for (let i = 0; i < ids.length; i++) {
      const sr = universe.players[ids[i]].search_rank
      expect(sr).not.toBeNull()
      expect(seen[sr as number], `duplicate search_rank ${sr}`).toBeUndefined()
      seen[sr as number] = true
    }
    for (let r = 1; r <= ids.length; r++) expect(seen[r], `missing search_rank ${r}`).toBe(true)
  })

  it('is reproducible byte for byte', () => {
    expect(JSON.stringify(build().players)).toBe(JSON.stringify(universe.players))
  })
})

describe('provenance — the reason this module exists', () => {
  // These three were central to 2025 and had dropped out of Sleeper's 2026
  // player map when this suite was written. The universe must carry their
  // 2025 attributes from draft-day pick metadata regardless of what today's
  // map says — which changes: this spec originally asserted Keenan Allen was
  // ABSENT from the 2026 map, and a routine `npm run fixtures` refresh broke
  // it the day he signed with the Colts (Aug 2026). Assert nothing about the
  // live map here; the map-absent case is proven dynamically below.
  const gone = [
    { name: 'Tyreek Hill', pos: 'WR', team2025: 'MIA' },
    { name: 'Austin Ekeler', pos: 'RB', team2025: 'WAS' },
    { name: 'Keenan Allen', pos: 'WR', team2025: 'LAC' },
  ]

  for (let i = 0; i < gone.length; i++) {
    const g = gone[i]
    it(`keeps ${g.name}'s 2025 team from pick metadata, wherever today's map has moved on`, () => {
      const ids = findByName(g.name)
      expect(ids.length, `${g.name} should appear exactly once`).toBe(1)
      const p = universe.players[ids[0]]
      expect(p.position).toBe(g.pos)
      expect(p.team).toBe(g.team2025)
    })
  }

  it('gives full attributes to every player the 2026 map has dropped', () => {
    const ids = Object.keys(universe.players)
    let dropped = 0
    for (let i = 0; i < ids.length; i++) {
      if (trim2026[ids[i]]) continue
      dropped++
      const p = universe.players[ids[i]]
      expect(p.position, `${p.full_name} position`).toBeTruthy()
      expect(p.full_name, `${ids[i]} name`).toBeTruthy()
    }
    // If this ever hits zero the assertion has stopped testing anything.
    expect(dropped).toBeGreaterThan(0)
  })

  it('preserves draft-day injury designations rather than current ones', () => {
    // Sleeper freezes pick metadata at pick time -- verified against the
    // lads/2020 fixture, whose newest metadata timestamp is 2020-09-05. So
    // these are the designations that stood on 23 August 2025, and the stash
    // rule can act on them.
    const ids = Object.keys(universe.players)
    const counts: Record<string, number> = {}
    for (let i = 0; i < ids.length; i++) {
      const s = universe.players[ids[i]].injury_status
      if (s) counts[s] = (counts[s] || 0) + 1
    }
    expect(counts.PUP).toBeGreaterThan(0)
    expect(counts.Questionable).toBeGreaterThan(0)
  })
})

describe('cross-check against an independent pre-season consensus', () => {
  it('agrees closely with Fantasy Football Calculator', () => {
    // Two sources built from different data by different people in the same
    // pre-season window. Sharp divergence would mean one is not what it
    // appears to be.
    const cc = crossCheckAdp(universe, loadFfc().players)
    expect(cc.matched).toBeGreaterThan(140)
    expect(cc.unmatched).toBeLessThan(10)
    expect(cc.pearson).toBeGreaterThan(0.8)
  })
})
