// Deterministic state-machine test: runBot driven by a fake feed and fake
// clock over the real lads/2024 fixture. Asserts the exact message
// discipline the plan requires — heads-up once per pick, on-clock exactly on
// turn, escalations from the local stopwatch, verify after every one of my
// picks, a completion summary, and a crash-restart that never re-spams.

import { describe, expect, it } from 'vitest'
import { runBot, BotOptions, DEFAULT_BOT_OPTIONS, DEFAULT_PICK_TIMER, Feed, SentLog } from './bot'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { buildMarketFixture, userForSlot } from './marketBoard'
import { DEFAULT_SIM_OPTS } from './survival'
import { DraftMessage, Notifier, SleeperDraft, SleeperPick } from './types'

const fx = loadFixture('lads', '2024')
const realPlayers = loadTrimmedPlayers()
const SLOT = 1
const ME = userForSlot(fx.draft, SLOT)
const market = buildMarketFixture(fx.draft, fx.picks, realPlayers, ME)
const sorted = fx.picks.slice().sort((a, b) => a.pick_no - b.pick_no)

// Tick-driven fake: each sleep() advances one tick; one pick releases per
// tick, except my picks which stall STALL_TICKS extra so escalations fire.
// now() runs at 20 draft-seconds per tick against a 120s pick timer:
// escalation 1 at 0.6 x 120 = 72s (tick 4), escalation 2 at 0.85 x 120 = 102s
// (tick 6). The stall must therefore outlast 102s for both to fire.
const MS_PER_TICK = 20000
const STALL_TICKS = 7
const ESCALATE_1_SECONDS = 72
const ESCALATE_2_SECONDS = 102

class FakeClock {
  tick = 0
}

class FakeFeed implements Feed {
  constructor(private clock: FakeClock, private stallMine: boolean) {}

  private releaseTick(p: SleeperPick, index: number): number {
    const base = index + 1
    return this.stallMine && p.draft_slot === SLOT ? base + STALL_TICKS : base
  }

  getLeague() {
    return Promise.resolve(fx.league)
  }
  getDraft() {
    const done = this.releasedCount() >= sorted.length
    return Promise.resolve({ ...fx.draft, status: done ? 'complete' : 'drafting' })
  }
  getPicks() {
    const out: SleeperPick[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (this.releaseTick(sorted[i], i) <= this.clock.tick) out.push(sorted[i])
    }
    return Promise.resolve(out)
  }
  getTradedPicks() {
    return Promise.resolve(fx.tradedPicks)
  }
  private releasedCount(): number {
    let n = 0
    for (let i = 0; i < sorted.length; i++) {
      if (this.releaseTick(sorted[i], i) <= this.clock.tick) n++
    }
    return n
  }
}

class MemoryLog implements SentLog {
  data: Record<string, string[] | undefined> = {}
  keys: string[] = []
  has(key: string): boolean {
    return key in this.data
  }
  get(key: string): string[] | null {
    return this.data[key] || null
  }
  set(key: string, ids?: string[]): Promise<void> {
    if (!(key in this.data)) this.keys.push(key)
    this.data[key] = ids
    return Promise.resolve()
  }
}

class CollectingNotifier implements Notifier {
  messages: DraftMessage[] = []
  send(msg: DraftMessage): Promise<void> {
    this.messages.push(msg)
    return Promise.resolve()
  }
}

function makeOpts(): BotOptions {
  return {
    ...DEFAULT_BOT_OPTIONS,
    myUserId: ME,
    pollMs: 1,
    simOpts: { ...DEFAULT_SIM_OPTS, sims: 150 },
    maxLoops: 2000,
  }
}

async function runOnce(log: MemoryLog, stallMine: boolean) {
  const clock = new FakeClock()
  const feed = new FakeFeed(clock, stallMine)
  const notifier = new CollectingNotifier()
  const result = await runBot(market.board, market.players, makeOpts(), {
    feed,
    notifier,
    log,
    sleep: () => {
      clock.tick++
      return Promise.resolve()
    },
    now: () => clock.tick * MS_PER_TICK,
    jitter: () => 0,
  })
  return { result, notifier }
}

describe('runBot end-to-end over lads/2024', () => {
  it('follows the full message discipline and completes', async () => {
    const log = new MemoryLog()
    const { result, notifier } = await runOnce(log, true)
    expect(result.completed).toBe(true)

    const myPickNos = sorted.filter((p) => p.draft_slot === SLOT).map((p) => p.pick_no)
    const byKind = (k: string) => notifier.messages.filter((m) => m.kind === k)

    // Heads-up exactly once per pick that HAS an approach window: pick 1
    // starts on the clock, and the second pick of a back-to-back snake turn
    // (25 after 24) goes straight to on-clock the moment the first lands.
    const headsUp = byKind('heads_up') as Extract<DraftMessage, { kind: 'heads_up' }>[]
    const withWindow = myPickNos.filter((n) => n !== 1 && myPickNos.indexOf(n - 1) === -1)
    expect(headsUp.map((m) => m.myPickNo)).toEqual(withWindow)

    // On-clock exactly once per my pick, in order.
    const onClock = byKind('on_clock') as Extract<DraftMessage, { kind: 'on_clock' }>[]
    expect(onClock.map((m) => m.pickNo)).toEqual(myPickNos)

    // Stalled picks trigger both escalations, each exactly once. Only picks
    // that OPEN a turn stay on the clock long enough: the stall is anchored
    // to the pick's base slot, so the second pick of a back-to-back turn
    // lands one tick after its on-clock and never reaches 40s.
    const esc = byKind('escalation') as Extract<DraftMessage, { kind: 'escalation' }>[]
    const turnOpeners = myPickNos.filter((n) => myPickNos.indexOf(n - 1) === -1)
    for (let i = 0; i < myPickNos.length; i++) {
      const forPick = esc.filter((m) => m.pickNo === myPickNos[i])
      if (turnOpeners.indexOf(myPickNos[i]) !== -1) {
        expect(forPick.length, `pick ${myPickNos[i]}`).toBe(2)
        expect(forPick[0].secondsElapsed).toBeGreaterThanOrEqual(ESCALATE_1_SECONDS)
        expect(forPick[1].secondsElapsed).toBeGreaterThanOrEqual(ESCALATE_2_SECONDS)
      } else {
        expect(forPick.length, `pick ${myPickNos[i]}`).toBe(0)
      }
    }

    // Every one of my picks is verified: confirmed or mismatch, never both.
    const confirmed = byKind('pick_confirmed') as Extract<DraftMessage, { kind: 'pick_confirmed' }>[]
    const mismatched = byKind('pick_mismatch') as Extract<DraftMessage, { kind: 'pick_mismatch' }>[]
    const verifiedPickNos = confirmed
      .map((m) => m.pickNo)
      .concat(mismatched.map((m) => m.pickNo))
      .sort((a, b) => a - b)
    expect(verifiedPickNos).toEqual(myPickNos)

    // Verify outcomes are truthful: confirmed iff the landed player was in
    // the instruction (primary or fallback).
    for (let i = 0; i < myPickNos.length; i++) {
      const n = myPickNos[i]
      const instructed = log.get(`on_clock:${n}`)!
      const landed = sorted.filter((p) => p.pick_no === n)[0].player_id
      const wasConfirmed = confirmed.some((m) => m.pickNo === n)
      expect(wasConfirmed).toBe(instructed.indexOf(landed) !== -1)
    }

    // Exactly one completion message carrying the roster summary.
    const complete = byKind('draft_complete') as Extract<DraftMessage, { kind: 'draft_complete' }>[]
    expect(complete.length).toBe(1)
    expect(complete[0].rosterSummary).toContain('QB:')
    expect(byKind('bot_error').length).toBe(0)
  }, 120000)

  it('kill -9 mid-draft + restart produces zero duplicate messages', async () => {
    // First run: hard-capped loops simulate the crash.
    const log = new MemoryLog()
    const clock = new FakeClock()
    const feed = new FakeFeed(clock, false)
    const first = new CollectingNotifier()
    const opts = makeOpts()
    opts.maxLoops = 60 // dies mid-draft
    await runBot(market.board, market.players, opts, {
      feed,
      notifier: first,
      log,
      sleep: () => {
        clock.tick++
        return Promise.resolve()
      },
      now: () => clock.tick * MS_PER_TICK,
      jitter: () => 0,
    })
    expect(first.messages.length).toBeGreaterThan(0)

    // Restart with the SAME sent-log (fresh feed clock, like a real restart).
    const { result, notifier: second } = await runOnce(log, false)
    expect(result.completed).toBe(true)

    const keyOf = (m: DraftMessage): string =>
      'pickNo' in m ? `${m.kind}:${m.pickNo}` : 'myPickNo' in m ? `${m.kind}:${m.myPickNo}` : m.kind
    const seen: Record<string, number> = {}
    const all = first.messages.concat(second.messages)
    for (let i = 0; i < all.length; i++) {
      const k = keyOf(all[i])
      seen[k] = (seen[k] || 0) + 1
    }
    // 'loaded' is a startup banner, not an idempotent per-pick message: a
    // restart SHOULD re-announce the slot and pick numbers, because the whole
    // point of it is to confirm the configuration each time the bot comes up.
    // Escalations likewise repeat by design.
    const dupes = Object.keys(seen).filter(
      (k) => seen[k] > 1 && k.indexOf('escalation') === -1 && k.indexOf('loaded') === -1
    )
    expect(dupes).toEqual([])
  }, 120000)
})

// M7: the instruction names exactly one player, so the bot owes a fresh one
// when that player is taken while the pick is still open. Without the
// fallbacks there is nowhere else to go, and the rehearsal showed every pick
// taking longer than 42 seconds to relay — long enough for a name to go stale.
describe('re-instruction when the named player is sniped', () => {
  // Pick 1 belongs to slot 1 and is on the clock from the first poll. The feed
  // holds it open and, once the bot has named someone, releases a pick at
  // pick_no 2 that takes them — the state the bot has to handle: my pick still
  // open, the player I was told to take gone.
  class SnipingFeed implements Feed {
    sniped: string | null = null
    constructor(private instructedSoFar: () => string | null) {}

    getLeague() {
      return Promise.resolve(fx.league)
    }
    getDraft() {
      return Promise.resolve({ ...fx.draft, status: 'drafting' })
    }
    getPicks(): Promise<SleeperPick[]> {
      const out: SleeperPick[] = []
      if (this.sniped === null) {
        const named = this.instructedSoFar()
        if (named !== null) this.sniped = named
      }
      if (this.sniped !== null) {
        // Another team takes him. Pick 1 stays unfilled, so it is still mine
        // and still on the clock.
        out.push({
          pick_no: 2,
          round: 1,
          draft_slot: 2,
          player_id: this.sniped,
          picked_by: 'someone-else',
          roster_id: 2,
          metadata: {},
        } as SleeperPick)
      }
      return Promise.resolve(out)
    }
    getTradedPicks() {
      return Promise.resolve(fx.tradedPicks)
    }
  }

  async function runSniped(log: MemoryLog, maxLoops: number) {
    const notifier = new CollectingNotifier()
    const lastInstructed = (): string | null => {
      const onClock = notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
        DraftMessage,
        { kind: 'on_clock' }
      >[]
      return onClock.length > 0 ? onClock[onClock.length - 1].instruction.player_id : null
    }
    const feed = new SnipingFeed(lastInstructed)
    const clock = new FakeClock()
    const opts = makeOpts()
    opts.maxLoops = maxLoops
    await runBot(market.board, market.players, opts, {
      feed,
      notifier,
      log,
      sleep: () => {
        clock.tick++
        return Promise.resolve()
      },
      now: () => clock.tick * MS_PER_TICK,
      jitter: () => 0,
    })
    return { notifier, feed }
  }

  it('issues a second instruction naming a different, available player', async () => {
    const log = new MemoryLog()
    const { notifier, feed } = await runSniped(log, 12)
    const onClock = notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
      DraftMessage,
      { kind: 'on_clock' }
    >[]

    expect(feed.sniped, 'the feed should have taken the first instruction').not.toBe(null)
    expect(onClock.length).toBeGreaterThanOrEqual(2)
    expect(onClock[0].pickNo).toBe(1)
    expect(onClock[1].pickNo).toBe(1)
    expect(onClock[1].instruction.player_id).not.toBe(onClock[0].instruction.player_id)
    // The replacement is someone the sniper did not take.
    expect(onClock[1].instruction.player_id).not.toBe(feed.sniped)
  }, 60000)

  it('re-instructs once, not on every poll', async () => {
    const log = new MemoryLog()
    const { notifier } = await runSniped(log, 30)
    const onClock = notifier.messages.filter((m) => m.kind === 'on_clock')
    // One original + one replacement. The feed snipes only the first name, so
    // the second stands for the rest of the run however many times it polls.
    expect(onClock.length).toBe(2)
  }, 60000)

  it('carries no alternatives on either instruction', async () => {
    const log = new MemoryLog()
    const { notifier } = await runSniped(log, 12)
    const onClock = notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
      DraftMessage,
      { kind: 'on_clock' }
    >[]
    for (let i = 0; i < onClock.length; i++) {
      expect(onClock[i].fallbacks).toEqual([])
    }
  }, 60000)

  it('accumulates every issued name, so taking either one confirms the pick', async () => {
    const log = new MemoryLog()
    const { notifier } = await runSniped(log, 12)
    const onClock = notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
      DraftMessage,
      { kind: 'on_clock' }
    >[]
    const issued = log.get('on_clock:1')!
    expect(issued.length).toBe(onClock.length)
    for (let i = 0; i < onClock.length; i++) {
      expect(issued.indexOf(onClock[i].instruction.player_id)).toBeGreaterThanOrEqual(0)
    }
  }, 60000)

  it('a restart mid-pick does not repeat an instruction already issued', async () => {
    const log = new MemoryLog()
    const firstRun = await runSniped(log, 12)
    const firstNames = (firstRun.notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
      DraftMessage,
      { kind: 'on_clock' }
    >[]).map((m) => m.instruction.player_id)

    // Same sent-log, fresh process: the standing instruction is still
    // available, so the bot must say nothing new about pick 1.
    const secondRun = await runSniped(log, 12)
    const secondNames = (secondRun.notifier.messages.filter((m) => m.kind === 'on_clock') as Extract<
      DraftMessage,
      { kind: 'on_clock' }
    >[]).map((m) => m.instruction.player_id)

    expect(firstNames.length).toBeGreaterThanOrEqual(2)
    expect(secondNames).toEqual([])
  }, 60000)
})

// M8: an alert that fires on every pick is not an alert. The rehearsal emitted
// fourteen STILL OPEN messages across fourteen picks — the first threshold, at
// a third of the pick timer, fired every single time, because reading a
// recommendation in chat and acting on it costs more than 40 seconds.
describe('escalation thresholds track the draft\'s own pick timer', () => {
  const timerOf = (seconds: number | undefined): SleeperDraft => ({
    ...fx.draft,
    settings: { ...fx.draft.settings, pick_timer: seconds },
  })

  // A finer clock than the end-to-end test's 20-second ticks: escalation is
  // observed on the first poll AT OR PAST its threshold, so a coarse tick
  // quantises the reported time well above it and hides where the threshold
  // actually sits. Live polling is 3s, so 5s here is the realistic case.
  const FINE_MS_PER_TICK = 5000

  // Drives one stalled pick and reports when each escalation fired.
  async function escalationTimes(draft: SleeperDraft, opts?: Partial<BotOptions>): Promise<number[]> {
    class OneStalledPick implements Feed {
      constructor(private clock: FakeClock) {}
      getLeague() {
        return Promise.resolve(fx.league)
      }
      getDraft() {
        return Promise.resolve({ ...draft, status: 'drafting' })
      }
      getPicks(): Promise<SleeperPick[]> {
        return Promise.resolve([]) // pick 1 is mine and never lands
      }
      getTradedPicks() {
        return Promise.resolve(fx.tradedPicks)
      }
    }
    const clock = new FakeClock()
    const notifier = new CollectingNotifier()
    const botOpts: BotOptions = { ...makeOpts(), maxLoops: 120, ...opts }
    await runBot(market.board, market.players, botOpts, {
      feed: new OneStalledPick(clock),
      notifier,
      log: new MemoryLog(),
      sleep: () => {
        clock.tick++
        return Promise.resolve()
      },
      now: () => clock.tick * FINE_MS_PER_TICK,
      jitter: () => 0,
    })
    return (notifier.messages.filter((m) => m.kind === 'escalation') as Extract<
      DraftMessage,
      { kind: 'escalation' }
    >[]).map((m) => m.secondsElapsed)
  }

  it('on a 120-second timer the first nudge lands after 42s and before the clock expires', async () => {
    const times = await escalationTimes(timerOf(120))
    expect(times.length).toBeGreaterThanOrEqual(1)
    // The rehearsal's first escalation fired at ~42s, on every pick.
    expect(times[0]).toBeGreaterThan(42)
    expect(times[0]).toBeLessThan(120)
  }, 60000)

  it('both nudges land inside the clock, in order', async () => {
    const times = await escalationTimes(timerOf(120))
    expect(times.length).toBe(2)
    expect(times[0]).toBeLessThan(times[1])
    expect(times[1]).toBeLessThan(120)
  }, 60000)

  it('scales with the timer rather than sitting at fixed seconds', async () => {
    const fast = await escalationTimes(timerOf(30))
    const slow = await escalationTimes(timerOf(240))
    expect(fast[0]).toBeLessThan(slow[0])
    expect(fast[0]).toBeLessThan(30)
    expect(slow[0]).toBeLessThan(240)
  }, 60000)

  it('a draft with no timer falls back to a two-minute clock', async () => {
    const none = await escalationTimes(timerOf(undefined))
    const explicit = await escalationTimes(timerOf(DEFAULT_PICK_TIMER))
    expect(none).toEqual(explicit)
  }, 60000)

  // The defect, stated as a test: the OLD fractions fire on a pick that the
  // relay handles at its normal pace; the new ones do not.
  it('a pick relayed at the rehearsal\'s pace no longer trips the first nudge', async () => {
    // ~55 draft-seconds of relay: slower than the old 40s threshold, faster
    // than the observed ~76s average, so it is a pick that went WELL.
    const RELAY_SECONDS = 55
    const loops = Math.ceil(RELAY_SECONDS / (FINE_MS_PER_TICK / 1000))

    const old = await escalationTimes(timerOf(120), {
      maxLoops: loops,
      escalateFraction1: 1 / 3,
      escalateFraction2: 0.75,
    })
    const now = await escalationTimes(timerOf(120), { maxLoops: loops })

    expect(old.length, 'the old thresholds cried wolf').toBeGreaterThan(0)
    expect(now.length, 'the new thresholds stay quiet').toBe(0)
  }, 60000)
})

describe('failure paths', () => {
  // Previously untested, and the reason a real fault could go unnoticed:
  // consecutiveFailures === 5 fired exactly once, so a permanent error
  // produced one message and then thirty-second silence for the rest of the
  // draft — indistinguishable from a healthy bot with nothing to say.
  class BrokenFeed implements Feed {
    getLeague() {
      return Promise.resolve(fx.league)
    }
    getDraft() {
      return Promise.resolve({ ...fx.draft, status: 'drafting' })
    }
    getPicks(): Promise<SleeperPick[]> {
      return Promise.reject(new Error('sleeper is down'))
    }
    getTradedPicks() {
      return Promise.resolve(fx.tradedPicks)
    }
  }

  it('keeps reporting a permanent failure, not just the first one', async () => {
    const notifier = new CollectingNotifier()
    const opts = makeOpts()
    opts.maxLoops = 40
    const result = await runBot(market.board, market.players, opts, {
      feed: new BrokenFeed(),
      notifier,
      log: new MemoryLog(),
      sleep: () => Promise.resolve(),
      now: () => 0,
      jitter: () => 0,
    })
    const errors = notifier.messages.filter((m) => m.kind === 'bot_error')
    expect(errors.length, 'should report every fifth failure, not only the fifth').toBeGreaterThanOrEqual(3)
    // and the loop is still alive rather than having thrown out
    expect(result.completed).toBe(false)
    expect(result.counters.loops).toBeGreaterThan(30)
  }, 60000)

  it('refuses to start when the configured drafter owns no picks', async () => {
    // Resolved at LOAD now. Previously this surfaced only once picks started
    // landing, mid-draft, as a single message.
    const opts = makeOpts()
    opts.myUserId = 'not-a-real-user'
    await expect(
      runBot(market.board, market.players, opts, {
        feed: new FakeFeed(new FakeClock(), false),
        notifier: new CollectingNotifier(),
        log: new MemoryLog(),
        sleep: () => Promise.resolve(),
        now: () => 0,
        jitter: () => 0,
      })
    ).rejects.toThrow(/not in draft_order|owns no picks/)
  }, 30000)

  it('does not fetch picks while the draft is paused', async () => {
    // A paused draft forces a draft fetch every loop; also fetching picks
    // doubled the call rate exactly when nothing can happen.
    class PausedFeed extends BrokenFeed {
      picksCalls = 0
      getDraft() {
        return Promise.resolve({ ...fx.draft, status: 'paused' })
      }
      getPicks(): Promise<SleeperPick[]> {
        this.picksCalls++
        return Promise.resolve([])
      }
    }
    const feed = new PausedFeed()
    const opts = makeOpts()
    opts.maxLoops = 20
    const notifier = new CollectingNotifier()
    await runBot(market.board, market.players, opts, {
      feed,
      notifier,
      log: new MemoryLog(),
      sleep: () => Promise.resolve(),
      now: () => 0,
      jitter: () => 0,
    })
    expect(feed.picksCalls, 'no picks fetch while paused').toBe(0)
    expect(notifier.messages.filter((m) => m.kind === 'draft_paused').length, 'announced once').toBe(1)
  }, 30000)
})
