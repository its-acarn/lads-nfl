// Send one synthetic message through every channel the environment configures,
// so the channels can be proven without a draft. This is the draft-morning
// check: if a phone does not buzz, the Twilio sandbox join has lapsed (it
// expires ~72 hours after `join <code>` is texted) or a secret is wrong.
//
//   npm run notify:test
//
// Exits non-zero if no remote channel is configured or any send fails —
// unlike mid-draft delivery (where MultiNotifier keeps the draft alive on the
// surviving channels), a smoke test exists to surface the failure.

import { formatDraftMessage } from '../helpers/draft/notifier'
import { remoteNotifiersFromEnv } from '../helpers/draft/remoteNotifiers'
import { DraftMessage } from '../helpers/draft/types'

async function main(): Promise<void> {
  const { notifiers, described } = remoteNotifiersFromEnv(process.env)
  if (notifiers.length === 0) {
    throw new Error(
      'no remote channels configured — set the TWILIO_* and/or DISCORD_WEBHOOK_URL environment variables'
    )
  }

  const msg: DraftMessage = {
    kind: 'bot_error',
    message: `smoke test at ${new Date().toISOString()} — ignore`,
    consecutiveFailures: 0,
  }
  // eslint-disable-next-line no-console
  console.log(`sending to ${described.join(' + ')}: ${formatDraftMessage(msg)}`)

  for (let i = 0; i < notifiers.length; i++) {
    await notifiers[i].send(msg)
    // eslint-disable-next-line no-console
    console.log(`${described[i]} — sent`)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
