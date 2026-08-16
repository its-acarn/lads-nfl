// The live-loop state machine. Pure orchestration: network, disk, and clocks
// arrive injected, so the dry run exercises exactly this code and every
// test is deterministic. Message idempotency is keyed (kind, pickNo) in a
// persistent SentLog — a crashed-and-restarted bot rebuilds from the picks
// feed plus the log and never re-spams.

import { recommend } from './recommend'
import { effectiveLineup, parseLineup } from './needs'
import { assertSupportedDraft, myDraftSlot, myPickNumbers } from './snake'
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
  // Escalation thresholds as fractions of the draft's own pick timer. See
  // DEFAULT_BOT_OPTIONS for why they are where they are.
  escalateFraction1: number
  escalateFraction2: number
}

// A draft that publishes no pick timer is treated as a two-minute clock, which
// is Sleeper's own default and what the lads league uses.
export const DEFAULT_PICK_TIMER = 120

// Poll jitter, as a fraction of the poll interval. Expressed relatively so
// that an accelerated dry run and a live draft poll at the same rate in
// DRAFT time, which is what makes the dry run's call-rate measurement mean
// anything about live.
export const JITTER_FRACTION = 0.15

// Escalation thresholds, as fractions of the pick timer.
//
// These were 1/3 and 3/4 — 40s and 90s on a 120-second clock. The rehearsal
// emitted fourteen STILL OPEN messages across fourteen picks: the first
// threshold fired on EVERY pick. That is not the bot being right, it is the
// threshold being set below the normal cost of the relay. Reading a
// recommendation in chat and acting on it took longer than 40 seconds every
// single time, and the whole draft ran 11:47:24 to 12:05:11 — about 76
// seconds per pick of Andrew's once the instant bots are discounted.
//
// An alert that fires on every pick is not an alert. 0.6 puts the first nudge
// at 72s on a 120s clock: above the relay's normal cost, with 48 seconds still
// left to act. 0.85 puts the second at 102s, leaving 18 — "take anything now".
export const DEFAULT_BOT_OPTIONS: Omit<BotOptions, 'myUserId'> = {
  pollMs: 3000,
  draftEveryNPolls: 5,
  headsUpAt: 3,
  timeScale: 1,
  reachReference: 6,
  simOpts: DEFAULT_SIM_OPTS,
  maxLoops: null,
  escalateFraction1: 0.6,
  escalateFraction2: 0.85,
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
  // A position the board caps at zero is one Andrew has decided never to draft,
  // so its starter slot becomes bench. Without this the slot stays permanently
  // unfilled, forced mode fires on the last picks, the candidate set collapses
  // to a position the cap then rejects entirely, and recommend() falls through
  // to its relax-everything path — arbitrary picks in the final rounds of a
  // live draft. See effectiveLineup in needs.ts.
  const lineup = effectiveLineup(league.roster_positions, board.rules)
  parseLineup(lineup)
  let draft = await deps.feed.getDraft()
  counters.draftFetches++
  assertSupportedDraft(draft)
  const tradedPicks: SleeperTradedPick[] = await deps.feed.getTradedPicks()

  // Resolve the drafter HERE, before the draft starts. myPickNumbers is
  // otherwise first reached inside buildState, which runs inside the poll
  // loop's try — so a wrong user id or an unset draft order surfaces only
  // once picks are landing, and then only as a single bot_error before the
  // loop retries in silence. Failing at LOAD is loud and early.
  const myPicks = myPickNumbers({
    draft,
    tradedPicks,
    myUserId: optsIn.myUserId,
    rosterPositions: lineup,
  })
  if (myPicks.length === 0) {
    throw new Error(`user_id ${optsIn.myUserId} owns no picks in this draft — check config/board.json`)
  }
  // Say what was resolved, before the draft starts. A wrong slot or a
  // misconfigured user id is far cheaper to spot here than at pick one.
  await deps.notifier.send({
    kind: 'loaded',
    slot: myDraftSlot(draft, optsIn.myUserId),
    pickNos: myPicks,
    rounds: draft.settings.rounds,
    teams: draft.settings.teams,
  })

  const pickTimer =
    draft.settings.pick_timer && draft.settings.pick_timer > 0
      ? draft.settings.pick_timer
      : DEFAULT_PICK_TIMER
  const escalateAt1 = Math.round(pickTimer * optsIn.escalateFraction1)
  const escalateAt2 = Math.round(pickTimer * optsIn.escalateFraction2)

  let consecutiveFailures = 0
  let lastStatus = ''
  let onClockPick: number | null = null
  let onClockSince: number | null = null
  let pollCount = 0

  const cfg = (): DraftConfig => ({
    draft,
    tradedPicks,
    myUserId: optsIn.myUserId,
    rosterPositions: lineup,
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

      // While paused, no pick can land, so fetching them is wasted budget —
      // and expensive, because a non-drafting status also forces a draft
      // fetch every loop above. Doing both doubled the call rate at exactly
      // the moment the draft is going nowhere. Announce the pause once, then
      // poll only the draft until it resumes.
      if (draft.status === 'paused') {
        if (lastStatus !== 'paused') {
          await sendOnce(`draft_paused:${counters.picksFetches}`, { kind: 'draft_paused' })
        }
        lastStatus = draft.status
        consecutiveFailures = 0
        await deps.sleep(optsIn.pollMs + Math.round(deps.jitter() * optsIn.pollMs * JITTER_FRACTION))
        continue
      }

      const picks = await deps.feed.getPicks()
      counters.picksFetches++
      const state = buildState(cfg(), picks, board, players)

      // Resume transition. The pause itself is handled above, before the
      // picks fetch, so that a paused draft costs one call per loop and not
      // two.
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
          // Any id in this list was a live single-name instruction at some
          // point during the pick, so taking any of them is a confirmation
          // rather than an override.
          await deps.notifier.send({ kind: 'pick_confirmed', pickNo: n, player: landed })
        } else {
          // The LAST instruction is the one that was standing when the pick
          // landed; naming the first would report a player the bot had
          // already withdrawn.
          const expectedId = instructed[instructed.length - 1]
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
          // One name. A shortlist in a channel Andrew shares tells the other
          // eleven managers what he is thinking.
          await sendOnce(`heads_up:${myNext}`, {
            kind: 'heads_up',
            picksAway,
            myPickNo: myNext,
            shortlist: [rec.primary],
          })
        }

        if (picksAway === 0) {
          // The instruction names exactly one player, so the bot owes Andrew a
          // FRESH one if that player is taken while his pick is still open.
          // Without the fallbacks there is otherwise nowhere to go, and the
          // rehearsal showed every pick taking longer than 42 seconds to
          // relay — long enough for a name to go stale.
          //
          // `on_clock:<pickNo>` accumulates every id issued for the pick, so
          // verification below still recognises whichever one Andrew took;
          // `on_clock:<pickNo>:<playerId>` makes each individual instruction
          // idempotent across polls and restarts.
          const issuedKey = `on_clock:${myNext}`
          const issued = deps.log.get(issuedKey) || []
          const standing = issued.length > 0 ? issued[issued.length - 1] : null
          let standingAvailable = false
          if (standing !== null) {
            for (let i = 0; i < state.pool.length; i++) {
              if (state.pool[i].player_id === standing) {
                standingAvailable = true
                break
              }
            }
          }

          if (standing === null || !standingAvailable) {
            const rec = recommend(state, simOpts)
            const id = rec.primary.player_id
            const key = `${issuedKey}:${id}`
            if (!deps.log.has(key)) {
              await deps.notifier.send({
                kind: 'on_clock',
                pickNo: myNext,
                instruction: rec.primary,
                fallbacks: [],
              })
              await deps.log.set(key)
            }
            // Advance the standing instruction whether or not a message went
            // out. recommend() only ever names an available player, so this
            // guarantees the next poll takes the cheap path above instead of
            // re-running the Monte Carlo simulation for the rest of the pick.
            await deps.log.set(issuedKey, issued.filter((x) => x !== id).concat([id]))
          }

          if (onClockPick !== myNext) {
            // Either the first instruction for this pick, or a restart while
            // on the clock. Either way the stopwatch starts now. A RE-issue
            // does not land here, so the clock survives it: the pick has been
            // open since the first instruction, and restarting on every snipe
            // would push escalation back indefinitely.
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
                  fallbacks: [],
                })
              }
            }
          }
        }
      }

      consecutiveFailures = 0
      // Jitter as a FRACTION of the poll interval, not an absolute 0-500ms.
      // With an absolute jitter the dry run's accelerated pollMs (50ms at
      // speed 60) is swamped by it, so the dry run polls roughly five times
      // less often in draft-time than live does — and its measured call rate
      // understates the live rate by the same factor.
      await deps.sleep(optsIn.pollMs + Math.round(deps.jitter() * optsIn.pollMs * JITTER_FRACTION))
    } catch (err) {
      consecutiveFailures++
      // Every fifth consecutive failure, not only the fifth. A permanent
      // fault — a bad user id, a shape the parser rejects — otherwise emits
      // one message and then retries in silence for the rest of the draft,
      // which looks exactly like a healthy bot with nothing to say.
      if (consecutiveFailures % 5 === 0) {
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
