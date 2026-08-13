import { describe, expect, it } from 'vitest'
import { gumbel, mulberry32 } from './rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean).length
    expect(same).toBeLessThan(3)
  })

  it('stays in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 10000; i++) {
      const x = rng()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('gumbel', () => {
  it('is finite and roughly centred on the Euler-Mascheroni constant', () => {
    const rng = mulberry32(123)
    let sum = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      const g = gumbel(rng)
      expect(isFinite(g)).toBe(true)
      sum += g
    }
    expect(sum / n).toBeGreaterThan(0.45) // gamma ~= 0.577
    expect(sum / n).toBeLessThan(0.7)
  })
})
