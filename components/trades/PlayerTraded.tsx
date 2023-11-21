import React from 'react'
import { VStack, HStack, Badge, Text } from '@chakra-ui/react'

import { getNFLTeamBgColor, getNFLTeamTextColor } from '../../helpers/getNFLTeamColors'

interface IPlayerTradedProps {
  player: any
}

const PlayerTraded = (props: IPlayerTradedProps) => {
  return (
    <VStack
      justifyContent={'center'}
      alignItems={'flex-start'}
      w={'full'}
      pl={4}
      style={{ marginTop: 4, marginBottom: 4 }}>
      <Text fontSize={'sm'} fontWeight={'extrabold'}>
        {props.player.full_name}
      </Text>
      <HStack pt={0.5} style={{ margin: 0 }}>
        <Badge variant={'solid'} fontSize={8} bg={'white'} color={'black'}>
          {props.player.position}
        </Badge>
        <Badge
          variant={'solid'}
          fontSize={8}
          bg={getNFLTeamBgColor(props.player.team!)}
          color={getNFLTeamTextColor(props.player.team!)}>
          {props.player.team}
        </Badge>
      </HStack>
    </VStack>
  )
}

export default PlayerTraded
