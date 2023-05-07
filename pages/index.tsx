import { ChangeEvent, useState } from 'react';
import type { NextPage } from 'next'
import styled from 'styled-components'
import { Input, } from 'antd';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { addRosters, addLeagueDetails } from '../redux/leagueDetailsSlice';
import { useRouter } from 'next/router';
import { dynastyLeagueId2022, dynastyLeagueId2023, ladsLeagueId2022 } from '../config/config';
import { Button, Flex } from '@chakra-ui/react';
import { getAllPreviousLeagueDetails } from '../helpers/getAllPreviousLeagueDetails';

const Home: NextPage = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [leagueId, setLeagueID] = useState<string>('')
  const dispatch = useDispatch()
  const router = useRouter()

  const onSearch = async (id: string) => {
    setIsLoading(true)

    const getUsers = await axios.get(`https://api.sleeper.app/v1/league/${id}/users`)
      .then((res: any) => res.data)

    const getRosters = await axios.get(`https://api.sleeper.app/v1/league/${id}/rosters`)
      .then((res: any) => res.data)

    Promise.all([getAllPreviousLeagueDetails(id), getUsers, getRosters]).then((res) => {
      const leagueDetails = res[0]
      const users = res[1]
      const rosters = res[2]

      const mergedArray = rosters.map((roster: any) => {
        const user = users.find((user: any) => user.user_id === roster.owner_id)
        return { ...roster, display_name: user.display_name, team_name: user.metadata.team_name }
      })

      dispatch(addLeagueDetails(leagueDetails))
      dispatch(addRosters(mergedArray))

      router.push('/trades')
    }).catch(() => setIsLoading(false))
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => { setLeagueID(event.target.value) }

  const onLadsClick = () => { setLeagueID(ladsLeagueId2022) }
  const onDynastyClick = () => { setLeagueID(dynastyLeagueId2022) }
  const onDynasty2023Click = () => { setLeagueID(dynastyLeagueId2023) }

  return (
    <Main bg={'primary'}>
      <Text>Enter your Sleeper League ID:</Text>
      <Container>
        <Input.Search
          value={leagueId}
          placeholder="E.g: 798545046239588352"
          datatype='text'
          enterButton
          size='large'
          onSearch={onSearch}
          loading={isLoading}
          onChange={onChange}
        />
      </Container>
      <Flex maxW={'100vw'} flexWrap={'wrap'} justify={'center'}>
        <Button onClick={onLadsClick}>LadsLadsLads 2022</Button>
        <Button onClick={onDynastyClick}>Dynasty 2022</Button>
        <Button onClick={onDynasty2023Click}>Dynasty 2023</Button>
      </Flex>
    </Main>
  )
}

const Main = styled(Flex)`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`
const Container = styled.div`
  margin-bottom: 10px;
`
const Text = styled.p`
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  color: white;
`

export default Home
