import { Badge, Center, Divider, Flex, HStack, Spinner, Tag, Text, VStack } from '@chakra-ui/react'
import React, { useEffect, useState } from 'react'
import { getAllTrades } from '../helpers/getAllTrades'
import { NFLPlayer } from '../types/NFLPlayer'
import { nflTeamColors } from '../config/nflTeamColors'
import { DateTime } from 'luxon'
import { useSelector } from 'react-redux'
import { selectCurrentLeagueId, selectLeagueDetails } from '../redux/leagueDetailsSlice'
import { useRouter } from 'next/router'

function Trades() {
  const [loading, setLoading] = useState<boolean>(true)
  const [allTrades, setAllTrades] = useState<any>([])
  const leagueDetails = useSelector(selectLeagueDetails)
  const router = useRouter()

  function getPositionColor(position: any) {
    switch (position) {
      case 'QB':
        return 'red'
      case 'RB':
        return 'teal'
      case 'WR':
        return 'cyan'
      case 'TE':
        return 'orange'
    }
  }

  function getNFLTeamTextColor(team: string) {
    return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[1]
  }

  function getNFLTeamBgColor(team: string) {
    return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[0]
  }

  useEffect(() => {
    if (leagueDetails.length === 0) {
      router.push('/')
    }

    getAllTrades().then((res: any) => {
      setLoading(false)
      setAllTrades(res)
    })
  }, [])

  if (loading) {
    return (
      <VStack flex={1} bg={'primary'} justify={'center'} align={'center'} minH={'90vh'}>
        <Spinner size={'xl'} color={'quaternary'} />
        <Text color={'quaternary'}>Getting trades...</Text>
      </VStack>
    )
  }

  return (
    <VStack bg={'quinary'} flex={1} minH={'100vh'} p={2} spacing={2} roundedTop={'xl'}>
      {allTrades.length > 0 ? (allTrades.map((t: any, i: number) => (
        <VStack w={'100%'} key={t.lastUpdated} bg={'secondary'} rounded={'lg'} px={1} pt={1} pb={2}>
          <HStack w={'100%'}>
            <Badge rounded={'full'} fontSize={'10px'} px={2} variant={'outline'}>Trade</Badge>
            <Badge rounded={'full'} fontSize={'10px'} px={2} variant={'outline'}>{t.season} Week {t.week}</Badge>
            <Badge rounded={'full'} fontSize={'10px'} px={2} variant={'outline'}>{DateTime.fromMillis(t.lastUpdated).toFormat('HH:mm LLL d')}</Badge>
          </HStack>
          <HStack w={'100%'} align={'flex-start'} >
            <VStack flex={1} align={'center'} ml={2}>
              <Text fontSize={'xs'} fontWeight={700} alignSelf={'center'}>
                {t.team1Owner}
              </Text>
              {t.team1Adds && t.team1Adds.map((p: NFLPlayer, i: number) => {
                if (!p) {
                  return (
                    <HStack key={`${i}DEF`}>
                      <Badge variant={'solid'} fontSize={10} colorScheme={'purple'}>DEF</Badge>
                      <Text fontSize={'xs'}>DEF</Text>
                    </HStack>
                  )
                } else {
                  return (
                    <HStack key={p.full_name}>
                      <Badge variant={'solid'} fontSize={10} colorScheme={getPositionColor(p.position)}>{p.position}</Badge>
                      <Badge variant={'solid'} fontSize={10} bg={getNFLTeamBgColor(p.team!)} color={getNFLTeamTextColor(p.team!)}>{p.team}</Badge>
                      <Text fontSize={'xs'}>{p.full_name}</Text>
                    </HStack>
                  )
                }
              })}
              {t.team1DraftPicks.length > 0 && t.team1DraftPicks.map((dp: any, i: number) => (
                <HStack key={i}>
                  <Badge variant='solid' bg={'green'} fontSize={10}>Pick</Badge>
                  <Text fontSize={'xs'}>{dp.season} Round {dp.round}</Text>
                </HStack>
              ))}
              {t.team1Waiver.length > 0 && t.team1Waiver.map((w: any, i: number) => (<HStack key={i}>
                <Badge variant='solid' colorScheme={'pink'} fontSize={10}>FAAB</Badge>
                <Text key={i} fontSize={'xs'}>{`$${w}`}</Text>
              </HStack>))}
            </VStack>
            <VStack h={'100%'} color={'quaternary'} flex={1} align={'center'} ml={2}>
              <Text fontSize={'xs'} fontWeight={700} alignSelf={'center'}>
                {t.team2Owner}
              </Text>
              {t.team2Adds && t.team2Adds.map((p: NFLPlayer, i: number) => {
                if (!p) {
                  return (
                    <HStack key={`${i}DEF`}>
                      <Badge variant={'solid'} fontSize={10} colorScheme={'purple'}>DEF</Badge>
                      <Text fontSize={'xs'}>DEF</Text>
                    </HStack>
                  )
                } else {
                  return (
                    <HStack key={p.full_name}>
                      <Badge variant={'solid'} fontSize={10} colorScheme={getPositionColor(p.position)}>{p.position}</Badge>
                      <Badge variant={'solid'} fontSize={10} bg={getNFLTeamBgColor(p.team!)} color={getNFLTeamTextColor(p.team!)}>{p.team}</Badge>
                      <Text fontSize={'xs'}>{p.full_name}</Text>
                    </HStack>
                  )
                }
              })}
              {t.team2DraftPicks.length > 0 && t.team2DraftPicks.map((dp: any, i: number) => (
                <HStack key={i}>
                  <Badge variant='solid' bg={'green'} fontSize={10}>Pick</Badge>
                  <Text fontSize={'xs'}>{dp.season} Round {dp.round}</Text>
                </HStack>
              ))}
              {t.team2Waiver.length > 0 && t.team2Waiver.map((w: any, i: number) => (
                <HStack key={i}>
                  <Badge variant='solid' colorScheme={'pink'} fontSize={10}>FAAB</Badge>
                  <Text key={i} fontSize={'xs'}>{`$${w}`}</Text>
                </HStack>
              ))}
            </VStack>
          </HStack>
        </VStack>
      ))) : (
        <HStack>
          <Text color={'quaternary'}>No trades</Text>
        </HStack>
      )}
    </VStack>
  )
}

export default Trades