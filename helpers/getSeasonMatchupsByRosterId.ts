import { getSeasonMatchups } from './api/getSeasonMatchups'

export function getSeasonMatchupsByRosterId(seasonMatchups: any, rosterId: number) {
  let rosterMatchups: any = []
  seasonMatchups.forEach((weekMatchups: any) => {
    rosterMatchups.push(getMatchupForRosterId(weekMatchups, rosterId))
  })

  return rosterMatchups
}

function getMatchupForRosterId(weekMatchups: any, rosterId: number) {
  return weekMatchups.filter((matchup: any) => matchup.roster_id === rosterId)
}
