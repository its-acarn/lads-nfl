import { useState } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { Column, SortableTable } from '../SortableTable'
import FlagChip from './FlagChip'
import ScoreBreakdown from './ScoreBreakdown'
import { formatPct, formatScore, formatTrend } from '../../helpers/waivers/format'
import { Position, StreamRow, WaiverRow } from '../../helpers/waivers/types'

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

function columns(
  position: Position,
  ranks: Record<string, number>,
  expanded: string | null,
  toggle: (id: string) => void
): Column<WaiverRow>[] {
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
    {
      key: 'score',
      header: 'Score',
      render: (r) => (
        <Button
          size={'xs'}
          variant={'outline'}
          colorScheme={'green'}
          title={'How this score was calculated'}
          aria-expanded={expanded === r.playerId}
          onClick={() => toggle(r.playerId)}>
          {formatScore(r.score)} {expanded === r.playerId ? '▾' : '▸'}
        </Button>
      ),
      sortValue: (r) => r.score,
    },
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (id: string) => setExpanded(expanded === id ? null : id)
  const ranks: Record<string, number> = {}
  rows.forEach((r, i) => (ranks[r.playerId] = i + 1))
  return (
    <SortableTable
      rows={rows}
      rowKey={(r) => r.playerId}
      columns={columns(position, ranks, expanded, toggle)}
      expanded={expanded}
      renderDetail={(r) => <ScoreBreakdown player={r} />}
    />
  )
}

const STREAM_COLUMNS: Column<StreamRow>[] = [
  { key: 'name', header: 'Name', minW: '150px', render: (r) => r.name },
  { key: 'team', header: 'Team', render: (r) => r.team },
  { key: 'opponent', header: 'Next opponent', render: (r) => r.opponent || 'BYE' },
  { key: 'score', header: 'Score', render: (r) => (r.opponent ? formatScore(r.score) : '–'), sortValue: (r) => r.score },
]

export const StreamTable = ({ rows }: { rows: StreamRow[] }) => <SortableTable rows={rows} rowKey={(r) => r.playerId} columns={STREAM_COLUMNS} />
