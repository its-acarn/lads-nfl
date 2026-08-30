# ExecPlan — Draft-Night Delivery: WhatsApp + Discord + a Remote Runner

This ExecPlan is a living document. The sections `Progress`, `Surprises &
Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up
to date as work proceeds.

## Purpose / Big Picture

The draft bot (Phase 3, complete) watches a live Sleeper draft and issues
single-name pick instructions — but only to a terminal on the machine it runs
on. On draft night (2026-09-05, 19:00 UTC) Andrew will be on his phone in the
Sleeper app, not at a terminal, and the commissioner relaying picks will be on
theirs.

This plan closes that gap, in two halves:

1. **Delivery.** Every message the bot emits also lands as a WhatsApp DM to
   two phones (Andrew and the relay, via the Twilio Sandbox for WhatsApp) and
   as a post in a Discord channel (via a webhook). One failing channel never
   silences the others.
2. **Remote start.** A GitHub Actions workflow runs the bot on a runner with
   open egress. Andrew can start it from the GitHub mobile app
   (`workflow_dispatch`), and a scheduled cron starts it automatically at
   18:15 UTC on draft day as a safety net — **guarded so it only ever
   auto-starts on 2026-09-05**, because GitHub cron has no year field and
   would otherwise refire every September.

When it works: Andrew taps "Run workflow" (or does nothing and the cron
fires), and within ~3 minutes his phone buzzes with

    READY — 12 teams, 14 rounds, you are slot N.
    Your picks: ...

— which is also the proof, before pick 1, that the WhatsApp session window and
the Discord webhook are both live.

## Non-Goals

- **No inbound messages.** The design has no approve/override reply loop; the
  Sleeper picks feed is the only confirmation channel (the API is read-only).
- **No WhatsApp group chat.** The WhatsApp Business Platform (which Twilio
  resells) cannot post into group chats. Groups are what the Discord channel
  is for.
- **No Sleeper league-chat posting.** Sleeper's public API has no write
  endpoints; its internal GraphQL API needs a session token and is
  unsupported. Rejected.
- **No Telegram**, no production (non-sandbox) Twilio number, no Meta Cloud
  API. The sandbox is enough for one draft night; upgrade later if the 72-hour
  re-join ritual grates.
- **Re-tiering the board / setting `draftReady`.** A prerequisite for live
  use (the bot refuses to start without it) but human judgement, not code.

## Definitions

- **Notifier** — the one-method interface (`send(msg: DraftMessage)`) in
  `helpers/draft/types.ts` through which the bot emits every message.
  Implementations live in `helpers/draft/notifier.ts`: `ConsoleNotifier`
  (stdout), `JsonlNotifier` (append-only JSON log), `MultiNotifier` (fan-out
  that isolates per-channel failures).
- **DraftMessage** — the discriminated union of everything the bot can say
  (`loaded`, `heads_up`, `on_clock`, `escalation`, `pick_confirmed`,
  `pick_mismatch`, `draft_paused`, `draft_resumed`, `draft_complete`,
  `bot_error`), defined in `helpers/draft/types.ts`.
- **Audience** — `formatDraftMessage(msg, audience)` in
  `helpers/draft/notifier.ts` renders a message for `'public'` (safe to share
  with the league: at most one player name, no survival forecast) or
  `'private'` (Andrew only: includes the survival percentage). Default is
  `'public'` — forgetting the argument leaks nothing.
- **Twilio Sandbox for WhatsApp** — Twilio's shared test number
  (`whatsapp:+14155238886`). A recipient opts in by texting `join <two-words>`
  to it; the join lapses after ~72 hours. Sending is one
  `POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json` with
  HTTP Basic auth (Account SID / Auth Token) and a form-encoded body
  (`From`, `To`, `Body`). No SDK required.
- **Session window** — WhatsApp allows freeform (non-template) messages only
  within 24 hours of the recipient's last inbound message. The draft-morning
  `join` text opens it for the whole draft.
- **Discord webhook** — a channel-scoped URL; `POST` JSON `{"content": "..."}`
  posts a message. Free, no bot account, ~30 requests/min limit (the bot
  emits ~1 message per pick). Content is capped at 2000 characters.
- **`workflow_dispatch` / `schedule`** — GitHub Actions triggers: a manual
  "Run workflow" button (also in the GitHub mobile app) and a UTC cron.
- **Sent-log** — `.draftbot/sent-log.<draftId>.json`; every message is keyed
  `(kind, pickNo)` so a restarted bot never re-sends.

## Progress

- [x] (2026-08-30) M1 — `TwilioWhatsAppNotifier` + `DiscordNotifier` in
      `helpers/draft/remoteNotifiers.ts`, 8 specs against an injected fake
      `fetch` (auth/body/audience/truncation/abort-signal/failure-isolation).
- [x] (2026-08-30) M2 — `remoteNotifiersFromEnv` builds the channel stack
      (6 more specs: per-recipient audiences, optional recipients,
      half-configured channels throw naming the gap); `ConsoleNotifier` takes
      an `audience`; `scripts/draftbot.ts` wires it all plus
      `--console-audience`; `npm run notify:test` added and proven end-to-end
      against a local fake webhook (delivery observed, HTTP 204). **Still
      open: the one real-credentials send once Andrew has Twilio/Discord set
      up (Concrete Steps item 4).**
- [x] (2026-08-30) M3 — `.github/workflows/draft-bot.yml` written: dispatch +
      cron with the 2026-09-05 guard (logic table-tested locally: 2026-09-05
      starts, 2026-09-04 and 2027-09-05 refuse), `concurrency: draft-bot`,
      player-map refresh, log artifact. YAML parse-checked. **Still open: one
      green dispatch against a Sleeper mock after secrets exist (Concrete
      Steps item 6).**
- [x] (2026-08-30) M4 — `docs/mock-rehearsal.md` gains "Draft night,
      remotely" (channels table, audiences, sandbox-join lapse, remote start,
      checklist); Phase 4 as-built decisions appended to
      `docs/DRAFT_BOT_PLAN.md`.

- [x] (2026-08-30) M5 — Twilio pivot: `VonageWhatsAppNotifier` (6 more specs:
      endpoint/auth/JSON shape, `+`-stripping, audiences, 429 retry-once,
      error detail), `VONAGE_*` env set in the builder, workflow and runbook
      updated. Twilio notifier kept for a paid account; Vonage is the live
      provider. **Still open: real-credentials smoke once Andrew's Vonage
      account exists.**

Suite: 319 tests green (was 307). Branch: `draft-night-delivery`.

## Surprises & Discoveries

- The `Response` constructor refuses a body on status 204, which is exactly
  what Discord returns on success — the test fake had to send `null` at 204.
  Faithful to production, found only because the fake used real `Response`
  objects rather than duck-typed stubs.
- **Twilio's trial tier cannot send freeform WhatsApp at all.** The design
  assumed the classic join-code sandbox (freeform inside a 24-hour session).
  New accounts get the "Try out WhatsApp" experience instead, whose API
  requires `ContentSid` — one of Twilio's own canned templates — with
  freeform `Body` prohibited regardless of session. Observed live
  (`HTTP 400: ContentSid Required` with a correct from/to and an open
  session), then confirmed in Twilio's trial docs. The classic sandbox
  survives only in the legacy Console, which Andrew's account cannot reach,
  and upgrading needs a £20 top-up. Pivoted to the Vonage Messages API
  sandbox (M5): freeform in-session, Basic auth, free — fair use 100
  messages/month, which is one draft night to two phones and no more.
- Vonage wants E.164 numbers WITHOUT the leading `+`, and its sandbox rate
  limit is one message per second — two recipients get their copies back to
  back, so the notifier retries a 429 once after 1.1 s.

## Decision Log

| Decision | Rationale | Date |
| :-- | :-- | :-- |
| Twilio Sandbox over Meta Cloud API | Working in minutes, no business verification; the 72-hour re-join is an acceptable draft-morning checklist item. Same platform underneath, so no capability lost | 2026-08-30 |
| Discord for the group audience | WhatsApp Business Platform cannot post to group chats at all; Discord webhooks are free, instant, and need no bot account | 2026-08-30 |
| Raw `fetch`, no Twilio/Discord SDKs | Both APIs are one POST each; repo convention keeps the dependency tree flat (see the no-schema-lib decision in `docs/DRAFT_BOT_PLAN.md`) | 2026-08-30 |
| Two WhatsApp env vars, `_PRIVATE` and `_PUBLIC` | Andrew's own DM should carry the survival forecast (the console used to be where he saw it; on a runner there is no console he watches). The relay's DM and the Discord channel get the public rendering. Reuses the existing `Audience` mechanism instead of inventing a per-recipient config format | 2026-08-30 |
| Runner console renders `'public'` | The repo is public, so Actions logs are world-readable; the private rendering (survival %) must not appear there. Locally the console stays `'private'` | 2026-08-30 |
| The existing `loaded` message is the smoke message | It already flows through every notifier at startup, before the draft begins — no new `DraftMessage` kind needed | 2026-08-30 |
| Cron guard is a date check inside the job, not just the cron expression | GitHub cron has no year field; `15 18 5 9 *` would refire 2027-09-05. A step exits the job unless `date -u +%F` equals `2026-09-05` (dispatch runs are never guarded) | 2026-08-30 |
| `concurrency: draft-bot`, no cancel-in-progress | Manual + cron double-start must not run two pollers at once (each would send its own copy of new messages — separate sent-logs on separate runners). The duplicate queues, then exits quickly because the draft is complete or the other run holds the group | 2026-08-30 |
| Notifier failures stay inside `MultiNotifier` | Already built and tested (rehearsal plan M2): first failure per channel is reported once to stderr; the draft never stops for a delivery fault | 2026-08-30 |
| WhatsApp provider: Vonage sandbox, Twilio kept as the paid-account alternative | Twilio trial forbids freeform (see Surprises); Vonage's sandbox allows it in-session for free. Telegram rejected by Andrew — nobody in the league has it. Meta Cloud API rejected for setup friction (permanent-token ritual). Both WhatsApp providers sit behind the same env-var shape, armed by whichever set is present | 2026-08-30 |

## Outcomes & Retrospective

*(to be filled at closeout)*

## Context and Orientation

The repo is a Next.js site for a Sleeper fantasy league, with a pure-TypeScript
draft engine in `helpers/draft/` and CLI entry points in `scripts/` run via
`tsx` (Node ≥ 20; tests via `vitest`, `npm test`). The bot never makes a pick —
Sleeper's API is read-only — it watches `GET /draft/<id>/picks` and instructs.

Key existing pieces this plan builds on (all already tested and rehearsed):

- `helpers/draft/notifier.ts` — `formatDraftMessage(msg, audience)`,
  `ConsoleNotifier` (currently hard-coded `'private'`), `JsonlNotifier`,
  `MultiNotifier`.
- `helpers/draft/bot.ts` — the poll loop and state machine (`runBot`), which
  emits the `loaded` READY message at startup and every subsequent message
  through the injected `Notifier`.
- `scripts/draftbot.ts` — CLI wiring: live mode (`npm run bot`), mock mode
  (`--mock <draftId>`), dry-run replay (`--dry-run --fixtures ...`); the
  sent-log; three live-mode gates (real ids, `draftReady: true`, player map
  fresher than 48 h).
- `scripts/fetchFixtures.ts` (`npm run fixtures`) — refreshes
  `fixtures/players.trim.json` + `players.trim.meta.json`, which the freshness
  gate reads.
- `docs/mock-rehearsal.md` — the operator runbook this plan extends.

Configuration: `config/board.json` carries the live 2026 league id
(`1325817907900354560`), draft id (`1325817907912904704`, scheduled
2026-09-05 19:00 UTC, snake, 12 teams, 14 rounds) and Andrew's user id. It is
**not yet marked `draftReady`** — as imported the board is an unedited
rankings export. The bot's live mode refuses to start until that is fixed;
this plan does not change that gate.

The repo is **public** on GitHub (`its-acarn/lads-nfl`), which matters twice:
Actions minutes are free, and Actions logs are world-readable (hence the
public console rendering on the runner).

## Plan of Work

### M1 — Channel notifiers (`helpers/draft/remoteNotifiers.ts`)

New file, so `notifier.ts` (local channels) stays separate from
network-backed channels. Both classes take an injected `fetch` (defaulting to
the global) so tests never touch the network — same pattern as the fixture
feeds.

`TwilioWhatsAppNotifier implements Notifier`:

- Constructor: `{ accountSid, authToken, from, to, audience, fetchFn? }` —
  one instance per recipient; `from`/`to` are E.164 numbers *without* the
  `whatsapp:` prefix (the class adds it).
- `send(msg)`: render with `formatDraftMessage(msg, this.audience)`, then
  `POST https://api.twilio.com/2010-04-01/Accounts/<accountSid>/Messages.json`
  with `Authorization: Basic base64(sid:token)`,
  `Content-Type: application/x-www-form-urlencoded`, body
  `From=whatsapp:<from>&To=whatsapp:<to>&Body=<text>` (URL-encoded).
- Non-2xx → throw with status and the `message` field of Twilio's JSON error
  body when parseable. `MultiNotifier` catches and reports it; this class
  never swallows.
- 15-second `AbortController` timeout, same as the Sleeper feeds.

`DiscordNotifier implements Notifier`:

- Constructor: `{ webhookUrl, audience, fetchFn? }` (audience `'public'` in
  practice, but injectable for symmetry and tests).
- `send(msg)`: `POST <webhookUrl>` with JSON `{"content": text}`. Truncate
  `text` to 1900 characters with a trailing `…` — only `draft_complete`'s
  roster summary could plausibly approach Discord's 2000-char cap. Non-2xx →
  throw. Same 15-second timeout.

Tests (`helpers/draft/remoteNotifiers.test.ts`, fake fetch): URL, auth
header, form/JSON body shape and encoding (a name like "Ja'Marr Chase" must
survive), audience passed through to the renderer (private DM contains
`% survives`, public does not), non-2xx throws with the status in the
message, truncation at the Discord cap, and — via `MultiNotifier` — that one
channel throwing does not stop the others.

### M2 — Environment wiring (`scripts/draftbot.ts`, `helpers/draft/notifier.ts`)

- `ConsoleNotifier` gains a constructor option `audience` (default
  `'private'`, preserving today's behaviour everywhere).
- `scripts/draftbot.ts` builds the notifier stack: console (audience from
  `--console-audience public|private`, default private) + JSONL when `--log`
  is given (unchanged) + one `TwilioWhatsAppNotifier` per configured
  recipient + `DiscordNotifier` when configured, all under the existing
  `MultiNotifier`. Configuration is env-driven; **with none of the variables
  set, behaviour is byte-for-byte today's** (console-only):

      TWILIO_ACCOUNT_SID        Twilio account SID
      TWILIO_AUTH_TOKEN         Twilio auth token
      TWILIO_WHATSAPP_FROM      sandbox number, e.g. +14155238886
      TWILIO_WHATSAPP_TO_PRIVATE   Andrew's number (gets the private rendering)
      TWILIO_WHATSAPP_TO_PUBLIC    the relay's number (public rendering)
  
      DISCORD_WEBHOOK_URL       channel webhook (public rendering)

  Either WhatsApp recipient may be omitted. If any Twilio variable is set but
  the set is incomplete (e.g. SID without token), fail at startup with a
  message naming the missing variable — a half-configured channel discovered
  at pick 1 is the failure mode this check exists to prevent.
- At startup, print which channels are armed (never the secrets):
  `channels: console(private) + whatsapp(2) + discord`.
- New npm script `"notify:test": "tsx scripts/notifySmoke.ts"` — a ~30-line
  script that builds the same env-driven stack and sends one synthetic
  `bot_error`-kind message ("smoke test — ignore") through it, so channels
  can be proven without a draft. This is also the draft-morning check.

### M3 — The runner (`.github/workflows/draft-bot.yml`)

    name: draft-bot
    on:
      workflow_dispatch:
        inputs:
          mock_draft_id:
            description: 'Optional Sleeper mock draft id (runs --mock instead of live)'
            required: false
      schedule:
        - cron: '15 18 5 9 *'     # 18:15 UTC every Sep 5 — year-guarded below
    concurrency:
      group: draft-bot            # never two pollers at once
    jobs:
      bot:
        runs-on: ubuntu-latest
        timeout-minutes: 350
        steps:
          - name: Auto-start only on draft day 2026
            if: github.event_name == 'schedule'
            run: |
              if [ "$(date -u +%F)" != "2026-09-05" ]; then
                echo "Not 2026-09-05 — refusing to auto-start. (Manual dispatch is never guarded.)"
                exit 1
              fi
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 20 }
          - run: npm ci
          - run: npm run fixtures          # satisfies the 48-hour player-map gate
          - name: Run the bot
            env:
              TWILIO_ACCOUNT_SID: ${{ secrets.TWILIO_ACCOUNT_SID }}
              TWILIO_AUTH_TOKEN: ${{ secrets.TWILIO_AUTH_TOKEN }}
              TWILIO_WHATSAPP_FROM: ${{ secrets.TWILIO_WHATSAPP_FROM }}
              TWILIO_WHATSAPP_TO_PRIVATE: ${{ secrets.TWILIO_WHATSAPP_TO_PRIVATE }}
              TWILIO_WHATSAPP_TO_PUBLIC: ${{ secrets.TWILIO_WHATSAPP_TO_PUBLIC }}
              DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
            run: |
              MOCK="${{ inputs.mock_draft_id }}"
              npm run bot -- ${MOCK:+--mock $MOCK} --console-audience public --log logs/run.jsonl
          - name: Upload message log
            if: always()
            uses: actions/upload-artifact@v4
            with:
              name: draft-log-${{ github.run_id }}
              path: logs/run.jsonl
              if-no-files-found: ignore

Notes, to be preserved as comments in the file itself:

- The guard step *fails* (exit 1) rather than soft-skips on the wrong date, so
  a misfired schedule is visible in the Actions list rather than a silent
  green no-op. It cannot fire on any date other than Sep 5 anyway (the cron
  handles month/day); the guard adds the year.
- `exit 1` on the guard also means: **delete the `schedule:` block after
  draft day** — the plan's closeout includes this, and the guard makes
  forgetting harmless (one red run per year, no bot started).
- The sent-log is per-runner and ephemeral. Crash-restart *within* a run is
  covered (the job restarts nothing by itself); if the job dies outright,
  re-dispatching starts a fresh runner whose sent-log is empty — the bot
  rebuilds state from the picks feed, and duplicate copies of *past* messages
  are not re-sent because messages are only emitted on state transitions the
  new process hasn't seen... which it *would* re-derive for the current
  on-clock pick. Accepted: the cost is one repeated instruction, the
  alternative (persisting the sent-log across runners) is not worth it for
  one night.
- `npm run fixtures` also snapshots league history; only
  `fixtures/players.trim.json` + meta matter here. Nothing is committed.

### M4 — Documentation

- `docs/mock-rehearsal.md`: add a "Draft night, remotely" section — secrets
  table, how to dispatch from the GitHub mobile app (repo → Actions →
  draft-bot → Run workflow), the cron safety net and its 2026-09-05 guard,
  and the draft-morning checklist:
  1. Both phones re-text `join <code>` to the Twilio sandbox number
     (joins lapse after 72 h; this also opens the 24 h freeform window).
  2. `npm run notify:test` (locally) or a `mock_draft_id` dispatch proves all
     channels end-to-end.
  3. Board re-tiered and `draftReady: true` set, `npm run resolve-board`
     re-run — the bot refuses to start live without it.
- `docs/DRAFT_BOT_PLAN.md`: one row per decision above appended to the
  decision-log table (the plan is the design record of the bot).

## Interfaces and Data Shapes

New public surface (all internal to this repo):

- `TwilioWhatsAppNotifier`, `DiscordNotifier` in
  `helpers/draft/remoteNotifiers.ts`, both `implements Notifier`.
- `ConsoleNotifier` constructor accepts `audience?: Audience`.
- `scripts/draftbot.ts` flags: `--console-audience public|private`.
- Env variables and GitHub secrets as listed in M2/M3.
- npm scripts: `notify:test`.
- `.github/workflows/draft-bot.yml` with the two triggers described.

No engine, state-machine, or message-copy changes. The `DraftMessage` union
is untouched.

## Concrete Steps

All commands from the repo root (`/Users/andrew/orca/lads-nfl`).

1. Branch: `git checkout main && git pull && git checkout -b draft-night-delivery`
2. M1: write `helpers/draft/remoteNotifiers.test.ts` first, then
   `helpers/draft/remoteNotifiers.ts`. `npm test` — expect the new specs
   green, 247 existing tests untouched.
3. M2: `helpers/draft/notifier.ts` (audience option), `scripts/draftbot.ts`
   (env-driven stack, flag), `scripts/notifySmoke.ts`, `package.json`.
   `npm test` again; then a console-only sanity run:

       npm run bot -- --dry-run --fixtures fixtures/lads/2024 --slot 1 --speed 200

   expect the usual dry-run summary line `completed=true ... (criterion < 25)`.
4. **Andrew (one-time setup, ~15 min):**
   - Twilio: create account → Messaging → Try WhatsApp; note Account SID,
     Auth Token, sandbox number and join code; both recipients text the join
     code.
   - Discord: channel → Settings → Integrations → Webhooks → New Webhook →
     copy URL.
   - Locally: export the six env vars, run `npm run notify:test`, confirm
     both phones and the channel receive the smoke message.
   - GitHub: add the six values as repo Actions secrets (Settings → Secrets
     and variables → Actions), or `gh secret set <NAME>` for each.
5. M3: add the workflow; push the branch; verify the cron guard logic locally
   first:

       DATE=2027-09-05; [ "$DATE" != "2026-09-05" ] && echo "refused"   # prints: refused

6. End-to-end rehearsal: create a Sleeper mock, dispatch `draft-bot` from the
   Actions tab with `mock_draft_id`, draft a few picks in the app, confirm
   WhatsApp/Discord messages arrive and the log artifact appears when the run
   ends.
7. M4 docs, then PR to `main` (build gate: `npm test` + `npm run build`).

## Validation and Acceptance

- `npm test` green, including the new `remoteNotifiers` specs (fake-fetch:
  auth/body/audience/truncation/failure-isolation).
- With no new env vars set, `npm run bot -- --dry-run ...` output is
  unchanged from today (console-only; no `channels:` regression beyond the
  new line naming `console` alone).
- `npm run notify:test` with real credentials delivers one message to both
  WhatsApp numbers and the Discord channel; Andrew's copy contains
  `% survives`-style private rendering **only** on his number. *(Observed by
  a human; this is the one non-automatable check.)*
- Manual `workflow_dispatch` with a `mock_draft_id` runs green: the READY
  message reaches all channels; the JSONL log downloads as an artifact.
- A `schedule` event on any date other than 2026-09-05 fails at the guard
  step with the refusal message and starts nothing (verifiable only after a
  real scheduled firing; the local `[ ... ]` check in Concrete Steps stands
  in for it before then).
- Grep the Actions log of a runner-executed draft: no occurrence of
  `survives` (public console rendering holds on the world-readable log).

## Idempotence and Recovery

- Every delivery channel is behind `MultiNotifier`: a channel that dies is
  reported once and skipped; the draft continues on the survivors. The
  console (or on the runner, the Actions log) is the channel of last resort.
- Sent-log semantics are unchanged: kill and restart the bot *process* and
  nothing re-sends. A fresh *runner* re-derives only the current on-clock
  instruction (accepted, see M3 notes).
- The cron guard makes the schedule trigger self-disarming outside
  2026-09-05; `concurrency: draft-bot` makes manual + cron double-starts
  safe (second run queues, then finds the draft complete and exits).
- Twilio sandbox joins lapse after 72 h — recovery is re-texting the join
  code; the smoke send exists to catch this before pick 1.
- All secrets live in Twilio/Discord dashboards and GitHub secrets; nothing
  secret is ever committed. Rotating the Twilio token or webhook URL is a
  dashboard action plus a secret update, no code change.

## Artifacts and Notes

*(transcripts and evidence to be added as milestones complete)*
