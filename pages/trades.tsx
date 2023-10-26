import React, { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { useRouter } from 'next/router'
import { useSelector } from 'react-redux'
import { Badge, Heading, HStack, Spinner, Text, VStack } from '@chakra-ui/react'

import { Trade } from '../types/Trade'
import { NFLPlayer } from '../types/NFLPlayer'
import { getAllTrades } from '../helpers/getAllTrades'
import { selectLeagueDetails } from '../redux/leagueDetailsSlice'
import { getNFLTeamBgColor, getNFLTeamTextColor, getPositionColor } from '../helpers/getNFLTeamColors'
import PlayerTraded from '../components/trades/PlayerTraded'

function Trades() {
  const router = useRouter()
  const [loading, setLoading] = useState<boolean>(true)
  const [allTrades, setAllTrades] = useState<any>([])
  const leagueDetails = useSelector(selectLeagueDetails)

  useEffect(() => {
    if (leagueDetails.length === 0) {
      router.push('/')
    }

    getAllTrades().then((res: any) => {
      setLoading(false)
      setAllTrades(res)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <VStack bg={'primary'} flex={1} minH={'100vh'} p={2} spacing={2}>
      {allTrades.length > 0 ? (
        allTrades.map((t: Trade) => (
          <VStack w={'full'} key={t.lastUpdated} px={1} pt={1} pb={2}>
            <HStack w={'full'}>
              <Badge rounded={'full'} fontSize={'8px'} px={1} bg={'tertiary'}>
                {t.season} Week {t.week}
              </Badge>
              <Badge rounded={'full'} fontSize={'8px'} px={1} bg={'tertiary'}>
                {DateTime.fromMillis(t.lastUpdated).toFormat('LLL d')}
              </Badge>
            </HStack>
            <HStack w={'full'} align={'flex-start'}>
              <VStack flex={1} align={'center'} ml={2}>
                <Heading fontSize={'md'} fontWeight={'extrabold'} alignSelf={'flex-start'}>
                  @{t.team1Owner}
                </Heading>
                {t.team1Adds &&
                  t.team1Adds.map((p: NFLPlayer, i: number) => {
                    if (!p) {
                      return (
                        <HStack key={`${i}DEF`}>
                          <Badge variant={'solid'} fontSize={8} colorScheme={'purple'}>
                            DEF
                          </Badge>
                          <Text fontSize={'xs'}>DEF</Text>
                        </HStack>
                      )
                    } else {
                      return <PlayerTraded key={p.full_name} player={p} />
                    }
                  })}
                {t.team1DraftPicks.length > 0 &&
                  t.team1DraftPicks.map((dp: any, i: number) => (
                    <HStack key={i}>
                      <Badge variant="solid" bg={'green'} fontSize={8}>
                        Pick
                      </Badge>
                      <Text fontSize={'xs'}>
                        {dp.season} Round {dp.round}
                      </Text>
                    </HStack>
                  ))}
                {t.team1Waiver.length > 0 &&
                  t.team1Waiver.map((w: any, i: number) => (
                    <HStack key={i}>
                      <Badge variant="solid" colorScheme={'pink'} fontSize={8}>
                        FAAB
                      </Badge>
                      <Text key={i} fontSize={'xs'}>{`$${w}`}</Text>
                    </HStack>
                  ))}
              </VStack>
              <VStack h={'100%'} color={'quaternary'} flex={1} justify={'flex-start'} align={'flex-start'} ml={2}>
                <Heading fontSize={'md'} fontWeight={'extrabold'} alignSelf={'flex-start'}>
                  @{t.team2Owner}
                </Heading>
                {t.team2Adds &&
                  t.team2Adds.map((p: NFLPlayer, i: number) => {
                    if (!p) {
                      return (
                        <HStack key={`${i}DEF`}>
                          <Badge variant={'solid'} fontSize={8} colorScheme={'purple'}>
                            DEF
                          </Badge>
                          <Text fontSize={'xs'}>DEF</Text>
                        </HStack>
                      )
                    } else {
                      return <PlayerTraded key={p.full_name} player={p} />
                    }
                  })}
                {t.team2DraftPicks.length > 0 &&
                  t.team2DraftPicks.map((dp: any, i: number) => (
                    <HStack key={i}>
                      <Badge variant="solid" bg={'green'} fontSize={8}>
                        Pick
                      </Badge>
                      <Text fontSize={'xs'}>
                        {dp.season} Round {dp.round}
                      </Text>
                    </HStack>
                  ))}
                {t.team2Waiver.length > 0 &&
                  t.team2Waiver.map((w: any, i: number) => (
                    <HStack key={i}>
                      <Badge variant="solid" colorScheme={'pink'} fontSize={8}>
                        FAAB
                      </Badge>
                      <Text key={i} fontSize={'xs'}>{`$${w}`}</Text>
                    </HStack>
                  ))}
              </VStack>
            </HStack>
          </VStack>
        ))
      ) : (
        <HStack>
          <Text color={'quaternary'}>No trades</Text>
        </HStack>
      )}
    </VStack>
  )
}

export default Trades
