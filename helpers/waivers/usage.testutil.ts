// Test helper: a PlayerUsage with neutral defaults, overridable per test.

import { PlayerUsage } from './types'

export function usageOf(id: string, over: Partial<PlayerUsage> = {}): PlayerUsage {
  return {
    playerId: id,
    team: 'NO',
    window: { snap: 0.5, target: 0.1, carry: 0.1, airYards: 0.1 },
    prior: { snap: 0.5, target: 0.1, carry: 0.1, airYards: 0.1 },
    lastGameSnap: 0.5,
    gamesInWindow: 3,
    playedOfLastThreeTeamGames: 3,
    playedLastTeamGame: true,
    rzOppsPerGame: 0.5,
    ppg: 8,
    rushAttPerGame: 0,
    rushYdPerGame: 0,
    passAttPerGame: 0,
    passRzAttPerGame: 0,
    ...over,
  }
}
