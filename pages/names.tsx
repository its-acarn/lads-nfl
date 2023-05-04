import { Box, Flex, Heading, Text, VStack } from '@chakra-ui/react'
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { convertUser } from '../helpers/convertUser'
import { getFirstNames, getSecondNames } from '../helpers/getFirstNames'
import { selectLeagueId } from '../redux/leagueDetailsSlice'

function Names() {
  const [users, setUsers] = useState<Array<any>>([])
  const [firstNamesArray, setFirstNamesArray] = useState<Array<any>>([])
  const [secondNamesArray, setSecondNamesArray] = useState<Array<any>>([])
  const leagueId = useSelector(selectLeagueId)

  const getLeagueIds = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      .then((res) => res.json())
      .then((result) => result.map((user: any) => convertUser(user)))
      .then((displayNames) => setUsers(displayNames))
      .catch(e => console.error(e))
  }

  const getFirstNamesArray = (leagueId: string) => {
    let playersArray: Array<any> = []
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      .then((res) => res.json())
      .then((teams) => teams.map((team: any) => {
        playersArray = playersArray.concat(team.players)
      })).then(() => {
        const firstNamesArr = getFirstNames(playersArray)
        setFirstNamesArray(firstNamesArr)
      })
  }

  const getSecondNamesArray = (leagueId: string) => {
    let playersArray: Array<any> = []
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      .then((res) => res.json())
      .then((teams) => teams.map((team: any) => {
        playersArray = playersArray.concat(team.players)
      })).then(() => {
        const firstNamesArr = getSecondNames(playersArray)
        setSecondNamesArray(firstNamesArr)
      })
  }

  useEffect(() => {
    if (users.length > 0) {
      getFirstNamesArray(leagueId)
      getSecondNamesArray(leagueId)
    }
  }, [users, leagueId])

  useEffect(() => {
    getLeagueIds(leagueId)
  }, [leagueId])



  return (
    <Flex minH={'100vh'} bg={'#000080'}>
      {firstNamesArray.length > 0 &&
        <VStack color={'white'}>
          <Heading color={'white'}>FIRST NAMES:</Heading>
          {firstNamesArray.map((name, i) => {
            return (
              <Flex key={i}>
                <Box>
                  <Text>{name[0]}</Text>
                </Box>
                <Box>
                  <Text>{name[1]}</Text>
                </Box>
              </Flex>
            )
          })}
        </VStack>}
      {secondNamesArray.length > 0 &&
        <VStack color={'white'}>
          <Heading color={'white'}>SECOND NAMES:</Heading>
          {secondNamesArray.map((name, i) => {
            return (
              <Flex key={i}>
                <Box>
                  <Text>{name[0]}</Text>
                </Box>
                <Box>
                  <Text>{name[1]}</Text>
                </Box>
              </Flex>
            )
          })}
        </VStack>}
    </Flex>
  )
}


export default Names