import type { NextPage } from 'next'
import styled from 'styled-components'
import { Button, Input, Space } from 'antd';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { ChangeEvent, useState } from 'react';
import { addLeagueId, addLeagueName } from '../redux/leagueDetailsSlice';
import { useRouter } from 'next/router';
import { dynastyLeagueId2022, ladsLeagueId2022 } from '../config/config';
import { Flex } from '@chakra-ui/react';

const Home: NextPage = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [leagueId, setLeagueID] = useState<string>('')
  const dispatch = useDispatch()
  const router = useRouter()

  const onSearch = (id: string) => {
    setIsLoading(true)

    axios.get(`https://api.sleeper.app/v1/league/${id}`)
      .then((res: any) => {
        dispatch(addLeagueId(id))
        dispatch(addLeagueName(res.data.name))
        router.push('/menu')
      })
      .catch(() => setIsLoading(false))
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => { setLeagueID(event.target.value) }

  const onLadsClick = () => { setLeagueID(ladsLeagueId2022) }
  const onDynastyClick = () => { setLeagueID(dynastyLeagueId2022) }

  return (
    <Main bg={'navy'}>
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
      <Space>
        <Button type='primary' shape='round' onClick={onLadsClick}>LadsLadsLads 2022</Button>
        <Button type='primary' shape='round' onClick={onDynastyClick}>Dynasty 2022</Button>
      </Space>
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
