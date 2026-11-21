import { useMemo, useState } from 'react'
import { Badge, Box, Checkbox, HStack, Input, Select, Stack, Text, Tooltip, Wrap, WrapItem } from '@chakra-ui/react'
import { Column, SortableTable } from '../SortableTable'
import { formatPct } from '../../helpers/waivers/format'
import { filterPlayers, OwnerFilter, PositionFilter } from '../../helpers/form/filter'
import { PlayerFormRow } from '../../helpers/form/types'
import { TIER_SCHEME } from './colours'
const POSITION_FILTERS: PositionFilter[] = ['All', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']

const pts = (n: number): string => n.toFixed(1)

function ownerText(r: PlayerFormRow): string {
  return r.owner.kind === 'fa' ? 'FA' : r.owner.kind === 'mine' ? 'Mine' : r.owner.label
}

const usageCol = (
  key: string,
  header: string,
  value: (r: PlayerFormRow) => number | undefined,
  pct = true
): Column<PlayerFormRow> => ({
  key,
  header,
  render: (r) => {
    const v = value(r)
    return v === undefined ? '' : pct ? formatPct(v) : v.toFixed(1)
  },
  sortValue: (r) => value(r) ?? -1,
})

const COLUMNS: Column<PlayerFormRow>[] = [
  {
    key: 'player',
    header: 'Player',
    minW: '160px',
    render: (r) => (
      <Box lineHeight={'1.2'}>
        <Text color={'quinary'} fontWeight={600}>
          {r.name}
        </Text>
        <Text fontSize={'xs'}>
          {r.position} · {r.team}
          {r.injuryStatus && (
            <Badge ml={1} colorScheme={'red'} variant={'subtle'} fontSize={'0.6rem'}>
              {r.injuryStatus}
            </Badge>
          )}
        </Text>
      </Box>
    ),
  },
  {
    key: 'owner',
    header: 'Owner',
    minW: '110px',
    render: (r) => (
      <Text
        fontSize={'xs'}
        color={r.owner.kind === 'fa' ? 'green.300' : r.owner.kind === 'mine' ? 'quinary' : 'secondary'}>
        {ownerText(r)}
      </Text>
    ),
  },
  {
    key: 'gp',
    header: 'GP',
    render: (r) =>
      r.windowSize !== null && r.gamesPlayed < r.windowSize ? `${r.gamesPlayed} of ${r.windowSize}` : r.gamesPlayed,
    sortValue: (r) => r.gamesPlayed,
  },
  {
    key: 'avg',
    header: 'Avg',
    render: (r) => (
      <Text color={'quinary'} fontWeight={700}>
        {pts(r.avg)}
      </Text>
    ),
    sortValue: (r) => r.avg,
  },
  { key: 'season', header: 'Season', render: (r) => pts(r.seasonAvg), sortValue: (r) => r.seasonAvg },
  {
    key: 'delta',
    header: 'Δ',
    render: (r) => (
      <Text as={'span'} color={r.delta >= 0.05 ? 'green.300' : r.delta <= -0.05 ? 'red.300' : 'secondary'}>
        {r.delta >= 0 ? '+' : '−'}
        {Math.abs(r.delta).toFixed(1)}
      </Text>
    ),
    sortValue: (r) => r.delta,
  },
  {
    key: 'weeks',
    header: 'Games',
    minW: '140px',
    render: (r) => (
      <Wrap spacing={1}>
        {r.games.map((g) => (
          <WrapItem key={g.week}>
            <Tooltip label={`Week ${g.week} v ${g.opponent}`}>
              <Text as={'span'} fontSize={'xs'} color={'tertiary'}>
                {g.points.toFixed(1)}
              </Text>
            </Tooltip>
          </WrapItem>
        ))}
      </Wrap>
    ),
  },
  {
    key: 'last',
    header: 'Last',
    render: (r) => (
      <Box lineHeight={'1.2'} fontSize={'xs'}>
        <Text>Wk {r.lastWeek}</Text>
        {r.missed > 0 && <Text color={'orange.300'}>missed {r.missed}</Text>}
        {r.returning && (
          <Tooltip label={'Has missed games but is healthy and a starter on the depth chart'}>
            <Badge colorScheme={'blue'} variant={'subtle'} fontSize={'0.6rem'}>
              Returning
            </Badge>
          </Tooltip>
        )}
      </Box>
    ),
    sortValue: (r) => r.lastWeek,
  },
  { key: 'floor', header: 'Floor', render: (r) => pts(r.floor), sortValue: (r) => r.floor },
  { key: 'hits', header: 'Hit', render: (r) => `${r.hits}/${r.gamesPlayed}`, sortValue: (r) => r.hits / r.gamesPlayed },
  usageCol('snap', 'Snap %', (r) => r.usage?.snap),
  usageCol('target', 'Tgt %', (r) => r.usage?.target),
  usageCol('carry', 'Carry %', (r) => r.usage?.carry),
  usageCol('rz', 'RZ/g', (r) => r.usage?.rzOppsPerGame, false),
  {
    key: 'signal',
    header: 'Signal',
    render: (r) =>
      r.signal ? (
        <Tooltip
          label={`Usage percentile ${Math.round(r.usagePct ?? 0)} · points percentile ${Math.round(r.pointsPct ?? 0)}`}>
          <Badge colorScheme={r.signal === 'buy' ? 'green' : 'orange'} variant={'subtle'}>
            {r.signal === 'buy' ? 'Buy low' : 'Sell high'}
          </Badge>
        </Tooltip>
      ) : null,
    sortValue: (r) => (r.usagePct !== null && r.pointsPct !== null ? r.usagePct - r.pointsPct : -999),
  },
  {
    key: 'next',
    header: 'Next 3',
    minW: '150px',
    render: (r) => (
      <HStack spacing={1}>
        {r.upcoming.map((u) =>
          u.opponent ? (
            <Tooltip
              key={u.week}
              label={`Week ${u.week}: ${u.tier} matchup for a ${r.position}${
                u.rank ? `, #${u.rank} most points allowed` : ''
              }`}>
              <Badge colorScheme={TIER_SCHEME[u.tier || 'neutral']} variant={'subtle'}>
                {u.opponent}
                {u.rank ? (
                  <Text as={'span'} fontWeight={400} opacity={0.8}>
                    {' '}
                    #{u.rank}
                  </Text>
                ) : null}
              </Badge>
            </Tooltip>
          ) : (
            <Badge key={u.week} variant={'outline'} colorScheme={'gray'}>
              BYE
            </Badge>
          )
        )}
      </HStack>
    ),
  },
]

export const PlayerFormTable = ({
  rows,
  hasMine,
  idleAfter,
}: {
  rows: PlayerFormRow[]
  hasMine: boolean
  idleAfter: number
}) => {
  const [position, setPosition] = useState<PositionFilter>('All')
  const [owner, setOwner] = useState<OwnerFilter>('all')
  const [minGames, setMinGames] = useState<number>(1)
  const [search, setSearch] = useState<string>('')
  const [showIdle, setShowIdle] = useState<boolean>(false)
  const effectiveOwner = owner === 'mine' && !hasMine ? 'all' : owner

  const { shown, idleHidden } = useMemo(() => {
    const base = { position, owner: effectiveOwner, minGames, search, idleAfter }
    const withIdle = filterPlayers(rows, { ...base, showIdle: true })
    const visible = showIdle ? withIdle : filterPlayers(rows, { ...base, showIdle: false })
    return { shown: visible, idleHidden: withIdle.length - visible.length }
  }, [rows, position, effectiveOwner, minGames, search, idleAfter, showIdle])

  return (
    <Stack spacing={3}>
      <Stack direction={{ base: 'column', md: 'row' }} spacing={2}>
        <Input
          size={'sm'}
          maxW={{ md: '200px' }}
          color={'quinary'}
          placeholder={'Search players'}
          aria-label={'Search players'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size={'sm'}
          maxW={'140px'}
          color={'quinary'}
          aria-label={'Position'}
          value={position}
          onChange={(e) => setPosition(e.target.value as PositionFilter)}>
          {POSITION_FILTERS.map((p) => (
            <option key={p} value={p} style={{ color: 'black' }}>
              {p === 'All' ? 'All positions' : p}
            </option>
          ))}
        </Select>
        <Select
          size={'sm'}
          maxW={'170px'}
          color={'quinary'}
          aria-label={'Owner'}
          value={effectiveOwner}
          onChange={(e) => setOwner(e.target.value as OwnerFilter)}>
          <option value={'all'} style={{ color: 'black' }}>
            All players
          </option>
          <option value={'fa'} style={{ color: 'black' }}>
            Free agents
          </option>
          <option value={'other'} style={{ color: 'black' }}>
            Other teams
          </option>
          <option value={'mine'} disabled={!hasMine} style={{ color: 'black' }}>
            Mine{hasMine ? '' : ' (pick your team)'}
          </option>
        </Select>
        <Select
          size={'sm'}
          maxW={'150px'}
          color={'quinary'}
          aria-label={'Minimum games'}
          value={minGames}
          onChange={(e) => setMinGames(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n} style={{ color: 'black' }}>
              {n === 1 ? 'Any games' : `${n}+ games`}
            </option>
          ))}
        </Select>
        <Checkbox
          size={'sm'}
          colorScheme={'green'}
          isChecked={showIdle}
          onChange={(e) => setShowIdle(e.target.checked)}>
          <Text fontSize={'xs'}>Include players not playing</Text>
        </Checkbox>
        <Text fontSize={'xs'} alignSelf={'center'}>
          {shown.length} players
          {idleHidden > 0 ? ` (${idleHidden} not playing hidden)` : ''}
        </Text>
      </Stack>
      <SortableTable
        rows={shown}
        rowKey={(r) => r.playerId}
        columns={COLUMNS}
        initialSort={{ key: 'avg', desc: true }}
        pageSize={100}
        isHighlighted={(r) => r.owner.kind === 'mine'}
      />
    </Stack>
  )
}
