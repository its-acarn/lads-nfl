import { NFLPlayer } from './NFLPlayer'
export type Trade = {
  lastUpdated: number
  season: string
  week: number
  team1Adds: NFLPlayer[] | null
  team2Adds: NFLPlayer[] | null
  team1DraftPicks: any[]
  team2DraftPicks: any[]
  team1Owner: string
  team1Waiver: any[]
  team2Owner: string
  team2Waiver: any[]
}
