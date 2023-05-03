import React, { useEffect, useState } from "react"
import styled from 'styled-components'
import { ladsLeagueId2022 } from "../config/config"
import { convertUser } from "../helpers/convertUser"
import { getAverageAgeOfSquad } from "../helpers/getAverageAgeOfSquad"
import { Flex } from "@chakra-ui/react";

const Age = () => {
  const [users, setUsers] = useState<Array<any>>([])
  const [selectedUser, setSelectedUser] = useState<any>()
  const [averageAge, setAverageAge] = useState<number>()
  const [allAvgArray, setAllAvgArray] = useState<Array<any>>([])

  const getAllAverageAges = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      .then((res) => res.json())
      .then((teams) => teams.map((team: any) => {
        return {
          name: users.find(user => user.value === team.owner_id).label,
          averageAge: getAverageAgeOfSquad(team.players)
        }
      }))
      .then((avgAgeArray) => setAllAvgArray(avgAgeArray.sort((teamA: any, teamB: any) => teamA.averageAge - teamB.averageAge)))
      .catch(e => console.error(e))
  }

  const getTeamAverageAge = (leagueId: string, managerId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
      .then((res) => res.json())
      .then((teams) => teams.find((team: any) => team.owner_id === managerId))
      .then((team) => team.players)
      .then((playerIds) => getAverageAgeOfSquad(playerIds))
      .then((age) => setAverageAge(age))
      .catch(e => console.error(e))
  }

  const getLeagueIds = (leagueId: string) => {
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`)
      .then((res) => res.json())
      .then((result) => result.map((user: any) => convertUser(user)))
      .then((displayNames) => setUsers(displayNames))
      .catch(e => console.error(e))
  }

  useEffect(() => {
    if (users.length > 0) {
      getAllAverageAges(ladsLeagueId2022)
    }
    if (selectedUser) {
      getTeamAverageAge(ladsLeagueId2022, selectedUser?.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, selectedUser])


  useEffect(() => {
    getLeagueIds(ladsLeagueId2022)
  }, [])

  return (
    <Flex minH={'100vh'} bg={'#000080'}>
      {averageAge && <TextContainer>
        <Text>Avg age: {averageAge}</Text>
      </TextContainer>}
      {allAvgArray.length > 0 &&
        <Container>
          {allAvgArray.map((team, i) => {
            return (
              <AgeContainer key={i}>
                <TextContainer >
                  <Text>{team.name}</Text>
                </TextContainer>
                <TextContainer>
                  <Text>{team.averageAge}</Text>
                </TextContainer>
              </AgeContainer>
            )
          })}
        </Container>}
    </Flex>
  )
}

const TextContainer = styled.div`
  width: 140px;
  display: flex;
  border-radius: 10px;
  justify-content: center;
  align-items: center;
  background-color: white;
`
const Text = styled.p`
  text-align: center;
  font-size: 15px;
  font-weight: bold;
`
const AgeContainer = styled.div`
  display: flex;
  border-radius: 10px;
  justify-content: center;
  align-items: center;
  background-color: white;
  margin-bottom: 10px;
`
const Container = styled.div`
  display: flex;
  flex-direction: column;
`

export default Age