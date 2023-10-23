import { ChangeEvent, useState } from 'react';
import type { NextPage } from 'next'
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { addRosters, addLeagueDetails } from '../redux/leagueDetailsSlice';
import { useRouter } from 'next/router';
import {  dynastyLeagueId2023, ladsLeagueId2022, ladsLeagueId2023 } from '../config/config';
import { Text, Button, Input, VStack, HStack } from '@chakra-ui/react';
import { getAllPreviousLeagueDetails } from '../helpers/getAllPreviousLeagueDetails';

const Home: NextPage = () => {
  const router = useRouter()
  const dispatch = useDispatch()
  const [error, setError] = useState<boolean>(false)
  const [leagueId, setLeagueID] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const onSearch = async (id: string) => {
    setIsLoading(true)

    if (id === '') {
      setError(true)
      setIsLoading(false)
      return
    }

    const getUsers = await axios.get(`https://api.sleeper.app/v1/league/${id}/users`)
      .then((res: any) => res.data).catch((e) => e)

    const getRosters = await axios.get(`https://api.sleeper.app/v1/league/${id}/rosters`)
      .then((res: any) => res.data).catch((e) => e)

    Promise.all([getUsers, getRosters, getAllPreviousLeagueDetails(id)]).then((res) => {
      const users = res[0]
      const rosters = res[1]
      const leagueDetails = res[2]

      const mergedArray = rosters.map((roster: any) => {
        const user = users.find((user: any) => user.user_id === roster.owner_id)
        return { ...roster, display_name: user.display_name, team_name: user.metadata.team_name }
      })

      dispatch(addLeagueDetails(leagueDetails))
      dispatch(addRosters(mergedArray))

      router.push('/trades')
    }).catch((e) => {
      setIsLoading(false)
      setError(true)
    })
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLeagueID(event.target.value)
    setError(false)
  }

  const onLadsClick = () => {
    setError(false)
    setLeagueID(ladsLeagueId2022)
  }
  const onDynasty2023Click = () => {
    setError(false)
    setLeagueID(dynastyLeagueId2023)
  }

  const onLads2023Click = () => {
    setError(false)
    setLeagueID(ladsLeagueId2023)
  }

  return (
    <VStack bg={'quinary'} roundedTop={'lg'} py={8} spacing={5} h={'100vh'}>
      <Text color={'primary'} fontWeight={600}>Enter your Sleeper League ID:</Text>
      <VStack>
        <HStack>
          <Input value={leagueId} w={'60vw'} rounded={'full'} bg={'primary'} border={'none'} color={'quinary'} placeholder="e.g. 798545046239588352" onChange={onChange} />
          <Button rounded={'full'} onClick={() => onSearch(leagueId)} isLoading={isLoading} variant={'outline'} color={'primary'}>Go</Button>
        </HStack>
        {error && <Text color={'red.500'}>No league found for this ID</Text>}
      </VStack>
      <HStack>
        <Button size={'sm'} bg={'quaternary'} color={'primary'} onClick={onLads2023Click}>LadsLadsLads</Button>
        <Button size={'sm'} bg={'quaternary'} color={'primary'} onClick={onDynasty2023Click}>Dynasty</Button>
      </HStack>
    </VStack>
  )
}

export default Home
