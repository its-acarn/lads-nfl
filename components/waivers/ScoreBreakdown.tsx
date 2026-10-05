import { Box, Table, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react'
import { formatMetricValues, formatScore, metricLabel } from '../../helpers/waivers/format'
import { ScoredPlayer } from '../../helpers/waivers/types'

const cell = { color: 'quinary', borderColor: 'gray.800', py: 1 }
const head = { color: 'secondary', borderColor: 'gray.700', py: 1 }

// How one player's score was built: each metric's value, its percentile among
// players at his position, its weight and the points it adds, then the
// adjustments.
const ScoreBreakdown = ({ player }: { player: ScoredPlayer }) => {
  const b = player.breakdown
  // QBs have no trend metrics, so there is nothing to redistribute.
  const redistributed = player.usage.prior === null && player.position !== 'QB'
  return (
    <Box bg={'gray.900'} rounded={'md'} p={3} maxW={'640px'}>
      <Table size={'sm'} variant={'simple'}>
        <Thead>
          <Tr>
            <Th {...head}>Metric</Th>
            <Th {...head}>Value</Th>
            <Th {...head} isNumeric>
              Percentile
            </Th>
            <Th {...head} isNumeric>
              Weight
            </Th>
            <Th {...head} isNumeric>
              Points
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {b.metrics.map((m) => (
            <Tr key={m.metric}>
              <Td {...cell}>{metricLabel(m.metric)}</Td>
              <Td {...cell}>{formatMetricValues(m.metric, m.values)}</Td>
              <Td {...cell} isNumeric>
                {Math.round(m.percentile)}
              </Td>
              <Td {...cell} isNumeric>
                {Math.round(m.weight)}%
              </Td>
              <Td {...cell} isNumeric>
                {m.points.toFixed(1)}
              </Td>
            </Tr>
          ))}
          <Tr>
            <Td {...cell} colSpan={4} fontWeight={600}>
              Usage score
            </Td>
            <Td {...cell} isNumeric fontWeight={600}>
              {player.rawScore.toFixed(1)}
            </Td>
          </Tr>
          {b.nextManUpBonus > 0 && (
            <Tr>
              <Td {...cell} colSpan={4}>
                Next man up bonus
              </Td>
              <Td {...cell} isNumeric>
                +{b.nextManUpBonus}
              </Td>
            </Tr>
          )}
          {b.injuryMultiplier !== null && (
            <Tr>
              <Td {...cell} colSpan={4}>
                Injury ({player.injuryStatus})
              </Td>
              <Td {...cell} isNumeric>
                ×{b.injuryMultiplier}
              </Td>
            </Tr>
          )}
          {b.capped && (
            <Tr>
              <Td {...cell} colSpan={4}>
                Capped at 100
              </Td>
              <Td {...cell} isNumeric />
            </Tr>
          )}
          <Tr>
            <Td {...cell} colSpan={4} fontWeight={700}>
              Score
            </Td>
            <Td {...cell} isNumeric fontWeight={700}>
              {formatScore(player.score)}
            </Td>
          </Tr>
        </Tbody>
      </Table>
      <Text fontSize={'xs'} mt={2}>
        Percentile = where he ranks among every {player.position} with enough snaps, rostered or not. Points = weight ×
        percentile.
        {redistributed && ' No games before his last three yet, so the trend metrics are left out and their weight is spread over the rest.'}
      </Text>
    </Box>
  )
}

export default ScoreBreakdown
