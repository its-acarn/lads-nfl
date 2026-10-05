import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Heading,
  HStack,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react'
import { flexiLeagueId2026, ladsLeagueId2026 } from '../config/config'
import { waiverConfig } from '../config/waivers'
import { buildWaiverBoard } from '../helpers/waivers/board'
import { browserStorage, fetchWaiverInputs, getJson } from '../helpers/waivers/fetch'
import { ownerLabel } from '../helpers/waivers/format'
import { latestOnly } from '../helpers/waivers/latest'
import { POSITIONS, WaiverInputs } from '../helpers/waivers/types'
import InjuryAlerts from '../components/waivers/InjuryAlerts'
import { PositionTable, StreamTable } from '../components/waivers/PositionTable'

const LEAGUES = [
  { id: ladsLeagueId2026, label: 'LadsLadsLads 2026' },
  { id: flexiLeagueId2026, label: 'Flexi 2026' },
]
const LEAGUE_KEY = 'waivers.league'
const ownerKey = (leagueId: string) => `waivers.owner.${leagueId}`

// Remembered selections are a convenience; blocked storage just forgets them.
function remember(key: string, value: string) {
  try {
    browserStorage()?.setItem(key, value)
  } catch (e) {}
}
function recall(key: string): string {
  try {
    return browserStorage()?.getItem(key) || ''
  } catch (e) {
    return ''
  }
}

const Waivers = () => {
  const [leagueId, setLeagueId] = useState<string>('')
  const [ownerId, setOwnerId] = useState<string>('')
  const [inputs, setInputs] = useState<WaiverInputs | null>(null)
  const [playersSavedAt, setPlayersSavedAt] = useState<number>(0)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    const saved = recall(LEAGUE_KEY)
    setLeagueId(LEAGUES.some((l) => l.id === saved) ? saved : LEAGUES[0].id)
  }, [])

  // Only the latest league's response may land (see helpers/waivers/latest.ts).
  const runLatest = useRef(latestOnly())
  const load = useCallback((id: string) => {
    setLoading(true)
    setError('')
    runLatest.current(fetchWaiverInputs(id, { getJson, storage: browserStorage(), now: Date.now() }), {
      onValue: (res) => {
        setInputs(res.inputs)
        setPlayersSavedAt(res.playersSavedAt)
        const saved = recall(ownerKey(id))
        setOwnerId(res.inputs.users.some((u) => u.user_id === saved) ? saved : '')
      },
      onError: (e) => setError(e.message),
      onSettled: () => setLoading(false),
    })
  }, [])

  useEffect(() => {
    if (leagueId) load(leagueId)
  }, [leagueId, load])

  const board = useMemo(
    () => (inputs ? buildWaiverBoard(inputs, waiverConfig, ownerId || undefined) : null),
    [inputs, ownerId]
  )

  const users = inputs ? inputs.users.slice().sort((a, b) => ownerLabel(a).localeCompare(ownerLabel(b))) : []

  return (
    <VStack minH={'100vh'} bg={'primary'} align={'stretch'} spacing={4} px={{ base: 4, md: 8 }} py={6}>
      <Heading size={'lg'}>Waiver scout</Heading>
      <Text fontSize={'sm'}>
        Free agents ranked by how they are being used: snap, target and carry share, red-zone work, air yards, the trend in
        each, and the offence around them. No projections. Click a score to see how it was built.
      </Text>

      <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
        <Select
          maxW={{ md: '260px' }}
          color={'quinary'}
          value={leagueId}
          onChange={(e) => {
            setInputs(null)
            setLeagueId(e.target.value)
            remember(LEAGUE_KEY, e.target.value)
          }}>
          {LEAGUES.map((l) => (
            <option key={l.id} value={l.id} style={{ color: 'black' }}>
              {l.label}
            </option>
          ))}
        </Select>
        <Select
          maxW={{ md: '320px' }}
          color={'quinary'}
          placeholder={'Pick your team (optional)'}
          value={ownerId}
          isDisabled={!inputs}
          onChange={(e) => {
            setOwnerId(e.target.value)
            remember(ownerKey(leagueId), e.target.value)
          }}>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id} style={{ color: 'black' }}>
              {ownerLabel(u)}
            </option>
          ))}
        </Select>
      </Stack>

      {loading && (
        <HStack py={10} justify={'center'}>
          <Spinner color={'quinary'} />
          <Text color={'quinary'}>Fetching this week from Sleeper...</Text>
        </HStack>
      )}

      {error && !loading && (
        <VStack py={6} spacing={3} align={'flex-start'}>
          <Text color={'red.300'}>{error}</Text>
          <Button size={'sm'} onClick={() => load(leagueId)}>
            Retry
          </Button>
        </VStack>
      )}

      {board && !loading && !error && (
        <>
          <Text fontSize={'xs'}>
            Stats through week {board.throughWeek}
            {board.upcomingWeek ? ` · picking up for week ${board.upcomingWeek}` : ''} · player data updated{' '}
            {new Date(playersSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>

          <InjuryAlerts alerts={board.alerts} />

          <Tabs variant={'soft-rounded'} colorScheme={'green'} isLazy>
            <TabList flexWrap={'wrap'} gap={1}>
              {POSITIONS.map((p) => (
                <Tab key={p} color={'secondary'}>
                  {p}
                </Tab>
              ))}
              {board.kickers && <Tab color={'secondary'}>K</Tab>}
              {board.defences && <Tab color={'secondary'}>DEF</Tab>}
            </TabList>
            <TabPanels>
              {POSITIONS.map((p) => (
                <TabPanel key={p} px={0}>
                  <PositionTable position={p} rows={board.positions[p]} />
                </TabPanel>
              ))}
              {board.kickers && (
                <TabPanel px={0}>
                  <StreamTable rows={board.kickers} />
                </TabPanel>
              )}
              {board.defences && (
                <TabPanel px={0}>
                  <StreamTable rows={board.defences} />
                </TabPanel>
              )}
            </TabPanels>
          </Tabs>
        </>
      )}
    </VStack>
  )
}

export default Waivers
