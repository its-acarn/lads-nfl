import React from 'react'
import { Badge } from '@chakra-ui/react'

import { Trade } from '../../types/Trade'

interface ISeasonWeekBadgeProps {
  trade: Trade
}

const SeasonWeekBadge = (props: ISeasonWeekBadgeProps) => {
  return (
    <Badge rounded={'full'} fontSize={'8px'} px={1} bg={'tertiary'}>
      {props.trade.season} Week {props.trade.week}
    </Badge>
  )
}

export default SeasonWeekBadge
