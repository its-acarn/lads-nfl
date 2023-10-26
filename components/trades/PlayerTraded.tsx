import { VStack, HStack, Badge, Text, Center } from '@chakra-ui/react'

import React from 'react'
import { getPositionColor, getNFLTeamBgColor, getNFLTeamTextColor } from '../../helpers/getNFLTeamColors'

interface IPlayerTradedProps {
  player: any
}

const PlayerTraded = (props: IPlayerTradedProps) => {
  return (
    <VStack justifyContent={'center'} alignItems={'flex-start'} w={'full'} pl={4}>
      <Text fontSize={'sm'} fontWeight={'bold'}>
        {props.player.full_name}
      </Text>
      <HStack>
        <Badge variant={'solid'} fontSize={8} colorScheme={getPositionColor(props.player.position)}>
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
