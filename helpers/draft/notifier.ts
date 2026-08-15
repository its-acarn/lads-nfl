// Notifier implementations. The message COPY here is the Phase 3
// deliverable: Phase 4 channels (WhatsApp/Telegram) send these exact strings,
// so review the wording here, not there. Formatting targets a phone screen —
// short lines, front-loaded verbs, no tables.

import { DraftMessage, Notifier, Scored } from './types'

function line(s: Scored): string {
  const tag = s.offBoard ? ' (off-board)' : s.survivalToNextPct !== null ? ` (${s.survivalToNextPct}% survives)` : ''
  return `${s.pos} ${s.name}${tag}`
}

export function formatDraftMessage(msg: DraftMessage): string {
  switch (msg.kind) {
    case 'loaded':
      return (
        `READY — ${msg.teams} teams, ${msg.rounds} rounds, you are slot ${msg.slot}.\n` +
        `Your picks: ${msg.pickNos.join(', ')}`
      )
    case 'heads_up': {
      const rows: string[] = []
      for (let i = 0; i < msg.shortlist.length; i++) rows.push(`${i + 1}. ${line(msg.shortlist[i])}`)
      return `HEADS UP — pick ${msg.myPickNo} is ${msg.picksAway} away.\nShortlist:\n${rows.join('\n')}`
    }
    case 'on_clock': {
      const parts = [`ON THE CLOCK — pick ${msg.pickNo}`, `TAKE: ${line(msg.instruction)}`]
      for (let i = 0; i < msg.fallbacks.length; i++) parts.push(`Else: ${line(msg.fallbacks[i])}`)
      parts.push(`Why: ${msg.instruction.rationale.slice(0, 3).join('; ')}`)
      return parts.join('\n')
    }
    case 'escalation': {
      const parts = [`STILL OPEN after ${msg.secondsElapsed}s — pick ${msg.pickNo}`, `TAKE: ${line(msg.instruction)}`]
      for (let i = 0; i < msg.fallbacks.length; i++) parts.push(`Else: ${line(msg.fallbacks[i])}`)
      return parts.join('\n')
    }
    case 'pick_confirmed':
      return `CONFIRMED pick ${msg.pickNo}: ${line(msg.player)}. Nice one.`
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
    const body = formatDraftMessage(msg)
      .split('\n')
      .map((l, i) => (i === 0 ? `[${stamp}] ${l}` : `           ${l}`))
      .join('\n')
    // eslint-disable-next-line no-console
    console.log(body)
    return Promise.resolve()
  }
}
