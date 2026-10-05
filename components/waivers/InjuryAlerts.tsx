import { Alert, AlertDescription, AlertIcon, VStack } from '@chakra-ui/react'
import { formatScore } from '../../helpers/waivers/format'
import { InjuryAlert } from '../../helpers/waivers/types'

const InjuryAlerts = ({ alerts }: { alerts: InjuryAlert[] }) => {
  if (alerts.length === 0) return null
  return (
    <VStack w={'full'} spacing={2} align={'stretch'}>
      {alerts.map((a) => (
        <Alert key={a.playerId} status={a.injuryStatus === 'Questionable' ? 'warning' : 'error'} variant={'left-accent'} bg={'gray.900'}>
          <AlertIcon />
          <AlertDescription color={'quinary'} fontSize={'sm'}>
            <b>{a.name}</b> ({a.position}): {a.injuryStatus}.{' '}
            {a.bestReplacement
              ? `Best available ${a.position}: ${a.bestReplacement.name}, score ${formatScore(a.bestReplacement.score)}.`
              : `No ${a.position} available to replace him.`}
          </AlertDescription>
        </Alert>
      ))}
    </VStack>
  )
}

export default InjuryAlerts
