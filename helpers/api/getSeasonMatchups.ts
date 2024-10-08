import store from '../../redux/store'
import { LeagueDetails } from '../../types/LeagueDetail'

export async function getSeasonMatchups(id: string) {
  const promiseArray: any[] = []

  for (let i = 1; i <= 17; i++) {
    const promise = await fetch(`https://api.sleeper.app/v1/league/${id}/matchups/${i}`).then((res) => res.json())

    promiseArray.push(promise)
  }

  return await Promise.all(
    promiseArray
    // state.leagueDetails.leagueDetails.map(async (league: LeagueDetails) => {
    // for (let i = 1; i <= 17; i++) {
    //   fetch(
    //     `https://api.sleeper.app/v1/league/${state.leagueDetails.leagueDetails[0].leagueId}/matchups/${i}`
    //   ).then((res) => res.json())
    // .then((data) => {
    //   const tradesArr = data.filter((d: any) => d.type === 'trade')
    //   tradesArr.map((trade: any) => array.push(sortTrade(trade, league.season, i)))
    // })
    // }
    // })
  )

  // return array.sort((a, b) => (a.lastUpdated > b.lastUpdated ? -1 : b.lastUpdated > a.lastUpdated ? 1 : 0))
}
