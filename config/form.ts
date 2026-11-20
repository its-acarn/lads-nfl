// Tunables for the /form page. Untuned starting values: adjust after seeing
// real output. See docs/superpowers/specs/2026-11-20-form-page-design.md.

import { FormPosition, FormWindow } from '../helpers/form/types'
import { Position } from '../helpers/waivers/types'

export interface FormConfig {
  defaultWindow: FormWindow
  windowOptions: FormWindow[]
  // A "hit" is a game at or above this many league points.
  hitThresholds: Record<FormPosition, number>
  signal: {
    minGames: number
    // Window snap share needed to join the buy/sell comparison pool.
    minSnapShare: Record<Position, number>
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
  windowOptions: [1, 2, 3, 4, 5, 6, 7, 8, 'season'],
  hitThresholds: { QB: 18, RB: 12, WR: 12, TE: 9, K: 8, DEF: 7 },
  signal: { minGames: 2, minSnapShare: { QB: 0.5, RB: 0.25, WR: 0.25, TE: 0.25 }, buyGap: 25, sellGap: -25 },
  matchup: { softMaxRank: 10, toughMinRank: 23, lookahead: 3 },
}
