import React from 'react'
import { VStack } from '@chakra-ui/react'

import { Trade } from '../../types/Trade'

interface ITradeItemProps {
  trade: Trade
}

const TradeItem = (props: ITradeItemProps) => {
  return <VStack w={'100%'} key={props.trade.lastUpdated} bg={'secondary'} rounded={'lg'} px={1} pt={1} pb={2}></VStack>
}

export default TradeItem
