// The live-loop state machine. Pure orchestration: network, disk, and clocks
// arrive injected, so the dry run exercises exactly this code and every
// test is deterministic. Message idempotency is keyed (kind, pickNo) in a
// persistent SentLog — a crashed-and-restarted bot rebuilds from the picks
// feed plus the log and never re-spams.

import { recommend } from './recommend'
import { parseLineup } from './needs'
import { assertSupportedDraft } from './snake'
import { buildState, nameOfPick } from './state'
import { computeReachScale, DEFAULT_SIM_OPTS } from './survival'
import {
  BoardState,
  DraftConfig,
  DraftMessage,
  Notifier,
  PlayerMap,
  Position,
  Recommendation,
  ResolvedBoard,
  Scored,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
  SimOpts,
} from './types'

export interface Feed {
  getLeague(): Promise<SleeperLeague>
  getDraft(): Promise<SleeperDraft>
  getPicks(): Promise<SleeperPick[]>
  getTradedPicks(): Promise<SleeperTradedPick[]>
}

export interface SentLog {
  has(key: string): boolean
  get(key: string): string[] | null
  set(key: string, payload?: string[]): Promise<void>
}

export interface BotOptions {
  myUserId: string
  pollMs: number // base poll interval (default 3000)
  draftEveryNPolls: number // draft status refresh cadence (default 5)
  headsUpAt: number // heads-up when my pick is <= this many away
  timeScale: number // draft-seconds per wall-second (dry-run acceleration)
  reachReference: number // reference displacement for reach calibration
  simOpts: SimOpts
  maxLoops: number | null // safety valve for tests; null = run forever
}

export const DEFAULT_BOT_OPTIONS: Omit<BotOptions, 'myUserId'> = {
  pollMs: 3000,
  draftEveryNPolls: 5,
  headsUpAt: 3,
  timeScale: 1,
  reachReference: 6,
  simOpts: DEFAULT_SIM_OPTS,
  maxLoops: null,
}

export interface BotDeps {
  feed: Feed
  notifier: Notifier
  log: SentLog
  sleep(ms: number): Promise<void>
  now(): number // wall clock ms
  jitter(): number // 0..1, poll jitter source (kept out of the engine's RNG)
}

interface BotCounters {
  picksFetches: number
  draftFetches: number
  loops: number
}

export interface BotResult {
  completed: boolean
  counters: BotCounters
}

function scoredRef(pick: SleeperPick, players: PlayerMap, pos: Position): Scored {
  return {
    player_id: pick.player_id,
    name: nameOfPick(pick, players),
    pos,
    team: (players[pick.player_id] && players[pick.player_id].team) || null,
    value: 0,
    offBoard: !players[pick.player_id],
    score: 0,
    survivalToNextPct: null,
    rationale: [],
  }
}

function rosterSummary(state: BoardState, players: PlayerMap): string {
  const byPos: Record<string, string[]> = {}
  for (let i = 0; i < state.myRosterIds.length; i++) {
    const id = state.myRosterIds[i]
    const p = players[id]
    const pos = p ? p.position : '??'
    const name = p ? p.full_name || id : id
    if (!byPos[pos]) byPos[pos] = []
    byPos[pos].push(name)
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '??']
  const lines: string[] = []
  for (let i = 0; i < order.length; i++) {
    if (byPos[order[i]]) lines.push(`${order[i]}: ${byPos[order[i]].join(', ')}`)
  }
  return lines.join('\n')
}

export async function runBot(
  board: ResolvedBoard,
  players: PlayerMap,
  optsIn: BotOptions,
  deps: BotDeps
): Promise<BotResult> {
  const counters: BotCounters = { picksFetches: 0, draftFetches: 0, loops: 0 }

  // ---- LOAD: hard errors here, not mid-draft ------------------------------
  const league = await deps.feed.getLeague()
  parseLineup(league.roster_positions)
  let draft = await deps.feed.getDraft()
  counters.draftFetches++
  assertSupportedDraft(draft)
  const tradedPicks: SleeperTradedPick[] = await deps.feed.getTradedPicks()

  const pickTimer =
    draft.settings.pick_timer && draft.settings.pick_timer > 0 ? draft.settings.pick_timer : 120
  const escalateAt1 = Math.round(pickTimer / 3)
  const escalateAt2 = Math.round(pickTimer * 0.75)

  let consecutiveFailures = 0
  let lastStatus = ''
  let onClockPick: number | null = null
  let onClockSince: number | null = null
  let pollCount = 0

  const cfg = (): DraftConfig => ({
    draft,
    tradedPicks,
    myUserId: optsIn.myUserId,
    rosterPositions: league.roster_positions,
  })

  const sendOnce = async (key: string, msg: DraftMessage, payload?: string[]): Promise<boolean> => {
    if (deps.log.has(key)) return false
    await deps.notifier.send(msg)
    await deps.log.set(key, payload)
    return true
  }

  for (;;) {
    counters.loops++
    if (optsIn.maxLoops !== null && counters.loops > optsIn.maxLoops) {
      return { completed: false, counters }
    }
    try {
      pollCount++
      if (pollCount === 1 || pollCount % optsIn.draftEveryNPolls === 0 || draft.status !== 'drafting') {
        draft = await deps.feed.getDraft()
        counters.draftFetches++
      }

      if (draft.status === 'pre_draft') {
        await deps.sleep(optsIn.pollMs * 2)
        continue
      }

      const picks = await deps.feed.getPicks()
      counters.picksFetches++
      const state = buildState(cfg(), picks, board, players)

      // Pause / resume transitions, keyed by picks-made so a restart during
      // the same pause does not re-announce.
      if (draft.status === 'paused' && lastStatus !== 'paused') {
        await sendOnce(`draft_paused:${picks.length}`, { kind: 'draft_paused' })
      }
      if (draft.status === 'drafting' && lastStatus === 'paused') {
        await sendOnce(`draft_resumed:${picks.length}`, { kind: 'draft_resumed' })
      }
      lastStatus = draft.status

      // ---- verify my landed picks -----------------------------------------
      for (let i = 0; i < state.myPickNos.length; i++) {
        const n = state.myPickNos[i]
        const pick = state.picksByNo[n]
        if (!pick || deps.log.has(`verify:${n}`)) continue
        const instructed = deps.log.get(`on_clock:${n}`)
        if (!instructed) {
          // Pick predates the bot (started mid-draft): acknowledge silently.
          await deps.log.set(`verify:${n}`)
          continue
        }
        const pos = players[pick.player_id]
          ? players[pick.player_id].position
          : (((pick.metadata && pick.metadata.position) || 'RB') as Position)
        const landed = scoredRef(pick, players, pos)
        if (instructed.indexOf(pick.player_id) !== -1) {
          await deps.notifier.send({ kind: 'pick_confirmed', pickNo: n, player: landed })
        } else {
          const expectedId = instructed[0]
          const expected: Scored = {
            player_id: expectedId,
            name: players[expectedId] ? players[expectedId].full_name || expectedId : expectedId,
            pos: players[expectedId] ? players[expectedId].position : pos,
            team: players[expectedId] ? players[expectedId].team : null,
            value: 0,
            offBoard: false,
            score: 0,
            survivalToNextPct: null,
            rationale: [],
          }
          await deps.notifier.send({ kind: 'pick_mismatch', pickNo: n, expected, actual: landed })
        }
        await deps.log.set(`verify:${n}`)
        if (onClockPick === n) {
          onClockPick = null
          onClockSince = null
        }
      }

      // ---- complete? -------------------------------------------------------
      if (draft.status === 'complete' || state.currentPickNo > state.totalPicks) {
        await sendOnce(`draft_complete`, {
          kind: 'draft_complete',
          rosterSummary: rosterSummary(state, players),
        })
        return { completed: true, counters }
      }

      if (draft.status === 'drafting' && state.myRemainingPickNos.length > 0) {
        const myNext = state.myRemainingPickNos[0]
        const picksAway = myNext - state.currentPickNo
        const simOpts: SimOpts = {
          ...optsIn.simOpts,
          reachScale: computeReachScale(picks, players, optsIn.reachReference),
        }

        if (picksAway > 0 && picksAway <= optsIn.headsUpAt && !deps.log.has(`heads_up:${myNext}`)) {
          const rec: Recommendation = recommend(state, simOpts)
          await sendOnce(`heads_up:${myNext}`, {
            kind: 'heads_up',
            picksAway,
            myPickNo: myNext,
            shortlist: [rec.primary].concat(rec.fallbacks),
          })
        }

        if (picksAway === 0) {
          if (!deps.log.has(`on_clock:${myNext}`)) {
            const rec = recommend(state, simOpts)
            const ids = [rec.primary.player_id].concat(rec.fallbacks.map((f) => f.player_id))
            await sendOnce(
              `on_clock:${myNext}`,
              { kind: 'on_clock', pickNo: myNext, instruction: rec.primary, fallbacks: rec.fallbacks },
              ids
            )
            onClockPick = myNext
            onClockSince = deps.now()
          } else if (onClockPick !== myNext) {
            // Restarted while on the clock: restart the stopwatch.
            onClockPick = myNext
            onClockSince = deps.now()
          }

          if (onClockPick === myNext && onClockSince !== null) {
            const elapsed = ((deps.now() - onClockSince) / 1000) * optsIn.timeScale
            const escalations: [number, number][] = [
              [1, escalateAt1],
              [2, escalateAt2],
            ]
            for (let e = 0; e < escalations.length; e++) {
              const key = `escalation:${myNext}:${escalations[e][0]}`
              if (elapsed >= escalations[e][1] && !deps.log.has(key)) {
                const rec = recommend(state, simOpts)
                await sendOnce(key, {
                  kind: 'escalation',
                  pickNo: myNext,
                  secondsElapsed: Math.round(elapsed),
                  instruction: rec.primary,
                  fallbacks: rec.fallbacks,
                })
              }
            }
          }
        }
      }

      consecutiveFailures = 0
      await deps.sleep(optsIn.pollMs + Math.round(deps.jitter() * 500))
    } catch (err) {
      consecutiveFailures++
      if (consecutiveFailures === 5) {
        try {
          await deps.notifier.send({
            kind: 'bot_error',
            message: err instanceof Error ? err.message : String(err),
            consecutiveFailures,
          })
        } catch (notifyErr) {
          // Even the notifier failing must not kill the loop.
        }
      }
      const backoff = Math.min(30000, 2000 * Math.pow(2, Math.min(consecutiveFailures - 1, 4)))
      await deps.sleep(backoff)
    }
  }
}
