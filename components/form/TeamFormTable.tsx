import { useState } from 'react'
import { Badge, Box, Button, SimpleGrid, Text } from '@chakra-ui/react'
import { Column, SortableTable } from '../SortableTable'
import { LineupPlayer, TEAM_FORM_GROUPS, TeamFormGroup, TeamFormRow } from '../../helpers/form/types'
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

const PlayerLine = ({ slot, player }: { slot: string; player: LineupPlayer | null }) => (
  <Box display={'flex'} gap={2} fontSize={'xs'} alignItems={'baseline'}>
    <Text w={'40px'} color={'tertiary'} flexShrink={0}>
      {slot}
    </Text>
    {player ? (
      <>
        <Text color={'quinary'} flex={1}>
          {player.name}
          {player.injuryStatus && (
            <Badge ml={1} colorScheme={'red'} variant={'subtle'} fontSize={'0.6rem'}>
              {player.injuryStatus}
            </Badge>
          )}
        </Text>
        <Text color={'quinary'} fontWeight={600}>
          {player.value.toFixed(1)}
        </Text>
      </>
    ) : (
      <Text color={'secondary'}>nobody</Text>
    )}
  </Box>
)

const Lineup = ({ row }: { row: TeamFormRow }) => (
  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 3, md: 8 }} maxW={'720px'} py={1}>
    <Box>
      <Text fontSize={'xs'} fontWeight={700} mb={1}>
        Best lineup
      </Text>
      {row.starters.map((s, i) => (
        <PlayerLine key={i} slot={s.slot} player={s.player} />
      ))}
    </Box>
    <Box>
      <Text fontSize={'xs'} fontWeight={700} mb={1}>
        Next in (bench)
      </Text>
      {row.benchPlayers.length ? (
        row.benchPlayers.map((p) => <PlayerLine key={p.id} slot={p.position} player={p} />)
      ) : (
        <Text fontSize={'xs'}>No spare RB, WR or TE with a game this season.</Text>
      )}
    </Box>
  </SimpleGrid>
)

export const TeamFormTable = ({ rows }: { rows: TeamFormRow[] }) => {
  const [expanded, setExpanded] = useState<string | null>(null)
  const cols: Col[] = ['total', ...TEAM_FORM_GROUPS, 'bench']
  const columns: Column<TeamFormRow>[] = [
    {
      key: 'team',
      header: 'Team',
      minW: '170px',
      render: (r) => {
        const key = String(r.rosterId)
        const open = expanded === key
        return (
          <Button
            variant={'link'}
            size={'sm'}
            color={'quinary'}
            fontWeight={r.owner.kind === 'mine' ? 700 : 500}
            whiteSpace={'normal'}
            textAlign={'left'}
            aria-expanded={open}
            onClick={() => setExpanded(open ? null : key)}>
            {open ? '▾ ' : '▸ '}
            {r.owner.kind === 'fa' ? '' : r.owner.label}
            {r.owner.kind === 'mine' ? ' (you)' : ''}
          </Button>
        )
      },
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
      renderDetail={(r) => <Lineup row={r} />}
      expanded={expanded}
    />
  )
}
