import React from 'react'
import { Heading } from '@chakra-ui/react'

interface ITradeOwnerHeadingProps {
  teamOwner: string
}

const TradeOwnerHeading = (props: ITradeOwnerHeadingProps) => {
  return (
    <Heading fontSize={'md'} fontWeight={'extrabold'} alignSelf={'flex-start'}>
      @{props.teamOwner}
    </Heading>
  )
}

export default TradeOwnerHeading
