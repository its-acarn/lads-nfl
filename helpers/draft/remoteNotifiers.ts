// Network-backed notifiers: WhatsApp (via Vonage or Twilio) and Discord (via
// a channel webhook). All of them send the ONE rendering formatDraftMessage
// produces — public-safe by construction (one name, no survival forecast, no
// rationale), so a screenshot from any channel leaks nothing.
//
// Failures THROW. Swallowing them here would hide a dead channel from
// MultiNotifier, whose job is to report the first failure and keep the draft
// alive on the surviving channels.

import { formatDraftMessage } from './notifier'
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
      Body: formatDraftMessage(msg),
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
    const text = formatDraftMessage(msg)
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

export interface DiscordOptions {
  webhookUrl: string
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
    let content = formatDraftMessage(msg)
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

// Build the remote channels a process was configured with. With none of the
// variables set this returns nothing and the bot behaves exactly as before —
// console (and JSONL) only. A HALF-configured channel throws, naming the gap:
// discovering it at startup costs a restart, discovering it at pick 1 costs
// the pick.
//
//   VONAGE_API_KEY / VONAGE_API_SECRET / VONAGE_WHATSAPP_FROM
//   VONAGE_WHATSAPP_TO           recipients, comma-separated E.164 numbers
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
//   TWILIO_WHATSAPP_TO           as for Vonage
//   DISCORD_WEBHOOK_URL          channel webhook
//
// Vonage and Twilio are alternative WhatsApp providers behind one shape;
// configure whichever account works (Vonage after Twilio's trial tier proved
// unable to send freeform messages, Aug 2026).
//
// `described` names each armed channel WITHOUT its secrets, for the startup
// line; `labels` gives one name PER NOTIFIER (recipients numbered), aligned
// with `notifiers`, for per-send reporting.
export function remoteNotifiersFromEnv(
  env: Record<string, string | undefined>,
  fetchFn?: typeof fetch
): { notifiers: Notifier[]; described: string[]; labels: string[] } {
  const notifiers: Notifier[] = []
  const described: string[] = []
  const labels: string[] = []

  const recipients = (raw: string, envVar: string): string[] => {
    const out = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (out.length === 0) throw new Error(`${envVar} is set but contains no numbers`)
    return out
  }

  const vonageVars = ['VONAGE_API_KEY', 'VONAGE_API_SECRET', 'VONAGE_WHATSAPP_FROM', 'VONAGE_WHATSAPP_TO']
  if (vonageVars.some((v) => env[v])) {
    const missing = vonageVars.filter((v) => !env[v])
    if (missing.length > 0) {
      throw new Error(`Vonage WhatsApp channel is half-configured: missing ${missing.join(', ')}`)
    }
    const to = recipients(env.VONAGE_WHATSAPP_TO as string, 'VONAGE_WHATSAPP_TO')
    for (let i = 0; i < to.length; i++) {
      notifiers.push(
        new VonageWhatsAppNotifier({
          apiKey: env.VONAGE_API_KEY as string,
          apiSecret: env.VONAGE_API_SECRET as string,
          from: env.VONAGE_WHATSAPP_FROM as string,
          to: to[i],
          apiUrl: env.VONAGE_API_URL,
          fetchFn,
        })
      )
      labels.push(to.length > 1 ? `vonage-whatsapp #${i + 1}` : 'vonage-whatsapp')
    }
    described.push(`vonage-whatsapp(${to.length})`)
  }

  const twilioVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TO']
  if (twilioVars.some((v) => env[v])) {
    const missing = twilioVars.filter((v) => !env[v])
    if (missing.length > 0) {
      throw new Error(`Twilio WhatsApp channel is half-configured: missing ${missing.join(', ')}`)
    }
    const to = recipients(env.TWILIO_WHATSAPP_TO as string, 'TWILIO_WHATSAPP_TO')
    for (let i = 0; i < to.length; i++) {
      notifiers.push(
        new TwilioWhatsAppNotifier({
          accountSid: env.TWILIO_ACCOUNT_SID as string,
          authToken: env.TWILIO_AUTH_TOKEN as string,
          from: env.TWILIO_WHATSAPP_FROM as string,
          to: to[i],
          fetchFn,
        })
      )
      labels.push(to.length > 1 ? `twilio-whatsapp #${i + 1}` : 'twilio-whatsapp')
    }
    described.push(`twilio-whatsapp(${to.length})`)
  }

  if (env.DISCORD_WEBHOOK_URL) {
    notifiers.push(new DiscordNotifier({ webhookUrl: env.DISCORD_WEBHOOK_URL, fetchFn }))
    described.push('discord')
    labels.push('discord')
  }

  return { notifiers, described, labels }
}
