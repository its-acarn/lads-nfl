import { findNFLPlayerWithId } from './findNFLPlayerWithId'

export const getAverageAgeOfSquad = (playerIds: Array<string>) => {
  const players = playerIds.map((playerId: string) => findNFLPlayerWithId(Number(playerId)))
  const filteredPlayers = players.filter((player: any) => player!!)
  const ageSum = filteredPlayers.reduce((sumOfAge: any, player: any) => sumOfAge + player.age, 0)
  const numberOfPlayers = filteredPlayers.length

  const averageAge = ageSum / numberOfPlayers
  return +averageAge.toFixed(2)
}
