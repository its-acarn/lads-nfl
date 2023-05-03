import { Flex, Text, VStack } from '@chakra-ui/react'
import React, { useEffect, useState } from 'react'
import { ladsLeagueId2022 } from '../config/config'
import { convertUser } from '../helpers/convertUser'
import { getTotalWeightOfSquad } from '../helpers/getTotalWeightOfSquad'

function Weight() {
  const [weightArray, setWeightArray] = useState<Array<any>>([])
  const [users, setUsers] = useState<Array<any>>([])

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
      getTeamTotalWeights(ladsLeagueId2022)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])


  useEffect(() => {
    getLeagueIds(ladsLeagueId2022)
  }, [])

  return (
    <Flex minH={'100vh'} bg={'#000080'}>
      {weightArray.length > 0 &&
        <VStack color={'white'}>
          {weightArray.map((team, i) => {
            return (
              <Flex key={i}>
                <Flex >
                  <Text>{team.name}</Text>
                </Flex>
                <Flex>
                  <Text>Total: {team.details.totalWeight}lbs</Text>
                </Flex>
                <Flex>
                  <Text>Avg: {team.details.avgWeight}lbs</Text>
                </Flex>
              </Flex>
            )
          })}
        </VStack>}
    </Flex>
  )
}

export default Weight