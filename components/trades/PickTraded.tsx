import React from 'react'
import { HStack, Badge, Text } from '@chakra-ui/react'

interface IPickTradedProps {
  draftPick: any
}

const PickTraded = (props: IPickTradedProps) => {
  return (
    <HStack w={'full'} pl={4} style={{ marginTop: 4, marginBottom: 4 }}>
      <Badge variant="solid" bg={'red'} fontSize={8}>
        Pick
      </Badge>
      <Text fontSize={'sm'} fontWeight={'extrabold'}>
        {props.draftPick.season} Round {props.draftPick.round}
      </Text>
    </HStack>
  )
}

export default PickTraded
