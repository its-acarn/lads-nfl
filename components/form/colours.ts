// Shared colouring for the /form tables: green = good for you, red = bad.
import { MatchupTier } from '../../helpers/form/types'

export const TIER_SCHEME: Record<MatchupTier, string> = { soft: 'green', neutral: 'gray', tough: 'red' }

// Rank 1 is "best" for the reader (most points allowed, strongest team).
export function rankScheme(rank: number, of: number): string {
  if (rank <= Math.round(of / 3)) return 'green'
  if (rank > of - Math.round(of / 3)) return 'red'
  return 'gray'
}
