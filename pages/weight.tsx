import { Flex, HStack, Text, VStack } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { dynastyLeagueId2023 } from '../config/config'
import { convertUser } from '../helpers/convertUser'
import { getTotalWeightOfSquad } from '../helpers/getTotalWeightOfSquad'
import { selectCurrentLeagueId } from '../redux/leagueDetailsSlice'

function Weight() {
  const [weightArray, setWeightArray] = useState<Array<any>>([])
  const [users, setUsers] = useState<Array<any>>([])
  // const leagueId = useSelector(selectCurrentLeagueId)
  const leagueId = dynastyLeagueId2023
  const router = useRouter()


  const getLeagueIds = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      .then((res) => res.json())
      .then((result) => result.map((user: any) => convertUser(user)))
      .then((displayNames) => setUsers(displayNames))
      .catch(e => console.error(e))
  }

  const getTeamTotalWeights = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      .then((res) => res.json())
      .then((teams) => teams.map((team: any) => {
        return {
          name: users.find(user => user.value === team.owner_id).label,
          details: getTotalWeightOfSquad(team.players)
        }
      })).then((weightArray) => setWeightArray(weightArray.sort((teamA: any, teamB: any) => teamB.details.totalWeight - teamA.details.totalWeight)))
  }

  useEffect(() => {
    if (users.length > 0) {
      getTeamTotalWeights(leagueId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])


  useEffect(() => {
    getLeagueIds(leagueId)
  }, [])

  if (!leagueId) {
    router.push('/')
  }

  return (
    <Flex minH={'100vh'} bg={'primary'} flex={1}>
      {weightArray.length > 0 &&
        <VStack color={'white'} flex={1} justify={'center'}>
          {weightArray.map((team, i) => {
            return (
              <VStack key={i}>
                <Text fontWeight={700} fontSize={'md'}>{team.name}</Text>
                <HStack>
                  <Text fontSize={'sm'}>Total: {team.details.totalWeight}lbs / Avg: {team.details.avgWeight}lbs</Text>
                </HStack>
              </VStack>
            )
          })}
        </VStack>}
    </Flex>
  )
}

export default Weight