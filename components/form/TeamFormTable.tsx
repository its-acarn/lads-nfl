import { Badge, Text } from '@chakra-ui/react'
import { Column, SortableTable } from '../SortableTable'
import { TEAM_FORM_GROUPS, TeamFormGroup, TeamFormRow } from '../../helpers/form/types'
import { rankScheme } from './colours'

type Col = TeamFormGroup | 'total' | 'bench'
const valueOf = (r: TeamFormRow, c: Col): number => (c === 'total' ? r.total : c === 'bench' ? r.bench : r.groups[c])
const HEADERS: Record<Col, string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  K: 'K',
  DEF: 'DEF',
  total: 'Total',
  bench: 'Bench',
}

export const TeamFormTable = ({ rows }: { rows: TeamFormRow[] }) => {
  const cols: Col[] = ['total', ...TEAM_FORM_GROUPS, 'bench']
  const columns: Column<TeamFormRow>[] = [
    {
      key: 'team',
      header: 'Team',
      minW: '170px',
      render: (r) => (
        <Text color={'quinary'} fontWeight={r.owner.kind === 'mine' ? 700 : 500}>
          {r.owner.kind === 'fa' ? '' : r.owner.label}
          {r.owner.kind === 'mine' ? ' (you)' : ''}
        </Text>
      ),
    },
    ...cols.map((c): Column<TeamFormRow> => ({
      key: c,
      header: HEADERS[c],
      render: (r) => (
        <Badge colorScheme={rankScheme(r.rank[c], rows.length)} variant={'subtle'} fontSize={'0.75rem'}>
          {valueOf(r, c).toFixed(1)}{' '}
          <Text as={'span'} fontWeight={400} opacity={0.8}>
            #{r.rank[c]}
          </Text>
        </Badge>
      ),
      sortValue: (r) => valueOf(r, c),
    })),
  ]
  return (
    <SortableTable
      rows={rows}
      rowKey={(r) => String(r.rosterId)}
      columns={columns}
      initialSort={{ key: 'total', desc: true }}
      isHighlighted={(r) => r.owner.kind === 'mine'}
    />
  )
}
