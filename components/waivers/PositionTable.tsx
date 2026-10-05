import { ReactNode, useState } from 'react'
import { Box, Flex, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react'
import FlagChip from './FlagChip'
import { formatPct, formatScore, formatTrend } from '../../helpers/waivers/format'
import { Position, StreamRow, WaiverRow } from '../../helpers/waivers/types'

// A plain HTML table rather than AG Grid: rows hold wrapping flag chips, and
// a table sizes each row to its content without a measuring pass.

interface Column<R> {
  key: string
  header: string
  render: (row: R) => ReactNode
  sortValue?: (row: R) => number
  minW?: string
}

function SortableTable<R extends { playerId: string }>({ rows, columns }: { rows: R[]; columns: Column<R>[] }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null)
  const column = sort ? columns.filter((c) => c.key === sort.key)[0] : undefined
  const sorted =
    column && column.sortValue
      ? rows.slice().sort((a, b) => {
          const d = (column.sortValue as (r: R) => number)(a) - (column.sortValue as (r: R) => number)(b)
          return sort && sort.desc ? -d : d
        })
      : rows

  return (
    <TableContainer w={'full'} overflowX={'auto'}>
      <Table size={'sm'} variant={'simple'}>
        <Thead>
          <Tr>
            {columns.map((c) => (
              <Th
                key={c.key}
                color={'tertiary'}
                borderColor={'gray.700'}
                cursor={c.sortValue ? 'pointer' : 'default'}
                userSelect={'none'}
                onClick={() => c.sortValue && setSort({ key: c.key, desc: sort && sort.key === c.key ? !sort.desc : true })}>
                {c.header}
                {sort && sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {sorted.map((row) => (
            <Tr key={row.playerId}>
              {columns.map((c) => (
                <Td key={c.key} color={'quinary'} borderColor={'gray.800'} minW={c.minW} whiteSpace={'normal'} verticalAlign={'top'}>
                  {c.render(row)}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  )
}

const number = (key: string, header: string, value: (r: WaiverRow) => number, digits = 1): Column<WaiverRow> => ({
  key,
  header,
  render: (r) => value(r).toFixed(digits),
  sortValue: value,
})

const share = (key: string, header: string, value: (r: WaiverRow) => number, prior?: (r: WaiverRow) => number | null): Column<WaiverRow> => ({
  key,
  header,
  render: (r) => {
    const trend = prior ? formatTrend(value(r), prior(r)) : ''
    return (
      <>
        {formatPct(value(r))}
        {trend && (
          <Text as={'span'} fontSize={'xs'} color={trend[0] === '+' ? 'green.300' : 'secondary'}>
            {' '}
            {trend}
          </Text>
        )}
      </>
    )
  },
  sortValue: value,
})

const priorOf = (pick: (s: NonNullable<WaiverRow['usage']['prior']>) => number) => (r: WaiverRow) =>
  r.usage.prior ? pick(r.usage.prior) : null

function columns(position: Position, ranks: Record<string, number>): Column<WaiverRow>[] {
  const lead: Column<WaiverRow>[] = [
    { key: 'rank', header: '#', render: (r) => ranks[r.playerId], sortValue: (r) => -ranks[r.playerId] },
    {
      key: 'player',
      header: 'Player',
      minW: '150px',
      render: (r) => (
        <Box lineHeight={'1.2'}>
          <Text color={'quinary'} fontWeight={600}>
            {r.name}
          </Text>
          <Text fontSize={'xs'}>{r.team}</Text>
        </Box>
      ),
    },
    { key: 'score', header: 'Score', render: (r) => <b>{formatScore(r.score)}</b>, sortValue: (r) => r.score },
    {
      key: 'why',
      header: 'Why',
      minW: '240px',
      render: (r) => (
        <Flex wrap={'wrap'}>
          {r.flags.map((f) => (
            <FlagChip key={f.kind} flag={f} />
          ))}
        </Flex>
      ),
    },
    share('snap', 'Snap %', (r) => r.usage.window.snap, priorOf((s) => s.snap)),
  ]
  const receiver = [
    share('target', 'Tgt %', (r) => r.usage.window.target, priorOf((s) => s.target)),
    share('air', 'Air yd %', (r) => r.usage.window.airYards),
    number('rz', 'RZ/g', (r) => r.usage.rzOppsPerGame),
  ]
  const byPosition: Record<Position, Column<WaiverRow>[]> = {
    WR: receiver,
    TE: receiver,
    RB: [
      share('carry', 'Carry %', (r) => r.usage.window.carry, priorOf((s) => s.carry)),
      share('target', 'Tgt %', (r) => r.usage.window.target),
      number('rz', 'RZ/g', (r) => r.usage.rzOppsPerGame),
    ],
    QB: [
      number('passAtt', 'Att/g', (r) => r.usage.passAttPerGame),
      number('rushYd', 'Rush yd/g', (r) => r.usage.rushYdPerGame),
      number('rzAtt', 'RZ att/g', (r) => r.usage.passRzAttPerGame),
    ],
  }
  const tail: Column<WaiverRow>[] = [
    number('ppg', 'PPG', (r) => r.usage.ppg),
    {
      key: 'upgrade',
      header: 'Upgrade over',
      minW: '130px',
      render: (r) => (r.upgradeOver ? `${r.upgradeOver.name} (${formatScore(r.upgradeOver.score)})` : ''),
    },
  ]
  return lead.concat(byPosition[position], tail)
}

export const PositionTable = ({ position, rows }: { position: Position; rows: WaiverRow[] }) => {
  const ranks: Record<string, number> = {}
  rows.forEach((r, i) => (ranks[r.playerId] = i + 1))
  return <SortableTable rows={rows} columns={columns(position, ranks)} />
}

const STREAM_COLUMNS: Column<StreamRow>[] = [
  { key: 'name', header: 'Name', minW: '150px', render: (r) => r.name },
  { key: 'team', header: 'Team', render: (r) => r.team },
  { key: 'opponent', header: 'Next opponent', render: (r) => r.opponent || 'BYE' },
  { key: 'score', header: 'Score', render: (r) => (r.opponent ? formatScore(r.score) : '–'), sortValue: (r) => r.score },
]

export const StreamTable = ({ rows }: { rows: StreamRow[] }) => <SortableTable rows={rows} columns={STREAM_COLUMNS} />
