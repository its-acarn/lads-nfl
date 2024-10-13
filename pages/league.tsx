import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Badge, Button, Heading, HStack, Spinner, Tag, TagLabel, Text, VStack } from '@chakra-ui/react'
import router from 'next/router'
import { selectLeagueDetails, selectRosters } from '../redux/leagueDetailsSlice'
import { getSeasonMatchupsByRosterId } from '../helpers/getSeasonMatchupsByRosterId'
import { getTotalSeasonPointsByPosition } from '../helpers/getTotalSeasonPointsByPosition'
import GridExample from '../components/league/table'
import { getStandings, RosterStanding } from '../helpers/getStandings'
import { Position } from '../types/Position'
import useStartup from '../helpers/hooks/useStartup'
import useStandings from '../helpers/hooks/useStandings'
import { Bungee_Shade } from 'next/font/google'
import { bungeeShade } from './_app'
import { selectLastFetchedWeek } from '../redux/statusSlice'

const NoKickerCell = (props: any) => {
  const rosters = useSelector(selectRosters)
  const rosterId = rosters.find((r: any) => r.team_name === props.data.teamName).roster_id
  const standing: RosterStanding = props.context.find((r: any) => r.roster_id === rosterId)
  const noKickersRankDifference = standing.rank - standing.noKickers.rank

  return (
    <HStack justify={'center'}>
      <Text size="md" color={'white'}>
        {props.value}
      </Text>
      {noKickersRankDifference !== 0 && (
        <Text size={'xs'} color={noKickersRankDifference > 0 ? 'green' : 'red'}>
          {noKickersRankDifference > 0 ? `▲${noKickersRankDifference}` : `▼${noKickersRankDifference * -1}`}
        </Text>
      )}
    </HStack>
  )
}

const KickersCell = (props: any) => {
  const rosters = useSelector(selectRosters)
  const rosterId = rosters.find((r: any) => r.team_name === props.data.teamName).roster_id
  const standing: RosterStanding = props.context.find((r: any) => r.roster_id === rosterId)

  return (
    <HStack justify={'center'}>
      <Text size="md" color={'white'}>
        {props.value}
      </Text>
      <p style={{ fontSize: '9px', marginLeft: '4px', color: 'grey' }}>(#{standing.rank})</p>
    </HStack>
  )
}

const League = () => {
  const { startupLoading } = useStartup()
  const leagueDetails = useSelector(selectLeagueDetails)
  const lastFetchedWeek = useSelector(selectLastFetchedWeek)
  const rosters = useSelector(selectRosters)
  const [seasonMatchups, setSeasonMatchups] = useState<any>(null)
  const standings = useStandings(seasonMatchups)
  const [colData, setColData] = useState<any>([])
  const [tableRowData, setTableRowData] = useState<any>([])

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
    if (standings) {
      setTableRowData([])

      standings.map((s: RosterStanding, i) => {
        const teamName = rosters.find((r: any) => r.roster_id === s.roster_id).team_name
        const record = `${s.wins}-${s.losses}`
        const noKickerRecord = `${s.noKickers.wins}-${s.noKickers.losses}`
        const noDefRecord = `${s.noDefs.wins}-${s.noDefs.losses}`
        const noKickerOrDefRecord = `${s.noKickersOrDefs.wins}-${s.noKickersOrDefs.losses}`

        const tableRow = {
          rank: i + 1,
          teamName,
          record,
          noKickerRecord,
        }

        setTableRowData((tableRows: any[]) => [...tableRows, tableRow])
      })

      const colHeaders = [
        { headerName: '', field: 'rank', flex: 0.2 },
        {
          headerName: 'Team',
          field: 'teamName',
          flex: 1.6,
          wrapText: true,
          cellStyle: { textAlign: 'left', fontSize: '11px' },
          headerClass: 'left-aligned-group-header',
        },
        {
          headerName: 'Record',
          field: 'record',
          flex: 0.8,
          cellRenderer: KickersCell,
          cellStyle: { textAlign: 'center', fontSize: '11px' },
        },
        {
          headerName: 'No Kickers Record',
          field: 'noKickerRecord',
          flex: 0.8,
          cellRenderer: NoKickerCell,
          cellStyle: { textAlign: 'center', fontSize: '11px' },
        },
      ]

      setColData(colHeaders)

      // set col defs
      // set table row data
    }
  }, [standings])

  useEffect(() => {
    // if (seasonMatchups) {
    //   setKPointsArray([])
    //   for (let i = 1; i <= 12; i++) {
    //     const sm = getSeasonMatchupsByRosterId(seasonMatchups, i)
    //     const tp = getTotalSeasonPointsByPosition(sm, Position.K)
    //     const managerName = rosters.find((r: any) => r.roster_id === i).display_name
    //     const teamName = rosters.find((r: any) => r.roster_id === i).team_name
    //     const obj = { managerName, teamName, kickerPoints: tp }

    //     setKPointsArray((pointsArray: any[]) => [...pointsArray, obj])
    //   }

    //   setDefPointsArray([])
    //   for (let i = 1; i <= 12; i++) {
    //     const sm = getSeasonMatchupsByRosterId(seasonMatchups, i)
    //     const tp = getTotalSeasonPointsByPosition(sm, Position.DEF)
    //     const managerName = rosters.find((r: any) => r.roster_id === i).display_name
    //     const teamName = rosters.find((r: any) => r.roster_id === i).team_name
    //     const obj = { managerName, teamName, defPoints: tp }

    //     setDefPointsArray((pointsArray: any[]) => [...pointsArray, obj])
    //   }
    if (seasonMatchups) {
      const standings = getStandings(seasonMatchups)
    }
  }, [seasonMatchups])

  // useEffect(() => {
  //   if (kPointsArray.length === 12) {
  //     const rows: any[] = []
  //     kPointsArray.map((tp: any) => {
  //       const obj = {
  //         managerName: tp.managerName,
  //         teamName: tp.teamName,
  //         kickerPoints: tp.kickerPoints,
  //       }
  //       rows.push(obj)
  //     })
  //     setTableRows(rows)
  //   }
  // }, [kPointsArray])

  // useEffect(() => {
  //   if (defPointsArray.length === 12) {
  //     const rows: any[] = kPointsArray
  //     kPointsArray.map((tp: any, i: number) => {
  //       tp.defPoints = defPointsArray[i].defPoints
  //     })
  //     setTableRows(rows)
  //   }
  // }, [defPointsArray])

  if (tableRowData.length === 0) {
    return (
      <VStack flex={1} bg={'primary'} justify={'center'} align={'center'} minH={'90vh'}>
        <Spinner size={'xl'} color={'quinary'} />
        <Text color={'quinary'}>Loading...</Text>
      </VStack>
    )
  }

  return (
    <VStack bg={'primary'} flex={1} minH={'100vh'} p={2} width={'100vw'} align={'flex-start'}>
      <VStack pl={8} w={'100%'} pb={'2'} align={'flex-start'}>
        <Text fontSize={'32px'} pt={1} color={'white'} className={bungeeShade.className} textAlign={'left'}>
          No Kickers League
        </Text>
        <HStack w={'100%'} justify={'space-between'}>
          <Badge color={'black'} bg={'gold'} fontSize={'2xs'}>
            LadsLadsLads 2024
          </Badge>
        </HStack>
      </VStack>

      {/* <Text fontSize={'13px'} pb={'4'} color={'grey'} fontWeight={200} textAlign={'left'}>
        LadsLadsLads
      </Text> */}
      {/* <HStack
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
      </HStack> */}
      <GridExample tableData={{ cols: colData, rows: tableRowData, context: standings }} />
      <Text
        w={'100%'}
        justifySelf={'center'}
        my={2}
        fontSize={'9px'}
        color={'lightgrey'}
        fontWeight={200}
        textAlign={'center'}>
        Last updated: Week {lastFetchedWeek}
      </Text>
    </VStack>
  )
}

export default League
