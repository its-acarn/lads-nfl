import { Tag } from '@chakra-ui/react'
import { Flag, FlagKind } from '../../helpers/waivers/types'

// Opportunity flags in green, context in grey, injuries in red.
const SCHEME: Record<FlagKind, string> = {
  snapSurge: 'green',
  targetHog: 'green',
  workhorse: 'green',
  buyLow: 'teal',
  redZone: 'green',
  nextManUp: 'purple',
  newRole: 'purple',
  trending: 'gray',
  injured: 'red',
}

const FlagChip = ({ flag }: { flag: Flag }) => (
  <Tag size={'sm'} colorScheme={SCHEME[flag.kind]} variant={'subtle'} mr={1} mb={1} whiteSpace={'normal'} py={1}>
    {flag.label}
  </Tag>
)

export default FlagChip
