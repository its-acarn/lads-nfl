import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Heading,
  HStack,
  NumberInput,
  NumberInputField,
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
  Wrap,
  WrapItem,
} from '@chakra-ui/react'
import { ladsLeagueId2026 } from '../config/config'
import { formConfig } from '../config/form'
import { buildFormBoard } from '../helpers/form/board'
import { FORM_POSITIONS, FormPosition, FormWindow } from '../helpers/form/types'
import { browserStorage, fetchWaiverInputs, getJson } from '../helpers/waivers/fetch'
import { ownerLabel } from '../helpers/waivers/format'
import { latestOnly } from '../helpers/waivers/latest'
import { WaiverInputs } from '../helpers/waivers/types'
import { PlayerFormTable } from '../components/form/PlayerFormTable'
import { PointsAllowedTable } from '../components/form/PointsAllowedTable'
import { TeamFormTable } from '../components/form/TeamFormTable'
import { parseWindow, WindowSelect } from '../components/form/WindowSelect'

// LadsLadsLads only; another league is a change to this one constant.
const LEAGUE_ID = ladsLeagueId2026
const OWNER_KEY = 'form.owner'
const PLAYER_WINDOW_KEY = 'form.window.players'
const ALLOWED_WINDOW_KEY = 'form.window.allowed'

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

const Form = () => {
  const [inputs, setInputs] = useState<WaiverInputs | null>(null)
  const [ownerId, setOwnerId] = useState<string>('')
  const [playerWindow, setPlayerWindow] = useState<FormWindow>(formConfig.defaultWindow)
  const [allowedWindow, setAllowedWindow] = useState<FormWindow>(formConfig.defaultWindow)
  const [hitThresholds, setHitThresholds] = useState<Record<FormPosition, number>>(formConfig.hitThresholds)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    setPlayerWindow(parseWindow(recall(PLAYER_WINDOW_KEY)) ?? formConfig.defaultWindow)
    setAllowedWindow(parseWindow(recall(ALLOWED_WINDOW_KEY)) ?? formConfig.defaultWindow)
  }, [])

  const runLatest = useRef(latestOnly())
  const load = useCallback(() => {
    setLoading(true)
    setError('')
    runLatest.current(fetchWaiverInputs(LEAGUE_ID, { getJson, storage: browserStorage(), now: Date.now() }), {
      onValue: (res) => {
        setInputs(res.inputs)
        const saved = recall(OWNER_KEY)
        setOwnerId(res.inputs.users.some((u) => u.user_id === saved) ? saved : '')
      },
      onError: (e) => setError(e.message),
      onSettled: () => setLoading(false),
    })
  }, [])

  useEffect(() => load(), [load])

  const board = useMemo(
    () =>
      inputs
        ? buildFormBoard(
            inputs,
            { playerWindow, allowedWindow, ownerId: ownerId || undefined },
            { ...formConfig, hitThresholds }
          )
        : null,
    [inputs, playerWindow, allowedWindow, ownerId, hitThresholds]
  )

  const users = inputs ? inputs.users.slice().sort((a, b) => ownerLabel(a).localeCompare(ownerLabel(b))) : []

  return (
    <VStack minH={'100vh'} bg={'primary'} align={'stretch'} spacing={4} px={{ base: 4, md: 8 }} py={6}>
      <Heading size={'lg'}>Form</Heading>
      <Text fontSize={'sm'}>
        Who is scoring, whether the usage backs it up, and who has soft games coming. LadsLadsLads scoring, worked out
        from each player&apos;s raw stats. A player&apos;s window is his last games played, so byes and injuries never
        count as zeros.
      </Text>

      <Select
        maxW={{ md: '320px' }}
        color={'quinary'}
        placeholder={'Pick your team'}
        value={ownerId}
        isDisabled={!inputs}
        onChange={(e) => {
          setOwnerId(e.target.value)
          remember(OWNER_KEY, e.target.value)
        }}>
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id} style={{ color: 'black' }}>
            {ownerLabel(u)}
          </option>
        ))}
      </Select>

      {loading && (
        <HStack py={10} justify={'center'}>
          <Spinner color={'quinary'} />
          <Text color={'quinary'}>Fetching the season from Sleeper...</Text>
        </HStack>
      )}

      {error && !loading && (
        <VStack py={6} spacing={3} align={'flex-start'}>
          <Text color={'red.300'}>{error}</Text>
          <Button size={'sm'} onClick={load}>
            Retry
          </Button>
        </VStack>
      )}

      {board && !loading && !error && (
        <>
          <Text fontSize={'xs'}>
            Stats through week {board.throughWeek}
            {board.upcomingWeek ? ` · next up: week ${board.upcomingWeek}` : ''}
          </Text>

          <Tabs variant={'soft-rounded'} colorScheme={'green'} isLazy>
            <TabList flexWrap={'wrap'} gap={1}>
              <Tab color={'secondary'}>Players</Tab>
              <Tab color={'secondary'}>Points allowed</Tab>
              <Tab color={'secondary'}>Teams</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                <Stack spacing={3}>
                  <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align={{ md: 'center' }}>
                    <WindowSelect
                      label={'Player window'}
                      value={playerWindow}
                      onChange={(w) => {
                        setPlayerWindow(w)
                        remember(PLAYER_WINDOW_KEY, String(w))
                      }}
                    />
                    <Wrap spacing={2} align={'center'}>
                      <WrapItem>
                        <Text fontSize={'xs'}>Hit = a game of at least</Text>
                      </WrapItem>
                      {FORM_POSITIONS.map((p) => (
                        <WrapItem key={p} alignItems={'center'}>
                          <Text fontSize={'xs'} mr={1}>
                            {p}
                          </Text>
                          <NumberInput
                            size={'xs'}
                            maxW={'56px'}
                            min={0}
                            max={60}
                            value={hitThresholds[p]}
                            onChange={(_, n) => !isNaN(n) && setHitThresholds({ ...hitThresholds, [p]: n })}>
                            <NumberInputField color={'quinary'} aria-label={`${p} hit threshold`} />
                          </NumberInput>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Stack>
                  <Text fontSize={'xs'}>
                    Buy low: used more than he has scored, compared with others at his position who have a real role.
                    Sell high: the reverse. Next 3 is coloured by what each opponent allows to the position, over the
                    Points allowed tab&apos;s window.
                  </Text>
                  <PlayerFormTable rows={board.players} hasMine={!!ownerId} />
                </Stack>
              </TabPanel>
              <TabPanel px={0}>
                <Stack spacing={3}>
                  <WindowSelect
                    label={'Points allowed window'}
                    value={allowedWindow}
                    onChange={(w) => {
                      setAllowedWindow(w)
                      remember(ALLOWED_WINDOW_KEY, String(w))
                    }}
                  />
                  <Text fontSize={'xs'}>
                    League points per game each defence has given up to each position over its last games. #1 gives up
                    the most (the softest matchup).
                  </Text>
                  <PointsAllowedTable rows={board.allowed} />
                </Stack>
              </TabPanel>
              <TabPanel px={0}>
                <Stack spacing={3}>
                  <WindowSelect
                    label={'Team form window'}
                    value={playerWindow}
                    onChange={(w) => {
                      setPlayerWindow(w)
                      remember(PLAYER_WINDOW_KEY, String(w))
                    }}
                  />
                  <Text fontSize={'xs'}>
                    The best lineup each roster could field on form (every rostered player, injured or not), by slot.
                    Bench = the best leftover RB, WR and TE added together: depth to trade from. Shares the Players
                    tab&apos;s window.
                  </Text>
                  <TeamFormTable rows={board.teams} />
                </Stack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </>
      )}
    </VStack>
  )
}

export default Form
