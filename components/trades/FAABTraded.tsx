import React from 'react'
import { HStack, Badge, Text } from '@chakra-ui/react'

interface IFAABTradedProps {
  faab: number
}

const FAABTraded = (props: IFAABTradedProps) => {
  return (
    <HStack w={'full'} pl={4} style={{ marginTop: 4, marginBottom: 4 }}>
      <Badge variant="solid" colorScheme={'pink'} fontSize={8}>
        FAAB
      </Badge>
      <Text fontSize={'sm'} fontWeight={'extrabold'}>{`$${props.faab}`}</Text>
    </HStack>
  )
}

export default FAABTraded
