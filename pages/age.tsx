import React, { useEffect, useState } from 'react'
import { convertUser } from '../helpers/convertUser'
import { getAverageAgeOfSquad } from '../helpers/getAverageAgeOfSquad'
import { Flex, HStack, VStack, Text, Divider, Spinner, Button } from '@chakra-ui/react'
import { useSelector } from 'react-redux'
import {
  selectCurrentLeagueId,
  selectLeagueDetails,
  selectLeagueName,
  selectLeagueSeason,
} from '../redux/leagueDetailsSlice'
import { useRouter } from 'next/router'
import TradeOwnerHeading from '../components/trades/TradeOwnerHeading'

const Age = () => {
  const router = useRouter()
  const leagueId = useSelector(selectCurrentLeagueId)
  const leagueName = useSelector(selectLeagueName)
  const leagueSeason = useSelector(selectLeagueSeason)
  const [users, setUsers] = useState<Array<any>>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [allAvgArray, setAllAvgArray] = useState<Array<any>>([])
  const [sortLabel, setSortLabel] = useState<string>('Oldest')

  const getLeagueIds = (leagueId: string) => {
    setLoading(true)
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
    const getAllAverageAges = async (leagueId: string) => {
      setLoading(true)
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
        .then((res) => res.json())
        .then((teams) =>
          teams.map((team: any) => {
            return {
              name: users.find((user) => user.value === team.owner_id).label,
              averageAge: getAverageAgeOfSquad(team.players),
            }
          })
        )
        .then((avgAgeArray) => {
          setAllAvgArray(avgAgeArray.sort((teamA: any, teamB: any) => teamA.averageAge - teamB.averageAge))
          setLoading(false)
        })
        .catch((e) => {
          setLoading(false)
          console.error(e)
        })
    }
    if (users.length > 0) {
      getAllAverageAges(leagueId)
    }
  }, [users, leagueId])

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
      {allAvgArray.length > 0 && (
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
          <HStack w={'80%'} justify={'space-between'} style={{ margin: 0 }} pt={4} align={'flex-end'}>
            <Text fontSize={'sm'} fontWeight={'bold'}>
              Name
            </Text>
            <VStack w={'33%'}>
              <Button
                size={'xs'}
                onClick={() => {
                  if (allAvgArray[0].averageAge > allAvgArray[3].averageAge) {
                    const lowestArray = [...allAvgArray]
                    lowestArray.sort((teamA: any, teamB: any) => teamA.averageAge - teamB.averageAge)
                    setAllAvgArray(lowestArray)
                    setSortLabel('Oldest')
                  } else {
                    const highestArray = [...allAvgArray]
                    highestArray.sort((teamA: any, teamB: any) => teamB.averageAge - teamA.averageAge)
                    setAllAvgArray(highestArray)
                    setSortLabel('Youngest')
                  }
                }}>
                Sort by: {sortLabel}
              </Button>
              <Text fontSize={'sm'} fontWeight={'bold'}>
                Squad Avg Age
              </Text>
            </VStack>
          </HStack>
          <Divider borderColor={'secondary'} pt={2} w={'80%'} style={{ margin: 0 }} />

          {allAvgArray.map((team) => (
            <HStack key={team.name} rounded={'lg'} w={'full'} px={10} justify={'center'}>
              <Flex w={'full'}>
                <TradeOwnerHeading teamOwner={team.name} />
              </Flex>
              <Text fontWeight={'600'} color={'quinary'} fontSize={'sm'}>
                {team.averageAge}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </Flex>
  )
}

export default Age
