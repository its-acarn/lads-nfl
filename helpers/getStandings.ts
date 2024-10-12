import { Position } from '../types/Position'
import { findNFLPlayerWithId } from './findNFLPlayerWithId'
import store from '../redux/store'

export type RosterStanding = {
  roster_id: number
  totalPoints: {
    total: number
    kicker: number
    def: number
  }
  weeklyPoints: WeeklyPoints[]
  noKickers: WinsLossesTies
  noDefs: WinsLossesTies
  noKickersOrDefs: WinsLossesTies
  wins: number
  losses: number
  ties: number
  rank: number
}

type WinsLossesTies = {
  wins: number
  losses: number
  ties: number
  rank: number
}

type WeeklyPoints = {
  total: number
  kicker: number
  def: number
}

const numOfLeagueTeams = 12

export function getStandings(seasonMatchups: any) {
  // const seasonMatchups = await getSeasonMatchups(ladsLeagueId2024)
  // loop weeks
  const standings: RosterStanding[] = []
  for (let i = 1; i <= numOfLeagueTeams; i++) {
    standings.push({
      roster_id: i,
      totalPoints: {
        total: 0,
        kicker: 0,
        def: 0,
      },
      weeklyPoints: [],
      noKickers: {
        wins: 0,
        losses: 0,
        ties: 0,
        rank: 0,
      },
      noDefs: {
        wins: 0,
        losses: 0,
        ties: 0,
        rank: 0,
      },
      noKickersOrDefs: {
        wins: 0,
        losses: 0,
        ties: 0,
        rank: 0,
      },
      wins: 0,
      losses: 0,
      ties: 0,
      rank: 0,
    })
  }

  seasonMatchups.forEach((week: any, weekIndex: number) => {
    const oneBasedWeekIndex = weekIndex + 1
    if (oneBasedWeekIndex > store.getState().nflState.week) {
      return
    }

    week.forEach((teamStats: any, i: number) => {
      const standing = standings[i]
      // set empty weekly points object
      standing.weeklyPoints.push({
        total: 0,
        kicker: 0,
        def: 0,
      })
      // update weekly total points
      standing.weeklyPoints[weekIndex].total = teamStats.points
      // update total points for season
      standing.totalPoints.total += teamStats.points
      // loop through starters to find kicker and def points that week
      teamStats.starters.forEach((starter: any, j: number) => {
        const playerDetails = findNFLPlayerWithId(starter)
        const playerPos = playerDetails?.position

        if (playerPos === Position.K) {
          // update weekly kicker points
          standing.weeklyPoints[weekIndex].kicker = teamStats.starters_points[j]
          // update total kicker points for season
          standing.totalPoints.kicker += teamStats.starters_points[j]
        }
        if (playerPos === Position.DEF) {
          // update weekly def points
          standing.weeklyPoints[weekIndex].def = teamStats.starters_points[j]
          // update total def points for season
          standing.totalPoints.def += teamStats.starters_points[j]
        }
      })
    })
  })

  const getStanding = (rosterId: number) => {
    return standings.find((standing) => standing.roster_id === rosterId)
  }

  seasonMatchups.forEach((week: any, weekIndex: number) => {
    const oneBasedWeekIndex = weekIndex + 1
    if (oneBasedWeekIndex > store.getState().nflState.week) {
      return
    }

    week.forEach((teamStats: any, i: number) => {
      const teamStanding = getStanding(teamStats.roster_id)
      const opponent = week.find(
        (team: any) => team.matchup_id === teamStats.matchup_id && team.roster_id !== teamStats.roster_id
      )
      const opponentStanding = getStanding(opponent.roster_id)

      const teamPointsMinusKicker = teamStats.points - teamStanding!.weeklyPoints[weekIndex].kicker
      const opponentPointsMinusKicker = opponent.points - opponentStanding!.weeklyPoints[weekIndex].kicker

      const determineNoKickerWinner = (teamPoints: number, opponentPoints: number) => {
        if (teamPoints > opponentPoints) {
          teamStanding!.noKickers.wins++
        }
        if (teamPoints < opponentPoints) {
          teamStanding!.noKickers.losses++
        }
      }

      determineNoKickerWinner(teamPointsMinusKicker, opponentPointsMinusKicker)

      const teamPointsMinusDef = teamStats.points - teamStanding!.weeklyPoints[weekIndex].def
      const opponentPointsMinusDef = opponent.points - opponentStanding!.weeklyPoints[weekIndex].def

      const determineNoDefsWinner = (teamPoints: number, opponentPoints: number) => {
        if (teamPoints > opponentPoints) {
          teamStanding!.noDefs.wins++
        }
        if (teamPoints < opponentPoints) {
          teamStanding!.noDefs.losses++
        }
      }

      determineNoDefsWinner(teamPointsMinusDef, opponentPointsMinusDef)

      const teamPointsMinusKickerAndDef =
        teamStats.points - teamStanding!.weeklyPoints[weekIndex].kicker - teamStanding!.weeklyPoints[weekIndex].def
      const opponentPointsMinusKickerAndDef =
        opponent.points -
        opponentStanding!.weeklyPoints[weekIndex].kicker -
        opponentStanding!.weeklyPoints[weekIndex].def

      const determineNoKickerOrDefWinner = (teamPoints: number, opponentPoints: number) => {
        if (teamPoints > opponentPoints) {
          teamStanding!.noKickersOrDefs.wins++
        }
        if (teamPoints < opponentPoints) {
          teamStanding!.noKickersOrDefs.losses++
        }
      }

      determineNoKickerOrDefWinner(teamPointsMinusKickerAndDef, opponentPointsMinusKickerAndDef)

      const teamPoints = teamStats.points
      const opponentPoints = opponent.points

      const determineWinner = (teamPoints: number, opponentPoints: number) => {
        if (teamPoints > opponentPoints) {
          teamStanding!.wins++
        }
        if (teamPoints < opponentPoints) {
          teamStanding!.losses++
        }
      }

      determineWinner(teamPoints, opponentPoints)
    })
  })

  standings.sort((a, b) => {
    if (a.noDefs.wins !== b.noDefs.wins) {
      return b.noDefs.wins - a.noDefs.wins
    }

    return b.totalPoints.total - b.totalPoints.def - (a.totalPoints.total - a.totalPoints.def)
  })

  standings.forEach((standing, i) => {
    standing.noDefs.rank = i + 1
  })

  standings.sort((a, b) => {
    if (a.noKickersOrDefs.wins !== b.noKickersOrDefs.wins) {
      return b.noKickersOrDefs.wins - a.noKickersOrDefs.wins
    }

    return (
      b.totalPoints.total -
      b.totalPoints.kicker -
      b.totalPoints.def -
      (a.totalPoints.total - a.totalPoints.kicker - a.totalPoints.def)
    )
  })

  standings.forEach((standing, i) => {
    standing.noKickersOrDefs.rank = i + 1
  })

  standings.sort((a, b) => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins
    }

    return b.totalPoints.total - a.totalPoints.total
  })

  standings.forEach((standing, i) => {
    standing.rank = i + 1
  })

  standings.sort((a, b) => {
    if (a.noKickers.wins !== b.noKickers.wins) {
      return b.noKickers.wins - a.noKickers.wins
    }

    return b.totalPoints.total - b.totalPoints.kicker - (a.totalPoints.total - a.totalPoints.kicker)
  })

  standings.forEach((standing, i) => {
    standing.noKickers.rank = i + 1
  })

  return standings
}
