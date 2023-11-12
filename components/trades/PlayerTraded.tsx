import { VStack, HStack, Badge, Text, Center, Box, Flex } from '@chakra-ui/react'

import React from 'react'
import { getPositionColor, getNFLTeamBgColor, getNFLTeamTextColor } from '../../helpers/getNFLTeamColors'

interface IPlayerTradedProps {
  player: any
}

const PlayerTraded = (props: IPlayerTradedProps) => {
  return (
    <VStack justifyContent={'center'} alignItems={'flex-start'} w={'full'} pl={8}>
      <Text fontSize={'sm'} fontWeight={'extrabold'}>
        {props.player.full_name}
      </Text>
      <HStack style={{ margin: 0 }}>
        <Badge variant={'solid'} fontSize={8} m={0} colorScheme={getPositionColor(props.player.position)}>
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
