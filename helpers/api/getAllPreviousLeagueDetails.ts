import { LeagueDetails } from '../../types/LeagueDetail'
async function callLeagueDetails(leagueId: string, array: LeagueDetails[]) {
  return await fetch(`https://api.sleeper.app/v1/league/${leagueId}`)
    .then((res) => res.json())
    .then(async (data) => {
      if (!data) {
        throw Error('No data')
      }
      const obj: LeagueDetails = {
        name: data.name,
        season: data.season,
        leagueId: data.league_id,
        numOfTeams: data.total_rosters,
        status: data.status,
        draftId: data.draft_id,
      }

      array.push(obj)
      if (data.previous_league_id && data.previous_league_id !== '0') {
        await callLeagueDetails(data.previous_league_id, array)
      } else {
        return array
      }
    })
    .catch((err) => {
      throw Error(err)
    })
}

export async function getAllPreviousLeagueDetails(leagueId: string) {
  const array: LeagueDetails[] = []

  return await callLeagueDetails(leagueId, array)
    .then(() => array)
    .catch((err) => {
      throw Error(err)
    })
}
