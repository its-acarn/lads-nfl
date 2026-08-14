import { describe, expect, it } from 'vitest'
import { joinName, normalizeName, parsePosToken } from './names'

describe('normalizeName', () => {
  it('folds case, punctuation and generational suffixes', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison')
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
    expect(normalizeName('  Amon-Ra   St. Brown ')).toBe('amonra st brown')
  })

  it('folds the curly apostrophe a spreadsheet produces', () => {
    // Google Sheets silently rewrites ' as ’ on entry, so the two spellings
    // must land on the same key or half the board fails to resolve.
    expect(normalizeName('Ja’Marr Chase')).toBe(normalizeName("Ja'Marr Chase"))
  })

  it('leaves distinct players distinct', () => {
    expect(normalizeName('Michael Pittman Jr.')).not.toBe(normalizeName('Michael Thomas'))
  })
})

describe('parsePosToken', () => {
  it('splits a position from its positional rank', () => {
    expect(parsePosToken('WR1')).toEqual({ pos: 'WR', index: 1 })
    expect(parsePosToken('RB12')).toEqual({ pos: 'RB', index: 12 })
    expect(parsePosToken('K3')).toEqual({ pos: 'K', index: 3 })
  })

  it('maps the spreadsheet DST spelling onto Sleeper DEF', () => {
    expect(parsePosToken('DST')).toEqual({ pos: 'DEF', index: null })
    expect(parsePosToken('DST1')).toEqual({ pos: 'DEF', index: 1 })
  })

  it('returns null rather than guessing at anything unrecognised', () => {
    expect(parsePosToken('')).toBeNull()
    expect(parsePosToken('LB4')).toBeNull()
    expect(parsePosToken('???')).toBeNull()
  })
})

describe('joinName', () => {
  it('joins the first/last split Sleeper uses for defenses', () => {
    expect(joinName('Denver', 'Broncos', null)).toBe('Denver Broncos')
  })

  it('prefers full_name when present', () => {
    expect(joinName('Ja’Marr', 'Chase', "Ja'Marr Chase")).toBe("Ja'Marr Chase")
  })

  it('tolerates a missing half', () => {
    expect(joinName('Cher', null, null)).toBe('Cher')
    expect(joinName(null, null, null)).toBe('')
  })
})
