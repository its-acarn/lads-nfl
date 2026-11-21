// Tunables for the /form page. Untuned starting values: adjust after seeing
// real output. See docs/superpowers/specs/2026-11-20-form-page-design.md.

import { FormPosition, FormWindow } from '../helpers/form/types'
import { Position } from '../helpers/waivers/types'

export interface FormConfig {
  defaultWindow: FormWindow
  // Points allowed is per team, a handful of games is noisy: default longer.
  defaultAllowedWindow: FormWindow
  windowOptions: FormWindow[]
  // The player table hides anyone who has missed this many of his team's
  // games since he last played (a search still finds him).
  idleAfter: number
  // ...unless he is healthy and this high on his team's depth chart (back
  // from injury, about to play): those stay visible, marked "returning".
  returningMaxDepth: number
  // A "hit" is a game at or above this many league points.
  hitThresholds: Record<FormPosition, number>
  signal: {
    minGames: number
    // Window snap share needed to join the buy/sell comparison pool.
    minSnapShare: Record<Position, number>
    // Out of the comparison: missed more of his team's games than this since
    // his last game, or listed with one of these injury statuses.
    maxMissed: number
    excludeInjury: string[]
    // usage percentile minus points percentile
    buyGap: number
    sellGap: number
  }
  matchup: {
    softMaxRank: number // ranks 1..softMaxRank are soft
    toughMinRank: number // ranks toughMinRank..32 are tough
    lookahead: number
  }
}

export const formConfig: FormConfig = {
  defaultWindow: 3,
  defaultAllowedWindow: 6,
  windowOptions: [1, 2, 3, 4, 5, 6, 7, 8, 'season'],
  idleAfter: 2,
  // 1 only: at 2 the list filled with backup QBs.
  returningMaxDepth: 1,
  hitThresholds: { QB: 18, RB: 12, WR: 12, TE: 9, K: 8, DEF: 7 },
  signal: {
    minGames: 2,
    minSnapShare: { QB: 0.5, RB: 0.25, WR: 0.25, TE: 0.25 },
    maxMissed: 1,
    excludeInjury: ['IR', 'Out', 'PUP', 'Sus', 'NA', 'DNR', 'COV'],
    buyGap: 25,
    sellGap: -25,
  },
  matchup: { softMaxRank: 10, toughMinRank: 23, lookahead: 3 },
}
