import { describe, expect, it } from 'vitest'
import {
  DiscordNotifier,
  remoteNotifiersFromEnv,
  TwilioWhatsAppNotifier,
  VonageWhatsAppNotifier,
} from './remoteNotifiers'
import { MultiNotifier } from './notifier'
import { DraftMessage, Notifier, Scored } from './types'

const bijan: Scored = {
  player_id: '9509',
  name: 'Bijan Robinson',
  pos: 'RB',
  team: 'ATL',
  value: 99.9,
  offBoard: false,
  score: 41.2,
  survivalToNextPct: 12,
  rationale: ['3 left in RB T1', '12% survives to pick 24', 'fills RB starter slot'],
}
const chase: Scored = { ...bijan, player_id: '7564', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', survivalToNextPct: 34 }

const onClock: DraftMessage = { kind: 'on_clock', pickNo: 24, instruction: chase, fallbacks: [bijan] }

// A fetch stand-in that records every call and answers with a canned response.
interface Call {
  url: string
  init: RequestInit
}
function fakeFetch(status = 200, body = '{}'): { calls: Call[]; fn: typeof fetch } {
  const calls: Call[] = []
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    // A real 204 (Discord's success) carries no body; the Response constructor
    // enforces that.
    return Promise.resolve(new Response(status === 204 ? null : body, { status }))
  }) as unknown as typeof fetch
  return { calls, fn }
}

describe('TwilioWhatsAppNotifier', () => {
  const opts = {
    accountSid: 'ACxxx',
    authToken: 'tok',
    from: '+14155238886',
    to: '+447700900001',
  }

  it('POSTs the rendered message to the account Messages endpoint with Basic auth', async () => {
    const { calls, fn } = fakeFetch()
    const n = new TwilioWhatsAppNotifier({ ...opts, fetchFn: fn })
    await n.send(onClock)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('ACxxx:tok').toString('base64')}`)
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    // The body must survive URL-encoding: apostrophes in names are the norm.
    const params = new URLSearchParams(String(calls[0].init.body))
    expect(params.get('From')).toBe('whatsapp:+14155238886')
    expect(params.get('To')).toBe('whatsapp:+447700900001')
    expect(params.get('Body')).toContain("TAKE: WR Ja'Marr Chase")
  })

  it('sends the one public-safe rendering — no survival forecast on any channel', async () => {
    const { calls, fn } = fakeFetch()
    await new TwilioWhatsAppNotifier({ ...opts, fetchFn: fn }).send(onClock)
    expect(new URLSearchParams(String(calls[0].init.body)).get('Body')).not.toContain('survives')
  })

  it('throws on a non-2xx response, naming the status and Twilio message', async () => {
    const { fn } = fakeFetch(401, JSON.stringify({ message: 'Authenticate' }))
    const n = new TwilioWhatsAppNotifier({ ...opts, fetchFn: fn })
    await expect(n.send(onClock)).rejects.toThrow(/401.*Authenticate/)
  })

  it('sends with an abort signal so a hung request cannot stall the poll loop', async () => {
    const { calls, fn } = fakeFetch()
    await new TwilioWhatsAppNotifier({ ...opts, fetchFn: fn }).send(onClock)
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('VonageWhatsAppNotifier', () => {
  const opts = {
    apiKey: 'key1',
    apiSecret: 'sec1',
    from: '+14157386102',
    to: '+447700900001',
  }

  it('POSTs JSON to the sandbox endpoint with Basic auth, numbers without a leading +', async () => {
    const { calls, fn } = fakeFetch(202, '{"message_uuid":"x"}')
    await new VonageWhatsAppNotifier({ ...opts, fetchFn: fn }).send(onClock)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://messages-sandbox.nexmo.com/v1/messages')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('key1:sec1').toString('base64')}`)
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, string>
    expect(body.channel).toBe('whatsapp')
    expect(body.message_type).toBe('text')
    expect(body.from).toBe('14157386102')
    expect(body.to).toBe('447700900001')
    expect(body.text).toContain("TAKE: WR Ja'Marr Chase")
    expect(body.text).not.toContain('survives')
  })

  it('retries once, after a pause, when the sandbox rate limit answers 429', async () => {
    // The sandbox allows one message per second; two recipients back to back
    // can trip it, and losing the second phone's instruction over that would
    // be absurd.
    const calls: Call[] = []
    let n = 0
    const fn = ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      n++
      return Promise.resolve(new Response(n === 1 ? '{"title":"Rate Limit"}' : '{"message_uuid":"x"}', { status: n === 1 ? 429 : 202 }))
    }) as unknown as typeof fetch
    const waits: number[] = []
    const sleep = (ms: number): Promise<void> => {
      waits.push(ms)
      return Promise.resolve()
    }
    await new VonageWhatsAppNotifier({ ...opts, fetchFn: fn, sleepFn: sleep }).send(onClock)
    expect(calls).toHaveLength(2)
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThanOrEqual(1000)
  })

  it('throws on a persistent failure, naming the status and detail', async () => {
    const { fn } = fakeFetch(401, JSON.stringify({ title: 'Unauthorized', detail: 'Bad credentials' }))
    await expect(new VonageWhatsAppNotifier({ ...opts, fetchFn: fn }).send(onClock)).rejects.toThrow(
      /401.*Bad credentials/
    )
  })
})

describe('DiscordNotifier', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/123/abc'

  it('POSTs the rendered message as JSON content to the webhook', async () => {
    const { calls, fn } = fakeFetch(204, '')
    const n = new DiscordNotifier({ webhookUrl, fetchFn: fn })
    await n.send(onClock)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(webhookUrl)
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(String(calls[0].init.body)) as { content: string }
    expect(body.content).toContain('ON THE CLOCK — pick 24')
    expect(body.content).toContain("TAKE: WR Ja'Marr Chase")
    expect(body.content).not.toContain('survives')
  })

  it('truncates content below the 2000-character Discord cap', async () => {
    const { calls, fn } = fakeFetch(204, '')
    const n = new DiscordNotifier({ webhookUrl, fetchFn: fn })
    await n.send({ kind: 'draft_complete', rosterSummary: 'X'.repeat(3000) })
    const body = JSON.parse(String(calls[0].init.body)) as { content: string }
    expect(body.content.length).toBeLessThanOrEqual(1900)
    expect(body.content.endsWith('…')).toBe(true)
  })

  it('throws on a non-2xx response, naming the status', async () => {
    const { fn } = fakeFetch(404, '{"message": "Unknown Webhook"}')
    const n = new DiscordNotifier({ webhookUrl, fetchFn: fn })
    await expect(n.send(onClock)).rejects.toThrow(/404/)
  })
})

describe('remoteNotifiersFromEnv', () => {
  it('builds nothing when no channel variables are set', () => {
    const { notifiers, described } = remoteNotifiersFromEnv({})
    expect(notifiers).toHaveLength(0)
    expect(described).toHaveLength(0)
  })

  it('builds one Vonage notifier per comma-separated recipient, plus Discord', async () => {
    const { calls, fn } = fakeFetch(202, '{}')
    const { notifiers, described } = remoteNotifiersFromEnv(
      {
        VONAGE_API_KEY: 'key1',
        VONAGE_API_SECRET: 'sec1',
        VONAGE_WHATSAPP_FROM: '14157386102',
        VONAGE_WHATSAPP_TO: '+447700900001, +447700900002',
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
      },
      fn
    )
    expect(described).toEqual(['vonage-whatsapp(2)', 'discord'])
    for (let i = 0; i < notifiers.length; i++) await notifiers[i].send(onClock)
    expect(calls).toHaveLength(3)
    expect((JSON.parse(String(calls[0].init.body)) as { to: string }).to).toBe('447700900001')
    expect((JSON.parse(String(calls[1].init.body)) as { to: string }).to).toBe('447700900002')
  })

  it('builds Twilio notifiers from TWILIO_* variables', async () => {
    const { calls, fn } = fakeFetch()
    const { described, notifiers } = remoteNotifiersFromEnv(
      {
        TWILIO_ACCOUNT_SID: 'ACxxx',
        TWILIO_AUTH_TOKEN: 'tok',
        TWILIO_WHATSAPP_FROM: '+14155238886',
        TWILIO_WHATSAPP_TO: '+447700900001',
      },
      fn
    )
    expect(described).toEqual(['twilio-whatsapp(1)'])
    await notifiers[0].send(onClock)
    expect(new URLSearchParams(String(calls[0].init.body)).get('To')).toBe('whatsapp:+447700900001')
  })

  it('Discord alone is a valid configuration', () => {
    const { described } = remoteNotifiersFromEnv({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/a' })
    expect(described).toEqual(['discord'])
  })

  it('a half-configured Vonage channel fails at startup, naming what is missing', () => {
    expect(() => remoteNotifiersFromEnv({ VONAGE_API_KEY: 'key1' })).toThrow(/VONAGE_API_SECRET/)
    expect(() =>
      remoteNotifiersFromEnv({ VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's', VONAGE_WHATSAPP_FROM: '1' })
    ).toThrow(/VONAGE_WHATSAPP_TO/)
  })

  it('a half-configured Twilio channel fails at startup, naming what is missing', () => {
    expect(() => remoteNotifiersFromEnv({ TWILIO_ACCOUNT_SID: 'ACxxx' })).toThrow(/TWILIO_AUTH_TOKEN/)
    expect(() =>
      remoteNotifiersFromEnv({
        TWILIO_ACCOUNT_SID: 'ACxxx',
        TWILIO_AUTH_TOKEN: 'tok',
        TWILIO_WHATSAPP_FROM: '+14155238886',
      })
    ).toThrow(/TWILIO_WHATSAPP_TO/)
  })
})

describe('remote channels under MultiNotifier', () => {
  it('a dead channel is skipped and its siblings still deliver', async () => {
    const dead = new TwilioWhatsAppNotifier({
      accountSid: 'AC',
      authToken: 't',
      from: '+1',
      to: '+2',
      fetchFn: fakeFetch(500, '{}').fn,
    })
    const delivered: DraftMessage[] = []
    const sibling: Notifier = {
      send: (m) => {
        delivered.push(m)
        return Promise.resolve()
      },
    }
    const reports: string[] = []
    const multi = new MultiNotifier([dead, sibling], (m) => reports.push(m))
    await multi.send(onClock)
    expect(delivered).toHaveLength(1)
    expect(reports).toHaveLength(1)
  })
})
