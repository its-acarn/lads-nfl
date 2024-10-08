import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useSelector } from 'react-redux'
import { Divider, HStack, Spinner, Text, VStack } from '@chakra-ui/react'

import { Trade } from '../types/Trade'
import { NFLPlayer } from '../types/NFLPlayer'
import { getAllTrades } from '../helpers/api/getAllTrades'
import { selectLeagueDetails } from '../redux/leagueDetailsSlice'
import PlayerTraded from '../components/trades/PlayerTraded'
import SeasonWeekBadge from '../components/trades/SeasonWeekBadge'
import DateBadge from '../components/trades/DateBadge'
import TradeOwnerHeading from '../components/trades/TradeOwnerHeading'
import PickTraded from '../components/trades/PickTraded'
import FAABTraded from '../components/trades/FAABTraded'
import DEFTraded from '../components/trades/DEFTraded'
import FilterSelect from '../components/trades/FilterSelect'

function Trades() {
  const router = useRouter()
  const [loading, setLoading] = useState<boolean>(true)
  const [allTrades, setAllTrades] = useState<any>([])
  const [selectedFilter, setSelectedFilter] = useState<string>('All')
  const leagueDetails = useSelector(selectLeagueDetails)

  const filteredTrades = (trades: Trade[], filter: string) => {
    if (filter === 'All') {
      return trades
    }

    return trades.filter((t: Trade) => {
      return t.team1Owner === filter || t.team2Owner === filter
    })
  }

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
        <Spinner size={'xl'} color={'quinary'} />
        <Text color={'quinary'}>Getting trades...</Text>
      </VStack>
    )
  }

  return (
    <VStack bg={'primary'} flex={1} minH={'100vh'} p={2} spacing={0}>
      <HStack w={'full'} mb={6} justify={'space-between'} alignItems={'center'} pl={2}>
        <Text color={'quinary'} fontWeight={'bold'} fontSize={'sm'}>
          Total trades: {filteredTrades(allTrades, selectedFilter).length}
        </Text>
        <FilterSelect setSelectedFilter={setSelectedFilter} />
      </HStack>

      {filteredTrades(allTrades, selectedFilter).length > 0 ? (
        filteredTrades(allTrades, selectedFilter).map((t: Trade) => (
          <VStack w={'full'} key={t.lastUpdated} px={1} pt={1} pb={2}>
            <HStack w={'full'}>
              <SeasonWeekBadge trade={t} />
              <DateBadge trade={t} />
            </HStack>
            <HStack w={'full'} align={'flex-start'}>
              <VStack flex={1} align={'center'} ml={2}>
                <TradeOwnerHeading teamOwner={t.team1Owner} />
                {t.team1Adds &&
                  t.team1Adds.map((p: NFLPlayer, i: number) => {
                    if (!p) {
                      return <DEFTraded key={`${i}DEF`} />
                    } else {
                      return <PlayerTraded key={p.full_name} player={p} />
                    }
                  })}
                {t.team1DraftPicks.length > 0 &&
                  t.team1DraftPicks.map((dp: any, i: number) => <PickTraded key={i} draftPick={dp} />)}
                {t.team1Waiver.length > 0 && t.team1Waiver.map((w: any, i: number) => <FAABTraded key={i} faab={w} />)}
              </VStack>
              <VStack h={'100%'} color={'quinary'} flex={1} justify={'flex-start'} align={'flex-start'} ml={2}>
                <TradeOwnerHeading teamOwner={t.team2Owner} />
                {t.team2Adds &&
                  t.team2Adds.map((p: NFLPlayer, i: number) => {
                    if (!p) {
                      return <DEFTraded key={`${i}DEF`} />
                    } else {
                      return <PlayerTraded key={p.full_name} player={p} />
                    }
                  })}
                {t.team2DraftPicks.length > 0 &&
                  t.team2DraftPicks.map((dp: any, i: number) => <PickTraded key={i} draftPick={dp} />)}
                {t.team2Waiver.length > 0 && t.team2Waiver.map((w: any, i: number) => <FAABTraded key={i} faab={w} />)}
              </VStack>
            </HStack>
            <Divider borderColor={'secondary'} pt={2} />
          </VStack>
        ))
      ) : (
        <HStack>
          <Text color={'quinary'}>No trades</Text>
        </HStack>
      )}
    </VStack>
  )
}

export default Trades
