import React, { useEffect, useState } from 'react'
import { convertUser } from '../helpers/convertUser'
import { getAverageAgeOfSquad } from '../helpers/getAverageAgeOfSquad'
import { Flex, HStack, VStack, Text, Heading } from '@chakra-ui/react'
import { useSelector } from 'react-redux'
import { selectCurrentLeagueId } from '../redux/leagueDetailsSlice'
import { useRouter } from 'next/router'
import { dynastyLeagueId2023 } from '../config/config'

const Age = () => {
  const [users, setUsers] = useState<Array<any>>([])
  const [allAvgArray, setAllAvgArray] = useState<Array<any>>([])
  // const leagueId = useSelector(selectCurrentLeagueId)
  const leagueId = dynastyLeagueId2023
  const router = useRouter()

  const getAllAverageAges = (leagueId: string) => {
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
      .then((avgAgeArray) =>
        setAllAvgArray(avgAgeArray.sort((teamA: any, teamB: any) => teamA.averageAge - teamB.averageAge))
      )
      .catch((e) => console.error(e))
  }

  const getLeagueIds = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      .then((res) => res.json())
      .then((result) => result.map((user: any) => convertUser(user)))
      .then((displayNames) => setUsers(displayNames))
      .catch((e) => console.error(e))
  }

  useEffect(() => {
    if (users.length > 0) {
      getAllAverageAges(leagueId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])

  useEffect(() => {
    getLeagueIds(leagueId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!leagueId) {
    router.push('/')
  }

  return (
    <Flex minH={'100vh'} bg={'primary'}>
      {allAvgArray.length > 0 && (
        <VStack flex={1} align={'center'}>
          <Heading size={'sm'} color={'quinary'}>
            Average ages
          </Heading>
          {allAvgArray.map((team, i) => {
            return (
              <HStack key={i} bg={'quinary'} rounded={'lg'} w={'60%'} justify={'center'}>
                <Text fontWeight={500} color={'primary'}>
                  {team.name} / {team.averageAge}
                </Text>
              </HStack>
            )
          })}
        </VStack>
      )}
    </Flex>
  )
}

export default Age
