import React from 'react'
import { dynastyLeagueId2022 } from '../config/config'
import { Flex, Text, VStack } from '@chakra-ui/react'
import { findNFLPlayerWithId } from '../helpers/findNFLPlayerWithId'
import { useSelector } from 'react-redux'
import { selectRosters } from '../redux/leagueDetailsSlice'

// type IMenuProps = {
//   rosters: any
// }

// export async function getServerSideProps() {
//   const res = await fetch(`https://api.sleeper.app/v1/league/${dynastyLeagueId2022}/rosters`)
//   const rosters = await res.json()
//   return {
//     props: { rosters }
//   }
// }

function Menu() {
  const rosters = useSelector(selectRosters)

  return (
    <VStack bg={'navy'} flex={1} minH={'100vh'} pt={8} spacing={8}>
      {rosters.map((r: any, i: number) => {
        return (
          <VStack w={{ base: '80%', md: '50%' }} color={'navy'} key={i} p={6} rounded={'lg'} bg={'yellow'}>
            <Text>{r.display_name}</Text>
            <Text>{r.team_name}</Text>
            <VStack>
              {r.players.map((p: any, i: number) => {
                if (!Number.isNaN(Number(p))) {
                  return <Text key={p} textAlign="left">{findNFLPlayerWithId(Number(p)).full_name} / {findNFLPlayerWithId(Number(p)).position} / {findNFLPlayerWithId(Number(p)).team}</Text>
                }
              })}
            </VStack>
          </VStack>
        )
      })}
    </VStack>
  )
}

export default Menu