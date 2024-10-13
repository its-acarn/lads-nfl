import { Position } from '../types/Position'
import { findNFLPlayerWithId } from './findNFLPlayerWithId'

export function getTotalSeasonPointsByPosition(seasonMatchups: any, position: Position) {
  let total = 0
  for (const matchup of seasonMatchups) {
    if (matchup[0].points === 0) {
      return total
    }

    matchup[0].starters.forEach((playerId: number, i: number) => {
      const playerDetails = findNFLPlayerWithId(playerId)
      const playerPos = playerDetails.position
      if (playerPos === position) {
        total += matchup[0].starters_points[i]
      }
    })
  }
  return total
}
