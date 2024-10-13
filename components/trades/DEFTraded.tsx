import React from 'react'
import { HStack, Badge, Text } from '@chakra-ui/react'

const DEFTraded = () => {
  return (
    <HStack w={'full'} pl={4} style={{ marginTop: 4, marginBottom: 4 }}>
      <Badge variant={'solid'} fontSize={8} colorScheme={'purple'}>
        DEF
      </Badge>
      <Text fontSize={'sm'} fontWeight={'extrabold'}>
        DEF
      </Text>
    </HStack>
  )
}

export default DEFTraded
