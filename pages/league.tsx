import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Badge, Button, HStack, Spinner, Tag, TagLabel, Text, VStack } from '@chakra-ui/react'
import router from 'next/router'
import { selectLeagueDetails, selectRosters } from '../redux/leagueDetailsSlice'
import { getSeasonMatchupsByRosterId } from '../helpers/getSeasonMatchupsByRosterId'
import { getTotalSeasonPointsByPosition } from '../helpers/getTotalSeasonPointsByPosition'
import GridExample from '../components/league/table'
import { getStarterPosPoints } from '../helpers/getStarterPosPoints'
import { Position } from '../types/Position'
import useStartup from '../helpers/hooks/useStartup'

const League = () => {
  const { startupLoading } = useStartup()
  const leagueDetails = useSelector(selectLeagueDetails)
  const rosters = useSelector(selectRosters)
  const [loading, setLoading] = useState<boolean>(true)
  const [seasonMatchups, setSeasonMatchups] = useState<any>(null)
  const [kPointsArray, setKPointsArray] = useState<any>([])
  const [defPointsArray, setDefPointsArray] = useState<any>([])
  const [tableRows, setTableRows] = useState<any>([])

  useEffect(() => {
    if (startupLoading) return
    if (leagueDetails.length === 0) {
      router.push('/')
    } else {
      const seasonMatchupsItem = localStorage.getItem('seasonMatchups')
      if (seasonMatchupsItem) {
        setSeasonMatchups(JSON.parse(seasonMatchupsItem))
      } else {
        router.push('/')
      }
    }
  }, [startupLoading])

  useEffect(() => {
    if (seasonMatchups) {
      setKPointsArray([])
      for (let i = 1; i <= 12; i++) {
        const sm = getSeasonMatchupsByRosterId(seasonMatchups, i)
        const tp = getTotalSeasonPointsByPosition(sm, Position.K)
        const managerName = rosters.find((r: any) => r.roster_id === i).display_name
        const teamName = rosters.find((r: any) => r.roster_id === i).team_name
        const obj = { managerName, teamName, kickerPoints: tp }

        setKPointsArray((pointsArray: any[]) => [...pointsArray, obj])
      }

      setDefPointsArray([])
      for (let i = 1; i <= 12; i++) {
        const sm = getSeasonMatchupsByRosterId(seasonMatchups, i)
        const tp = getTotalSeasonPointsByPosition(sm, Position.DEF)
        const managerName = rosters.find((r: any) => r.roster_id === i).display_name
        const teamName = rosters.find((r: any) => r.roster_id === i).team_name
        const obj = { managerName, teamName, defPoints: tp }

        setDefPointsArray((pointsArray: any[]) => [...pointsArray, obj])
      }

      getStarterPosPoints(seasonMatchups)
    }
    setLoading(false)
  }, [seasonMatchups])

  useEffect(() => {
    if (kPointsArray.length === 12) {
      const rows: any[] = []
      kPointsArray.map((tp: any) => {
        const obj = {
          managerName: tp.managerName,
          teamName: tp.teamName,
          kickerPoints: tp.kickerPoints,
        }
        rows.push(obj)
      })
      setTableRows(rows)
    }
  }, [kPointsArray])

  useEffect(() => {
    if (defPointsArray.length === 12) {
      const rows: any[] = kPointsArray
      kPointsArray.map((tp: any, i: number) => {
        tp.defPoints = defPointsArray[i].defPoints
      })
      setTableRows(rows)
    }
  }, [defPointsArray])

  if (tableRows.length === 0) {
    return (
      <VStack flex={1} bg={'primary'} justify={'center'} align={'center'} minH={'90vh'}>
        <Spinner size={'xl'} color={'quinary'} />
        <Text color={'quinary'}>Loading...</Text>
      </VStack>
    )
  }

  return (
    <VStack bg={'primary'} flex={1} minH={'100vh'} p={2} spacing={0}>
      <HStack
        w={'100%'}
        py={2}
        overflowX={'scroll'}
        sx={{
          '::-webkit-scrollbar': {
            display: 'none',
          },
        }}>
        <HStack>
          <Button onClick={() => router.push('/')} colorScheme={'green'} rounded="full" size={'xs'}>
            No Kicker Standings
          </Button>
          <Button onClick={() => router.push('/')} colorScheme={'green'} rounded="full" size={'xs'}>
            No DEF Standings
          </Button>
          <Button onClick={() => router.push('/')} colorScheme={'green'} rounded="full" size={'xs'}>
            Best Kicker Pickers
          </Button>
          <Button onClick={() => router.push('/')} colorScheme={'green'} rounded="full" size={'xs'}>
            Best DEF
          </Button>
        </HStack>
      </HStack>
      <GridExample tableRowData={tableRows} />
    </VStack>
  )
}

export default League
