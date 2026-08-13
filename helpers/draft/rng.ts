// Seeded PRNG (mulberry32). The engine never touches Math.random so every
// simulation, replay, and test is reproducible from a seed.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard Gumbel(0,1) sample; adding these to utilities and taking argmax
// draws from the softmax distribution (Gumbel-max trick).
export function gumbel(rng: Rng): number {
  // Clamp away from 0 and 1 so the double log stays finite.
  const u = Math.min(Math.max(rng(), 1e-12), 1 - 1e-12)
  return -Math.log(-Math.log(u))
}
