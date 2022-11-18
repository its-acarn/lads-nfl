import React, { useEffect, useState } from "react"
import styled from 'styled-components'
import { Input } from 'antd';

import { ladsLeagueId, dynastyLeagueId } from "../config/config"
import { convertUser } from "../helpers/convertUser"
import { findNFLPlayerWithId } from "../helpers/findNFLPlayerWithId"
import { getAverageAgeOfSquad } from "../helpers/getAverageAgeOfSquad"
import { getTotalWeightOfSquad } from "../helpers/getTotalWeightOfSquad"
import { getFirstNames, getSecondNames } from "../helpers/getFirstNames"

const { Search } = Input;

const Hello = () => {
  const [users, setUsers] = useState<Array<any>>([])
  const [selectedUser, setSelectedUser] = useState<any>()
  const [averageAge, setAverageAge] = useState<number>()
  const [allAvgArray, setAllAvgArray] = useState<Array<any>>([])
  const [firstNamesArray, setFirstNamesArray] = useState<Array<any>>([])
  const [secondNamesArray, setSecondNamesArray] = useState<Array<any>>([])
  const [weightArray, setWeightArray] = useState<Array<any>>([])

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

  const handleChange = (selectedOption: any) => {
    setSelectedUser(selectedOption)
  }

  useEffect(() => {
    if (users.length > 0) {
      getAllAverageAges(ladsLeagueId)
      getTeamTotalWeights(ladsLeagueId)
      getFirstNamesArray(ladsLeagueId)
      getSecondNamesArray(ladsLeagueId)
    }
    if (selectedUser) {
      getTeamAverageAge(ladsLeagueId, selectedUser?.value)
    }
  }, [users, selectedUser])


  useEffect(() => {
    getLeagueIds(ladsLeagueId)
  }, [])

  return (
    <Main>
      {/* <Input.Search placeholder="Enter your league ID" /> */}
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
      <ContainerWrapper>
        {firstNamesArray.length > 0 &&
          <Container>
            <TextTitle>FIRST NAMES:</TextTitle>
            {firstNamesArray.map((name, i) => {
              return (
                <AgeContainer key={i}>
                  <TextContainer >
                    <Text>{name[0]}</Text>
                  </TextContainer>
                  <TextContainer>
                    <Text>{name[1]}</Text>
                  </TextContainer>
                </AgeContainer>
              )
            })}
          </Container>}
        {secondNamesArray.length > 0 &&
          <Container>
            <TextTitle>SECOND NAMES:</TextTitle>
            {secondNamesArray.map((name, i) => {
              return (
                <AgeContainer key={i}>
                  <TextContainer >
                    <Text>{name[0]}</Text>
                  </TextContainer>
                  <TextContainer>
                    <Text>{name[1]}</Text>
                  </TextContainer>
                </AgeContainer>
              )
            })}
          </Container>}
      </ContainerWrapper>
      {weightArray.length > 0 &&
        <Container>
          {weightArray.map((team, i) => {
            return (
              <AgeContainer key={i}>
                <TextContainer >
                  <Text>{team.name}</Text>
                </TextContainer>
                <TextContainer>
                  <Text>Total: {team.details.totalWeight}lbs</Text>
                </TextContainer>
                <TextContainer>
                  <Text>Avg: {team.details.avgWeight}lbs</Text>
                </TextContainer>
              </AgeContainer>
            )
          })}
        </Container>}
    </Main>
  )
}

const Main = styled.main`
  height: 100vh;
  width: 100vw;
  background-color: #00308F;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`
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
const TextTitle = styled.p`
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  color: white;
  margin: 10px 0px;
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
const ContainerWrapper = styled.div`
  display: flex;
  width: 100%;
  justify-content: space-evenly;
`
const Left = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`
const Right = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`

export default Hello