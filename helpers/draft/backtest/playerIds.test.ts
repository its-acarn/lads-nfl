import { describe, expect, it } from 'vitest'
import { buildIdIndex, IdEntry } from './playerIds'

const contemporaneous: IdEntry[] = [
  { player_id: '7564', name: "Ja'Marr Chase", position: 'WR', provenance: 'lads2025' },
  { player_id: '3321', name: 'Tyreek Hill', position: 'WR', provenance: 'lads2025' },
  { player_id: 'MIN', name: 'Minnesota Vikings', position: 'DEF', provenance: 'lads2025' },
]

const trim2026: IdEntry[] = [
  // Deliberately disagrees with the contemporaneous layer: a stale snapshot
  // must never override draft-day truth.
  { player_id: 'WRONG', name: "Ja'Marr Chase", position: 'WR', provenance: 'trim2026' },
  { player_id: 'DEN', name: 'Denver Broncos', position: 'DEF', provenance: 'trim2026' },
]

describe('buildIdIndex', () => {
  it('resolves from the most contemporaneous layer available', () => {
    const idx = buildIdIndex([contemporaneous, trim2026])
    expect(idx.resolve("Ja'Marr Chase", 'WR')).toEqual({ player_id: '7564', provenance: 'lads2025' })
  })

  it('falls back to the 2026 layer only for players the 2025 feeds never saw', () => {
    const idx = buildIdIndex([contemporaneous, trim2026])
    expect(idx.resolve('Denver Broncos', 'DEF')).toEqual({ player_id: 'DEN', provenance: 'trim2026' })
  })

  it('keeps players the 2026 snapshot has dropped — the reason this module exists', () => {
    const idx = buildIdIndex([contemporaneous, trim2026])
    expect(idx.resolve('Tyreek Hill', 'WR')).toEqual({ player_id: '3321', provenance: 'lads2025' })
  })

  it('matches the spreadsheet spelling of a defense against Sleeper first/last', () => {
    const idx = buildIdIndex([contemporaneous, trim2026])
    expect(idx.resolve('Minnesota Vikings', 'DEF')!.player_id).toBe('MIN')
  })

  it('falls back to a name-only match when the sources disagree on position', () => {
    const idx = buildIdIndex([contemporaneous, trim2026])
    // Sheet files him at TE; Sleeper says WR. The name is the stronger signal.
    expect(idx.resolve('Tyreek Hill', 'TE')!.player_id).toBe('3321')
  })

  it('refuses to guess when one name+position maps to two ids in a layer', () => {
    const clash: IdEntry[] = [
      { player_id: 'A', name: 'Mike Williams', position: 'WR', provenance: 'x' },
      { player_id: 'B', name: 'Mike Williams', position: 'WR', provenance: 'x' },
    ]
    const idx = buildIdIndex([clash])
    expect(idx.resolve('Mike Williams', 'WR')).toBeNull()
    expect(idx.ambiguousKeys()).toContain('mike williams|WR')
  })

  it('returns null for an unknown player rather than throwing', () => {
    const idx = buildIdIndex([contemporaneous])
    expect(idx.resolve('Nobody At All', 'RB')).toBeNull()
  })
})
