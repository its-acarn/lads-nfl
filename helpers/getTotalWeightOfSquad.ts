import { findNFLPlayerWithId } from './findNFLPlayerWithId';

export const getTotalWeightOfSquad = (playerIds: Array<string>) => {
  const players = playerIds.map((playerId: string) => findNFLPlayerWithId(Number(playerId)))
  const filteredPlayers = players.filter((player: any) => player!!)
  const totalWeight = filteredPlayers.reduce((sumOfWeight: any, player: any) => sumOfWeight + parseInt(player.weight), 0)
  const numberOfPlayers = filteredPlayers.length
  const avgWeight = totalWeight / numberOfPlayers

  return { totalWeight: totalWeight, avgWeight: avgWeight.toFixed(2) }
}