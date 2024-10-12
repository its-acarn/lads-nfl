import { useEffect, useState } from 'react'
import { getStandings, RosterStanding } from '../getStandings'

const useStandings = (seasonMatchups: []) => {
  const [standings, setStandings] = useState<RosterStanding[]>([])

  useEffect(() => {
    if (seasonMatchups) {
      const standings = getStandings(seasonMatchups)
      setStandings(standings)
    }
  }, [seasonMatchups])

  return standings
}

export default useStandings
