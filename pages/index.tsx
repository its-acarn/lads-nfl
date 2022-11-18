import type { NextPage } from 'next'
import styled from 'styled-components'
import { Button, Input, Space } from 'antd';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { ChangeEvent, useState } from 'react';
import { addLeagueId, addLeagueName } from '../redux/leagueDetailsSlice';
import { useRouter } from 'next/router';
import { dynastyLeagueId, ladsLeagueId } from '../config/config';

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

  const onLadsClick = () => { setLeagueID(ladsLeagueId) }
  const onDynastyClick = () => { setLeagueID(dynastyLeagueId) }

  return (
    <Main>
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
        <Button type='primary' shape='round' onClick={onLadsClick}>LadsLadsLads</Button>
        <Button type='primary' shape='round' onClick={onDynastyClick}>Dynasty</Button>
      </Space>
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
