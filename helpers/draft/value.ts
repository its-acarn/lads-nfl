// Board-driven value function. Tier plateaus with geometric decay, a small
// within-tier rank epsilon for stable ordering, and ADP interpolation for
// off-board players (flagged, discounted).

import { ResolvedBoard, ResolvedBoardPlayer } from './types'

export interface ValueOpts {
  tierBase: number // value of tier 1
  tierDecay: number // multiplier per tier step
  rankEpsilon: number // subtracted per overall-rank step, keeps ordering stable
}

export const DEFAULT_VALUE_OPTS: ValueOpts = {
  tierBase: 100,
  tierDecay: 0.85,
  rankEpsilon: 0.01,
}

export function boardValue(player: ResolvedBoardPlayer, opts: ValueOpts): number {
  return opts.tierBase * Math.pow(opts.tierDecay, player.tier - 1) - opts.rankEpsilon * player.rank
}

export interface Valuer {
  valueForBoardPlayer(playerId: string): number | null
  valueForOffBoard(searchRank: number): number
}

// Off-board players are mapped onto the board's own (search_rank -> value)
// curve by linear interpolation, clamped flat at both ends, then discounted.
export function buildValuer(
  board: ResolvedBoard,
  searchRankById: Record<string, number | null>,
  opts?: Partial<ValueOpts>
): Valuer {
  // Precedence: an explicit argument beats the board's own `rules.value`,
  // which beats the engine defaults. The board is where a drafter configures
  // this; the argument exists so a caller can experiment without editing it.
  const fromBoard = board.rules.value || {}
  const pick = (a: number | undefined, b: number | undefined, d: number): number =>
    a !== undefined ? a : b !== undefined ? b : d
  const o: ValueOpts = {
    tierBase: pick(opts && opts.tierBase, fromBoard.tierBase, DEFAULT_VALUE_OPTS.tierBase),
    tierDecay: pick(opts && opts.tierDecay, fromBoard.tierDecay, DEFAULT_VALUE_OPTS.tierDecay),
    rankEpsilon: pick(opts && opts.rankEpsilon, fromBoard.rankEpsilon, DEFAULT_VALUE_OPTS.rankEpsilon),
  }

  const valueById: Record<string, number> = {}
  const curve: { sr: number; v: number }[] = []
  for (let i = 0; i < board.players.length; i++) {
    const p = board.players[i]
    const v = boardValue(p, o)
    valueById[p.player_id] = v
    const sr = searchRankById[p.player_id]
    if (typeof sr === 'number') curve.push({ sr, v })
  }
  curve.sort((a, b) => a.sr - b.sr)
  // Collapse duplicate search_ranks (Sleeper ties) keeping the higher value.
  const points: { sr: number; v: number }[] = []
  for (let i = 0; i < curve.length; i++) {
    const last = points[points.length - 1]
    if (last && last.sr === curve[i].sr) {
      last.v = Math.max(last.v, curve[i].v)
    } else {
      points.push({ sr: curve[i].sr, v: curve[i].v })
    }
  }

  const discount = board.rules.offBoardDiscount

  return {
    valueForBoardPlayer(playerId: string): number | null {
      const v = valueById[playerId]
      return typeof v === 'number' ? v : null
    },
    valueForOffBoard(searchRank: number): number {
      if (points.length === 0) return 0
      if (searchRank <= points[0].sr) return points[0].v * discount
      const last = points[points.length - 1]
      if (searchRank >= last.sr) {
        // Beyond the board: keep decaying gently so deep players still order
        // by ADP instead of flat-lining.
        const perStep = 0.15
        return Math.max(0, (last.v - perStep * (searchRank - last.sr)) * discount)
      }
      for (let i = 1; i < points.length; i++) {
        if (searchRank <= points[i].sr) {
          const a = points[i - 1]
          const b = points[i]
          const t = (searchRank - a.sr) / (b.sr - a.sr)
          return (a.v + (b.v - a.v) * t) * discount
        }
      }
      return last.v * discount
    },
  }
}
