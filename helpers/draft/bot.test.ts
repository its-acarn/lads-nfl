// Deterministic state-machine test: runBot driven by a fake feed and fake
// clock over the real lads/2024 fixture. Asserts the exact message
// discipline the plan requires — heads-up once per pick, on-clock exactly on
// turn, escalations from the local stopwatch, verify after every one of my
// picks, a completion summary, and a crash-restart that never re-spams.

import { describe, expect, it } from 'vitest'
import { runBot, BotOptions, DEFAULT_BOT_OPTIONS, Feed, SentLog } from './bot'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { buildMarketFixture, userForSlot } from './marketBoard'
import { DEFAULT_SIM_OPTS } from './survival'
import { DraftMessage, Notifier, SleeperPick } from './types'

const fx = loadFixture('lads', '2024')
const realPlayers = loadTrimmedPlayers()
const SLOT = 1
const ME = userForSlot(fx.draft, SLOT)
const market = buildMarketFixture(fx.draft, fx.picks, realPlayers, ME)
const sorted = fx.picks.slice().sort((a, b) => a.pick_no - b.pick_no)

// Tick-driven fake: each sleep() advances one tick; one pick releases per
// tick, except my picks which stall STALL_TICKS extra so escalations fire.
// now() runs at 20 draft-seconds per tick against a 120s pick timer:
// escalation 1 at 40s = 2 stalled ticks, escalation 2 at 90s = 5.
const MS_PER_TICK = 20000
const STALL_TICKS = 6

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
        expect(forPick[0].secondsElapsed).toBeGreaterThanOrEqual(40)
        expect(forPick[1].secondsElapsed).toBeGreaterThanOrEqual(90)
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
