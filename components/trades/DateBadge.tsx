import React from 'react'
import { Badge } from '@chakra-ui/react'
import { DateTime } from 'luxon'

import { Trade } from '../../types/Trade'

interface IDateBadgeProps {
  trade: Trade
}

const DateBadge = (props: IDateBadgeProps) => {
  return (
    <Badge rounded={'full'} fontSize={8} px={1} bg={'tertiary'}>
      {DateTime.fromMillis(props.trade.lastUpdated).toFormat('LLL d')}
    </Badge>
  )
}

export default DateBadge
