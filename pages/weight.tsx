import { Button, Divider, Flex, HStack, Spinner, Text, VStack } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import TradeOwnerHeading from '../components/trades/TradeOwnerHeading'
import { dynastyLeagueId2023 } from '../config/config'
import { convertUser } from '../helpers/convertUser'
import { getTotalWeightOfSquad } from '../helpers/getTotalWeightOfSquad'
import { selectCurrentLeagueId, selectLeagueName, selectLeagueSeason } from '../redux/leagueDetailsSlice'

function Weight() {
  const router = useRouter()
  const leagueId = useSelector(selectCurrentLeagueId)
  const leagueName = useSelector(selectLeagueName)
  const leagueSeason = useSelector(selectLeagueSeason)
  const [users, setUsers] = useState<Array<any>>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [weightArray, setWeightArray] = useState<Array<any>>([])
  const [sortLabel, setSortLabel] = useState<string>('Lowest')
  const [sortLabelAvg, setSortLabelAvg] = useState<string>('Lowest')

  const getLeagueIds = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      .then((res) => res.json())
      .then((result) => result.map((user: any) => convertUser(user)))
      .then((displayNames) => setUsers(displayNames))
      .then(() => setLoading(false))
      .catch((e) => {
        setLoading(false)
        console.error(e)
      })
  }

  useEffect(() => {
    if (!leagueId) {
      router.push('/')
    }
  }, [leagueId, router])

  useEffect(() => {
    const getTeamTotalWeights = (leagueId: string) => {
      setLoading(true)
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
        .then((res) => res.json())
        .then((teams) =>
          teams.map((team: any) => {
            return {
              name: users.find((user) => user.value === team.owner_id).label,
              details: getTotalWeightOfSquad(team.players),
            }
          })
        )
        .then((weightArray) =>
          setWeightArray(
            weightArray.sort((teamA: any, teamB: any) => teamB.details.totalWeight - teamA.details.totalWeight)
          )
        )
        .then(() => setLoading(false))
        .catch((e) => {
          setLoading(false)
          console.error(e)
        })
    }

    if (users.length > 0) {
      getTeamTotalWeights(leagueId)
    }
  }, [leagueId, users])

  useEffect(() => {
    getLeagueIds(leagueId)
  }, [leagueId])

  if (loading) {
    return (
      <VStack flex={1} bg={'primary'} justify={'center'} align={'center'} minH={'90vh'}>
        <Spinner size={'xl'} color={'quinary'} />
        <Text color={'quinary'}>Calculating...</Text>
      </VStack>
    )
  }

  return (
    <Flex minH={'100vh'} bg={'primary'}>
      {weightArray.length > 0 && (
        <VStack flex={1} align={'center'}>
          <Text
            color={'quinary'}
            fontSize={'xl'}
            fontWeight={'bold'}
            maxW={'80%'}
            wordBreak={'break-all'}
            noOfLines={1}>
            {leagueSeason} {leagueName}
          </Text>
          <HStack w={'full'} px={10} pt={4} justify={'space-between'} style={{ margin: 0 }}>
            <Text fontSize={'sm'} fontWeight={'bold'} w={'40%'} pt={4} textAlign={'left'}>
              Name
            </Text>
            <VStack w={'25%'}>
              <Button
                size={'xs'}
                fontSize={'3xs'}
                onClick={() => {
                  if (weightArray[0].details.totalWeight > weightArray[3].details.totalWeight) {
                    const lowestArray = [...weightArray]
                    lowestArray.sort((teamA: any, teamB: any) => teamA.details.totalWeight - teamB.details.totalWeight)
                    setWeightArray(lowestArray)
                    setSortLabel('Highest')
                  } else {
                    const highestArray = [...weightArray]
                    highestArray.sort((teamA: any, teamB: any) => teamB.details.totalWeight - teamA.details.totalWeight)
                    setWeightArray(highestArray)
                    setSortLabel('Lowest')
                  }
                }}>
                Sort by: {sortLabel}
              </Button>
              <Text fontSize={'sm'} fontWeight={'bold'} textAlign={'center'}>
                Total
              </Text>
            </VStack>
            <VStack w={'25%'}>
              <Button
                size={'xs'}
                fontSize={'3xs'}
                onClick={() => {
                  if (weightArray[0].details.avgWeight > weightArray[3].details.avgWeight) {
                    const lowestArray = [...weightArray]
                    lowestArray.sort((teamA: any, teamB: any) => teamA.details.avgWeight - teamB.details.avgWeight)
                    setWeightArray(lowestArray)
                    setSortLabelAvg('Highest')
                  } else {
                    const highestArray = [...weightArray]
                    highestArray.sort((teamA: any, teamB: any) => teamB.details.avgWeight - teamA.details.avgWeight)
                    setWeightArray(highestArray)
                    setSortLabelAvg('Lowest')
                  }
                }}>
                Sort by: {sortLabelAvg}
              </Button>
              <Text fontSize={'sm'} fontWeight={'bold'} textAlign={'right'}>
                Avg
              </Text>
            </VStack>
          </HStack>
          <Divider borderColor={'secondary'} pt={2} w={'80%'} style={{ margin: 0 }} />
          <VStack color={'white'} w={'full'} justify={'center'}>
            {weightArray.map((team) => (
              <HStack key={team.name} rounded={'lg'} w={'full'} px={10} justify={'space-between'}>
                <Text fontWeight={'600'} color={'quinary'} fontSize={'sm'} w={'40%'} textAlign={'left'} noOfLines={1}>
                  {team.name}
                </Text>
                <Text fontWeight={'600'} color={'quinary'} fontSize={'xs'} w={'25%'} textAlign={'center'}>
                  {team.details.totalWeight}lbs
                </Text>
                <Text fontWeight={'600'} color={'quinary'} fontSize={'xs'} w={'25%'} textAlign={'right'}>
                  {team.details.avgWeight}lbs
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
      )}
    </Flex>
  )
}

export default Weight
