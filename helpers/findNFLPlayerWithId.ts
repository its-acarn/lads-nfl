import { NFLPlayer } from '../types/NFLPlayer';
import NFLPlayerData from '../config/nflPlayerData.json'

export const findNFLPlayerWithId = (playerId: number) => {
  // @ts-ignore
  const player: NFLPlayer = NFLPlayerData[playerId]
  return player
}