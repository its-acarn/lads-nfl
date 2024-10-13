import React from 'react'
import { Text, VStack } from '@chakra-ui/react'
import { findNFLPlayerWithId } from '../helpers/findNFLPlayerWithId'
import { useSelector } from 'react-redux'
import { selectRosters } from '../redux/leagueDetailsSlice'

function Teams() {
  const rosters = useSelector(selectRosters)

  return (
    <VStack bg={'primary'} flex={1} minH={'100vh'} pt={8} spacing={8}>
      {rosters.map((r: any, i: number) => {
        return (
          <VStack w={{ base: '80%', md: '50%' }} color={'primary'} key={i} p={6} rounded={'lg'} bg={'quinary'}>
            <Text>{r.display_name}</Text>
            <Text>{r.team_name}</Text>
            <VStack>
              {r.players.map((p: any, i: number) => {
                if (!Number.isNaN(Number(p))) {
                  return (
                    <Text key={p} textAlign="left">
                      {findNFLPlayerWithId(Number(p)).full_name} / {findNFLPlayerWithId(Number(p)).position} /{' '}
                      {findNFLPlayerWithId(Number(p)).team}
                    </Text>
                  )
                }
              })}
            </VStack>
          </VStack>
        )
      })}
    </VStack>
  )
}

export default Teams
