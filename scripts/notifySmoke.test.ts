import { describe, expect, it } from 'vitest'
import { smokeAll } from './notifySmoke'
import { DraftMessage, Notifier } from '../helpers/draft/types'

const msg: DraftMessage = { kind: 'bot_error', message: 'smoke', consecutiveFailures: 0 }

function stub(fail?: string): { n: Notifier; sent: DraftMessage[] } {
  const sent: DraftMessage[] = []
  return {
    sent,
    n: {
      send: (m) => {
        if (fail) return Promise.reject(new Error(fail))
        sent.push(m)
        return Promise.resolve()
      },
    },
  }
}

describe('smokeAll', () => {
  it('attempts every channel even when an earlier one fails, and counts the failures', async () => {
    const dead = stub('HTTP 400: ContentSid Required')
    const alive = stub()
    const lines: string[] = []
    const failures = await smokeAll([dead.n, alive.n], ['whatsapp', 'discord'], msg, (l) => lines.push(l))

    expect(alive.sent).toHaveLength(1) // the sibling still delivered
    expect(failures).toBe(1)
    expect(lines.some((l) => l.includes('whatsapp') && l.includes('FAILED') && l.includes('ContentSid'))).toBe(true)
    expect(lines.some((l) => l.includes('discord') && l.includes('sent'))).toBe(true)
  })

  it('reports zero failures when every channel delivers', async () => {
    const a = stub()
    const b = stub()
    const lines: string[] = []
    const failures = await smokeAll([a.n, b.n], ['whatsapp', 'discord'], msg, (l) => lines.push(l))
    expect(failures).toBe(0)
    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(1)
  })
})
