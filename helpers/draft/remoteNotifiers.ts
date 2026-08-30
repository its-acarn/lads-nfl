// Network-backed notifiers: WhatsApp (via the Twilio API) and Discord (via a
// channel webhook). Both send the strings formatDraftMessage already renders —
// the copy was reviewed in Phase 3 and channels reuse it verbatim.
//
// Each instance is built for ONE audience. The public rendering is what may be
// seen by the league (the relay's DM, the Discord channel); the private one —
// which carries the survival forecast — belongs only on Andrew's own number.
//
// Failures THROW. Swallowing them here would hide a dead channel from
// MultiNotifier, whose job is to report the first failure and keep the draft
// alive on the surviving channels.

import { Audience, formatDraftMessage } from './notifier'
import { DraftMessage, Notifier } from './types'

// A hung request must not stall the poll loop past a pick. Same budget as the
// Sleeper feeds.
const SEND_TIMEOUT_MS = 15000

// Discord rejects content over 2000 characters; stay comfortably under it.
const DISCORD_MAX_CONTENT = 1900

async function postWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
  try {
    return await fetchFn(url, { ...init, method: 'POST', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Best effort at the human part of a JSON error body: Twilio and Discord use
// `message`, Vonage uses `detail`/`title`. Anything unparseable is omitted.
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; detail?: string; title?: string }
    const text = body && (body.message || body.detail || body.title)
    return text ? `: ${text}` : ''
  } catch {
    return ''
  }
}

export interface TwilioWhatsAppOptions {
  accountSid: string
  authToken: string
  from: string // E.164, no whatsapp: prefix — added here
  to: string
  audience: Audience
  fetchFn?: typeof fetch
}

export class TwilioWhatsAppNotifier implements Notifier {
  private opts: TwilioWhatsAppOptions
  private fetchFn: typeof fetch

  constructor(opts: TwilioWhatsAppOptions) {
    this.opts = opts
    this.fetchFn = opts.fetchFn || fetch
  }

  async send(msg: DraftMessage): Promise<void> {
    const body = new URLSearchParams({
      From: `whatsapp:${this.opts.from}`,
      To: `whatsapp:${this.opts.to}`,
      Body: formatDraftMessage(msg, this.opts.audience),
    })
    const res = await postWithTimeout(
      this.fetchFn,
      `https://api.twilio.com/2010-04-01/Accounts/${this.opts.accountSid}/Messages.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.opts.accountSid}:${this.opts.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    )
    if (!res.ok) {
      throw new Error(`Twilio WhatsApp to ${this.opts.to} -> HTTP ${res.status}${await errorDetail(res)}`)
    }
  }
}

export interface VonageWhatsAppOptions {
  apiKey: string
  apiSecret: string
  from: string // E.164, with or without a leading + — Vonage wants it without
  to: string
  audience: Audience
  apiUrl?: string // defaults to the Messages API sandbox
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
}

// Vonage Messages API sandbox: whitelist a phone by sending its passphrase
// from WhatsApp, then freeform text is allowed inside the usual 24-hour
// session. Fair use is 100 messages/month — plenty for one draft night to two
// phones, nothing more, so rehearsals should lean on Discord.
const VONAGE_SANDBOX_URL = 'https://messages-sandbox.nexmo.com/v1/messages'

// The sandbox allows one message per second. Two recipients get their copies
// back to back, so a 429 on the second is expected occasionally — wait out
// the window once rather than losing that phone's instruction.
const VONAGE_RETRY_MS = 1100

export class VonageWhatsAppNotifier implements Notifier {
  private opts: VonageWhatsAppOptions
  private fetchFn: typeof fetch
  private sleepFn: (ms: number) => Promise<void>

  constructor(opts: VonageWhatsAppOptions) {
    this.opts = opts
    this.fetchFn = opts.fetchFn || fetch
    this.sleepFn = opts.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  private post(text: string): Promise<Response> {
    return postWithTimeout(this.fetchFn, this.opts.apiUrl || VONAGE_SANDBOX_URL, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.opts.apiKey}:${this.opts.apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.opts.from.replace(/^\+/, ''),
        to: this.opts.to.replace(/^\+/, ''),
        channel: 'whatsapp',
        message_type: 'text',
        text,
      }),
    })
  }

  async send(msg: DraftMessage): Promise<void> {
    const text = formatDraftMessage(msg, this.opts.audience)
    let res = await this.post(text)
    if (res.status === 429) {
      await this.sleepFn(VONAGE_RETRY_MS)
      res = await this.post(text)
    }
    if (!res.ok) {
      throw new Error(`Vonage WhatsApp to ${this.opts.to} -> HTTP ${res.status}${await errorDetail(res)}`)
    }
  }
}

// Build the remote channels a process was configured with. With none of the
// variables set this returns nothing and the bot behaves exactly as before —
// console (and JSONL) only. A HALF-configured channel throws, naming the gap:
// discovering it at startup costs a restart, discovering it at pick 1 costs
// the pick.
//
//   VONAGE_API_KEY / VONAGE_API_SECRET / VONAGE_WHATSAPP_FROM
//   VONAGE_WHATSAPP_TO_PRIVATE   Andrew's number: gets the private rendering
//   VONAGE_WHATSAPP_TO_PUBLIC    the relay's number: public rendering
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
//   TWILIO_WHATSAPP_TO_PRIVATE / TWILIO_WHATSAPP_TO_PUBLIC   as for Vonage
//   DISCORD_WEBHOOK_URL          channel webhook: public rendering
//
// Vonage and Twilio are alternative WhatsApp providers behind one shape;
// configure whichever account works (Vonage after Twilio's trial tier proved
// unable to send freeform messages, Aug 2026).
//
// `described` names each armed channel WITHOUT its secrets, for the startup
// line.
export function remoteNotifiersFromEnv(
  env: Record<string, string | undefined>,
  fetchFn?: typeof fetch
): { notifiers: Notifier[]; described: string[] } {
  const notifiers: Notifier[] = []
  const described: string[] = []

  const vonageVars = ['VONAGE_API_KEY', 'VONAGE_API_SECRET', 'VONAGE_WHATSAPP_FROM']
  const vonageSet = vonageVars.filter((v) => env[v])
  const vToPrivate = env.VONAGE_WHATSAPP_TO_PRIVATE
  const vToPublic = env.VONAGE_WHATSAPP_TO_PUBLIC
  if (vonageSet.length > 0 || vToPrivate || vToPublic) {
    const missing = vonageVars.filter((v) => !env[v])
    if (missing.length > 0) {
      throw new Error(`Vonage WhatsApp channel is half-configured: missing ${missing.join(', ')}`)
    }
    if (!vToPrivate && !vToPublic) {
      throw new Error(
        'Vonage WhatsApp channel is half-configured: no recipient — set VONAGE_WHATSAPP_TO_PRIVATE and/or VONAGE_WHATSAPP_TO_PUBLIC'
      )
    }
    const base = {
      apiKey: env.VONAGE_API_KEY as string,
      apiSecret: env.VONAGE_API_SECRET as string,
      from: env.VONAGE_WHATSAPP_FROM as string,
      apiUrl: env.VONAGE_API_URL,
      fetchFn,
    }
    if (vToPrivate) {
      notifiers.push(new VonageWhatsAppNotifier({ ...base, to: vToPrivate, audience: 'private' }))
      described.push('vonage-whatsapp(private)')
    }
    if (vToPublic) {
      notifiers.push(new VonageWhatsAppNotifier({ ...base, to: vToPublic, audience: 'public' }))
      described.push('vonage-whatsapp(public)')
    }
  }

  const twilioVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']
  const twilioSet = twilioVars.filter((v) => env[v])
  const toPrivate = env.TWILIO_WHATSAPP_TO_PRIVATE
  const toPublic = env.TWILIO_WHATSAPP_TO_PUBLIC
  const anyTwilio = twilioSet.length > 0 || !!toPrivate || !!toPublic

  if (anyTwilio) {
    const missing = twilioVars.filter((v) => !env[v])
    if (missing.length > 0) {
      throw new Error(`WhatsApp channel is half-configured: missing ${missing.join(', ')}`)
    }
    if (!toPrivate && !toPublic) {
      throw new Error(
        'WhatsApp channel is half-configured: no recipient — set TWILIO_WHATSAPP_TO_PRIVATE and/or TWILIO_WHATSAPP_TO_PUBLIC'
      )
    }
    const base = {
      accountSid: env.TWILIO_ACCOUNT_SID as string,
      authToken: env.TWILIO_AUTH_TOKEN as string,
      from: env.TWILIO_WHATSAPP_FROM as string,
      fetchFn,
    }
    if (toPrivate) {
      notifiers.push(new TwilioWhatsAppNotifier({ ...base, to: toPrivate, audience: 'private' }))
      described.push('whatsapp(private)')
    }
    if (toPublic) {
      notifiers.push(new TwilioWhatsAppNotifier({ ...base, to: toPublic, audience: 'public' }))
      described.push('whatsapp(public)')
    }
  }

  if (env.DISCORD_WEBHOOK_URL) {
    notifiers.push(new DiscordNotifier({ webhookUrl: env.DISCORD_WEBHOOK_URL, audience: 'public', fetchFn }))
    described.push('discord')
  }

  return { notifiers, described }
}

export interface DiscordOptions {
  webhookUrl: string
  audience: Audience
  fetchFn?: typeof fetch
}

export class DiscordNotifier implements Notifier {
  private opts: DiscordOptions
  private fetchFn: typeof fetch

  constructor(opts: DiscordOptions) {
    this.opts = opts
    this.fetchFn = opts.fetchFn || fetch
  }

  async send(msg: DraftMessage): Promise<void> {
    let content = formatDraftMessage(msg, this.opts.audience)
    if (content.length > DISCORD_MAX_CONTENT) {
      content = `${content.slice(0, DISCORD_MAX_CONTENT - 1)}…`
    }
    const res = await postWithTimeout(this.fetchFn, this.opts.webhookUrl, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      throw new Error(`Discord webhook -> HTTP ${res.status}${await errorDetail(res)}`)
    }
  }
}
