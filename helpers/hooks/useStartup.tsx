import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ladsLeagueId2024 } from '../../config/config'
import { addLeagueDetails, addRosters } from '../../redux/leagueDetailsSlice'
import { addState } from '../../redux/nflStateSlice'
import { addLastFetchedWeek, selectLastFetchedWeek } from '../../redux/statusSlice'
import { NFLState } from '../../types/NFLState'
import { getAllPreviousLeagueDetails } from '../api/getAllPreviousLeagueDetails'
import { getNFLState } from '../api/getNFLWeek'
import { getSeasonMatchups } from '../api/getSeasonMatchups'
import { getRosters, getUsers } from '../api/getUsers'

function useStartup() {
  const dispatch = useDispatch()
  const lastFetchedWeek = useSelector(selectLastFetchedWeek)

  const [startupLoading, setStartupLoading] = useState(true)

  useEffect(() => {
    getNFLState().then((nflState: NFLState) => {
      dispatch(addState(nflState))

      if (nflState.week - 1 !== lastFetchedWeek) {
        Promise.all([
          getUsers(ladsLeagueId2024),
          getRosters(ladsLeagueId2024),
          getAllPreviousLeagueDetails(ladsLeagueId2024),
          getSeasonMatchups(ladsLeagueId2024),
        ]).then((res) => {
          const users = res[0]
          const rosters = res[1]
          const leagueDetails = res[2]
          const seasonMatchups = res[3]

          const mergedArray = rosters.map((roster: any) => {
            const user = users.find((user: any) => user.user_id === roster.owner_id)
            return { ...roster, display_name: user.display_name, team_name: user.metadata.team_name }
          })

          dispatch(addLeagueDetails(leagueDetails))
          dispatch(addRosters(mergedArray))
          localStorage.setItem('seasonMatchups', JSON.stringify(seasonMatchups))
          dispatch(addLastFetchedWeek(nflState.week - 1))

          setStartupLoading(false)
        })
      } else {
        setStartupLoading(false)
      }
    })
  }, [])

  return { startupLoading }
}

export default useStartup
