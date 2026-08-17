// Notifier implementations. The message COPY here is the Phase 3
// deliverable: Phase 4 channels (WhatsApp/Telegram) send these exact strings,
// so review the wording here, not there. Formatting targets a phone screen —
// short lines, front-loaded verbs, no tables.
//
// EVERY MESSAGE RECOMMENDS AT MOST ONE PLAYER, and the public rendering
// reveals nothing about the board beyond that name. These get shared in a
// league channel, where a shortlist tells the other eleven managers what
// Andrew is thinking — as does a rationale line like "2 left in RB T2; 0%
// survives to pick 20", and as does a bare survival percentage on its own.
// So `fallbacks` and `shortlist` are never rendered here even when a caller
// populates them, the rationale never leaves the process, and the survival
// forecast appears only in the 'private' rendering (see Audience below).
//
// `pick_mismatch` names two players; both are already public by the time it
// is sent. That is the one documented exception, explained at its case.
//
// The alternatives used to be the relay's safety net: a name that gets sniped
// mid-relay needed somewhere to go. That safety now lives in the bot, which
// re-issues a fresh single-name instruction when the player it named is taken
// while the pick is still open (see bot.ts). The message is therefore public-
// safe AND strictly more useful — it always names someone actually available.

import * as fs from 'fs'
import * as path from 'path'
import { DraftMessage, Notifier, Scored } from './types'

// Two audiences, and they must not get the same string.
//
// 'public' is what may be pasted into the league channel, and what Phase 4
// channels send verbatim. It carries the player's name and nothing that
// reveals the engine's read of the board.
//
// 'private' is Andrew's own console. The survival forecast belongs here and
// only here: "97% survives" is the single most decision-useful number the
// engine produces — it is what says *skip this one, he will still be there* —
// and it is also precisely what a rival manager most wants to know. Suppressing
// the rationale array while leaving this rendered everywhere was a hole in the
// one-name rule, not an exception to it.
export type Audience = 'public' | 'private'

function renderLine(s: Scored, audience: Audience): string {
  // (off-board) stays in both: it says the player is not on Andrew's board,
  // which tells a rival nothing they could act on.
  const offBoard = s.offBoard ? ' (off-board)' : ''
  const survival =
    audience === 'private' && !s.offBoard && s.survivalToNextPct !== null
      ? ` (${s.survivalToNextPct}% survives)`
      : ''
  return `${s.pos} ${s.name}${offBoard}${survival}`
}

// Defaults to 'public'. A caller that forgets the argument leaks nothing, which
// is the safe direction for the one property in this file that gets shared.
export function formatDraftMessage(msg: DraftMessage, audience: Audience = 'public'): string {
  const line = (s: Scored): string => renderLine(s, audience)
  switch (msg.kind) {
    case 'loaded':
      return (
        `READY — ${msg.teams} teams, ${msg.rounds} rounds, you are slot ${msg.slot}.\n` +
        `Your picks: ${msg.pickNos.join(', ')}`
      )
    case 'heads_up': {
      // A get-ready signal that names the one player currently at the top, and
      // nothing about the rest of the board.
      const head = `HEADS UP — pick ${msg.myPickNo} is ${msg.picksAway} away.`
      return msg.shortlist.length > 0 ? `${head}\nLikely: ${line(msg.shortlist[0])}` : head
    }
    case 'on_clock':
      return `ON THE CLOCK — pick ${msg.pickNo}\nTAKE: ${line(msg.instruction)}`
    case 'escalation':
      return `STILL OPEN after ${msg.secondsElapsed}s — pick ${msg.pickNo}\nTAKE: ${line(msg.instruction)}`
    case 'pick_confirmed':
      return `CONFIRMED pick ${msg.pickNo}: ${line(msg.player)}. Nice one.`
    // Two names here, and deliberately so: both are already public. The pick
    // landed on Sleeper for everyone to see, and the instruction it missed went
    // out in the on_clock message. Naming them together reveals nothing new and
    // is the only way to say what actually happened.
    case 'pick_mismatch':
      return `MISMATCH pick ${msg.pickNo}: got ${msg.actual.pos} ${msg.actual.name}, instructed ${line(msg.expected)}. Recomputing from the roster we actually hold.`
    case 'draft_paused':
      return `Draft paused. Standing by.`
    case 'draft_resumed':
      return `Draft resumed.`
    case 'draft_complete':
      return `DRAFT COMPLETE.\n${msg.rosterSummary}`
    case 'bot_error':
      return `BOT ERROR (${msg.consecutiveFailures} consecutive failures): ${msg.message}. Still retrying.`
    default: {
      // Exhaustiveness guard: a new DraftMessage kind must be formatted.
      const never: never = msg
      throw new Error(`unformatted message kind: ${JSON.stringify(never)}`)
    }
  }
}

export class ConsoleNotifier implements Notifier {
  private clock: () => string

  constructor(clock?: () => string) {
    this.clock = clock || (() => new Date().toISOString().slice(11, 19))
  }

  send(msg: DraftMessage): Promise<void> {
    const stamp = this.clock()
    // Andrew's own screen: the survival forecast belongs here, because it is
    // what tells him whether a recommendation is urgent or safe to skip. What
    // he chooses to paste into the channel is the public rendering, which is
    // formatDraftMessage's default.
    const body = formatDraftMessage(msg, 'private')
      .split('\n')
      .map((l, i) => (i === 0 ? `[${stamp}] ${l}` : `           ${l}`))
      .join('\n')
    // eslint-disable-next-line no-console
    console.log(body)
    return Promise.resolve()
  }
}

// One JSON object per line, so a second reader can follow a draft as data.
// The relay assistant consumes THIS and never the console: the copy above is
// the Phase 3 deliverable and is meant to be reworded freely, and parsing it
// would couple the relay to text that is expected to change (D2).
//
// Writes are synchronous through a single append descriptor rather than
// buffered through a write stream. The descriptor is opened once, as planned,
// but a buffered stream would lose its tail to a `kill -9` -- and the whole
// reason this log never truncates (D3) is that the record matters most exactly
// when the bot has died. A draft emits a few dozen messages over two hours, so
// the cost of writing each one durably is nothing.
export class JsonlNotifier implements Notifier {
  private fd: number
  private clock: () => string

  constructor(file: string, clock?: () => string) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
    this.fd = fs.openSync(file, 'a')
    this.clock = clock || (() => new Date().toISOString())
  }

  send(msg: DraftMessage): Promise<void> {
    // ts sits alongside the message rather than inside it, so the DraftMessage
    // shape survives the round trip verbatim.
    fs.writeSync(this.fd, JSON.stringify({ ts: this.clock(), ...msg }) + '\n')
    return Promise.resolve()
  }

  close(): void {
    if (this.fd >= 0) {
      fs.closeSync(this.fd)
      this.fd = -1
    }
  }
}

// Fans one message out to several channels. A failure in any one of them must
// not take down the others or the draft: a disk that fills mid-draft should
// cost the log, not the rehearsal.
export class MultiNotifier implements Notifier {
  private notifiers: Notifier[]
  private report: (msg: string) => void
  // Per-notifier, because a full disk fails on every subsequent message and
  // reporting each one would flood the console Andrew is reading on a
  // 120-second clock -- the one channel a logging fault must not damage.
  private reported: boolean[]

  constructor(notifiers: Notifier[], report?: (msg: string) => void) {
    this.notifiers = notifiers
    this.reported = notifiers.map(() => false)
    this.report =
      report ||
      ((m: string) => {
        // eslint-disable-next-line no-console
        console.error(m)
      })
  }

  async send(msg: DraftMessage): Promise<void> {
    for (let i = 0; i < this.notifiers.length; i++) {
      try {
        await this.notifiers[i].send(msg)
      } catch (err) {
        if (!this.reported[i]) {
          this.reported[i] = true
          this.report(
            `notifier ${i + 1} of ${this.notifiers.length} failed and will be reported no further: ` +
              `${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  }
}
