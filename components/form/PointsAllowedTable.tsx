import { Badge, Text } from '@chakra-ui/react'
import { Column, SortableTable } from '../SortableTable'
import { FORM_POSITIONS, PointsAllowedRow } from '../../helpers/form/types'
import { rankScheme } from './colours'

export const PointsAllowedTable = ({ rows }: { rows: PointsAllowedRow[] }) => {
  const columns: Column<PointsAllowedRow>[] = [
    {
      key: 'team',
      header: 'Defence',
      render: (r) => (
        <Text color={'quinary'} fontWeight={600}>
          {r.team}
        </Text>
      ),
    },
    { key: 'games', header: 'GP', render: (r) => r.games, sortValue: (r) => r.games },
    ...FORM_POSITIONS.map((p): Column<PointsAllowedRow> => ({
      key: p,
      header: `v ${p}`,
      render: (r) => (
        <Badge colorScheme={rankScheme(r.rank[p], rows.length)} variant={'subtle'} fontSize={'0.75rem'}>
          {r.perGame[p].toFixed(1)}{' '}
          <Text as={'span'} fontWeight={400} opacity={0.8}>
            #{r.rank[p]}
          </Text>
        </Badge>
      ),
      sortValue: (r) => r.perGame[p],
    })),
  ]
  return <SortableTable rows={rows} rowKey={(r) => r.team} columns={columns} initialSort={{ key: 'RB', desc: true }} />
}
