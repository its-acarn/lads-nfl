import { LeagueDetails } from './../types/LeagueDetail';
import store from "../redux/store";
import { findNFLPlayerWithId } from "./findNFLPlayerWithId";


function sortTrade(trade: any, season: string, week: number) {
  const state = store.getState()
  const rosters = state.leagueDetails.rosters

  const team1Roster = rosters.find(r => r.roster_id === trade.roster_ids[0])
  const team2Roster = rosters.find(r => r.roster_id === trade.roster_ids[1])

  const adds = trade.adds
  let team1Adds = null
  let team2Adds = null

  if (adds) {
    const asAddsArray = Object.entries(adds);

    const team1AddsFilter = asAddsArray.filter(([key, value]) => value === trade.roster_ids[0]);
    team1Adds = team1AddsFilter.map(([key, value]) => findNFLPlayerWithId(Number(key)))
    const team2AddsFilter = asAddsArray.filter(([key, value]) => value === trade.roster_ids[1]);
    team2Adds = team2AddsFilter.map(([key, value]) => findNFLPlayerWithId(Number(key)))
  }

  const team1DraftPicks = trade.draft_picks.filter((dp: any) => dp.owner_id === team1Roster.roster_id)
  const team2DraftPicks = trade.draft_picks.filter((dp: any) => dp.owner_id === team2Roster.roster_id)

  const waiverBudget = trade.waiver_budget
  let team1Waiver: number[] = []
  let team2Waiver: number[] = []

  if (waiverBudget) {
    waiverBudget.forEach((wb: any) => {
      if (wb.receiver === team1Roster.roster_id) { team1Waiver.push(wb.amount) }
      if (wb.receiver === team2Roster.roster_id) { team2Waiver.push(wb.amount) }
    })
  }

  const tradeObject = {
    season: season,
    week: week,
    lastUpdated: trade.status_updated,
    team1Owner: team1Roster.display_name,
    team2Owner: team2Roster.display_name,
    team1Adds: team1Adds,
    team2Adds: team2Adds,
    team1DraftPicks: team1DraftPicks,
    team2DraftPicks: team2DraftPicks,
    team1Waiver: team1Waiver,
    team2Waiver: team2Waiver,
  }

  return tradeObject
}

export async function getAllTrades() {
  const state = store.getState()
  const array: any[] = []

  await Promise.all(state.leagueDetails.leagueDetails.map(async (league: LeagueDetails) => {
    for (let i = 1; i <= 17; i++) {
      await fetch(`https://api.sleeper.app/v1/league/${league.leagueId}/transactions/${i}`)
        .then(res => res.json())
        .then(data => {
          const tradesArr = data.filter((d: any) => d.type === 'trade')
          tradesArr.map((trade: any) => array.push(sortTrade(trade, league.season, i)))
        })
    }
  }))

  return array.sort((a, b) => (a.lastUpdated > b.lastUpdated) ? -1 : ((b.lastUpdated > a.lastUpdated) ? 1 : 0))
}