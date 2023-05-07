import { LeagueDetails } from './../types/LeagueDetail';
async function callLeagueDetails(leagueId: string, array: LeagueDetails[]) {
  await fetch(`https://api.sleeper.app/v1/league/${leagueId}`)
    .then(res => res.json())
    .then(async (data) => {
      const obj: LeagueDetails = { name: data.name, season: data.season, leagueId: data.league_id, numOfTeams: data.total_rosters, status: data.status, draftId: data.draft_id }

      array.push(obj)
      if (data.previous_league_id) {
        await callLeagueDetails(data.previous_league_id, array)
      }
      else {
        return array
      }
    })

}

export async function getAllPreviousLeagueDetails(leagueId: string) {
  const array: LeagueDetails[] = []

  await callLeagueDetails(leagueId, array)

  return array
}
