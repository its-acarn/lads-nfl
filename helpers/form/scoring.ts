// League scoring from raw weekly stats: each stat times the league's weight
// for it. Sleeper's precomputed pts_* fields use its default scoring, which
// LadsLadsLads departs from (fum -1 on top of fum_lost -2), so the form page
// never reads them.

import { StatLine } from '../waivers/types'

export function pointsFor(line: StatLine | undefined, scoring: Record<string, number>): number {
  if (!line) return 0
  const stats = line as Record<string, number | undefined>
  return Object.keys(stats).reduce((acc, k) => {
    const v = stats[k]
    const weight = scoring[k]
    return typeof v === 'number' && typeof weight === 'number' ? acc + v * weight : acc
  }, 0)
}
