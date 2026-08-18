// Notifier implementations. The message COPY here is the Phase 3
// deliverable: Phase 4 channels (WhatsApp/Telegram) send these exact strings,
// so review the wording here, not there. Formatting targets a phone screen —
// short lines, front-loaded verbs, no tables.
//
// EVERY MESSAGE NAMES AT MOST ONE PLAYER, and nothing beyond that name. The
// reader is someone drafting the name they are handed and doing no analysis,
// and these get pasted into a league channel — so a shortlist, a rationale
// line like "2 left in RB T2; 0% survives to pick 20", and a bare survival
// percentage are all excluded, for the same two reasons each time: the reader
// cannot act on them, and the other eleven managers can. `fallbacks` is never
// rendered even when a caller populates it, and the rationale never leaves the
// process.
//
// `pick_mismatch` names two players; both are already public by the time it
// is sent. That is the one documented exception, explained at its case.
//
// The alternatives used to be the relay's safety net: a name that gets sniped
// mid-relay needed somewhere to go. That safety now lives in the bot, which
// re-issues a fresh single-name instruction when the player it named is taken
// while the pick is still open (see bot.ts). The message is therefore public-
// safe AND strictly more useful — it always names someone actually available.
//
// There is no `heads_up`. The bot used to warn when a pick came within three,
// and the warning only ever paid for itself for a reader who would do
// something with it. This one acts on the instruction; a message naming nobody
// is one they must read and discard.

import * as fs from 'fs'
import * as path from 'path'
import { DraftMessage, Notifier, Scored } from './types'

// ONE rendering, for one reader.
//
// There used to be two — a 'public' string safe for the league channel and a
// 'private' one for Andrew's console carrying "97% survives", on the reasoning
// that the forecast is the number telling him whether to skip a pick. That
// reasoning assumed the console was read by someone doing analysis. It is not:
// its text is relayed verbatim to a friend who drafts the name and nothing
// else. For that reader a percentage is noise beside the single instruction
// that matters, and it is the same read of the board that the shortlist and
// rationale are suppressed to protect. So it is rendered to nobody, and there
// is no second audience for it to hide in.
function renderLine(s: Scored): string {
  // (off-board) stays: it says the player is not on Andrew's board, which tells
  // a rival nothing they could act on and tells the relay nothing to weigh.
  const offBoard = s.offBoard ? ' (off-board)' : ''
  return `${s.pos} ${s.name}${offBoard}`
}

export function formatDraftMessage(msg: DraftMessage): string {
  const line = (s: Scored): string => renderLine(s)
  switch (msg.kind) {
    case 'loaded':
      return (
        `READY — ${msg.teams} teams, ${msg.rounds} rounds, you are slot ${msg.slot}.\n` +
        `Your picks: ${msg.pickNos.join(', ')}`
      )
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
    // The same string everyone else gets. This console is not a private screen
    // — it is the text that gets relayed on, so anything it adds is something
    // the relay has to strip.
    const body = formatDraftMessage(msg)
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
