// Send one synthetic message through every channel the environment configures,
// so the channels can be proven without a draft. This is the draft-morning
// check: if a phone does not buzz, the WhatsApp sandbox allowlisting has
// lapsed or a secret is wrong.
//
//   npm run notify:test
//
// Every channel is ATTEMPTED regardless of earlier failures — a broken
// WhatsApp credential must not leave Discord untested (it used to: the run
// stopped at the first failure, so one bad channel hid the state of all the
// others). Each channel gets its own verdict line, and the process still
// exits non-zero if anything failed or nothing is configured.

import { formatDraftMessage } from '../helpers/draft/notifier'
import { remoteNotifiersFromEnv } from '../helpers/draft/remoteNotifiers'
import { DraftMessage, Notifier } from '../helpers/draft/types'

// Attempts every notifier, reporting one verdict line each; returns how many
// failed. Exported for its spec.
export async function smokeAll(
  notifiers: Notifier[],
  labels: string[], // one per notifier, aligned — NOT the per-channel-group `described`
  msg: DraftMessage,
  report: (line: string) => void
): Promise<number> {
  let failures = 0
  for (let i = 0; i < notifiers.length; i++) {
    try {
      await notifiers[i].send(msg)
      report(`${labels[i]} — sent`)
    } catch (err) {
      failures++
      report(`${labels[i]} — FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return failures
}

async function main(): Promise<void> {
  const { notifiers, described, labels } = remoteNotifiersFromEnv(process.env)
  if (notifiers.length === 0) {
    throw new Error(
      'no remote channels configured — set the VONAGE_*, TWILIO_* and/or DISCORD_WEBHOOK_URL environment variables'
    )
  }

  const msg: DraftMessage = {
    kind: 'bot_error',
    message: `smoke test at ${new Date().toISOString()} — ignore`,
    consecutiveFailures: 0,
  }
  // eslint-disable-next-line no-console
  console.log(`sending to ${described.join(' + ')}: ${formatDraftMessage(msg)}`)

  // eslint-disable-next-line no-console
  const failures = await smokeAll(notifiers, labels, msg, (l) => console.log(l))
  if (failures > 0) {
    throw new Error(`${failures} of ${notifiers.length} channel(s) failed — see the lines above`)
  }
}

// Only run as a CLI; the spec imports smokeAll without side effects.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
