# ExecPlan — Mock-Draft Rehearsal

A repeatable procedure for drafting a Sleeper mock against Andrew's real board,
with the assistant relaying instructions in chat, ending in a written account of
the team he got.

## Purpose

Andrew wants one loop he can run whenever he likes:

1. Set up a mock draft on Sleeper.
2. Hand the assistant the mock's draft id.
3. The assistant arms the bot against it and waits.
4. When the room starts drafting, the assistant reads Andrew's board and tells
   him who to take, at the right moments.
5. Andrew makes the picks in the Sleeper app.
6. The assistant surfaces the team he ended up with.

Most of the machinery for this already exists and is verified (see *What
already exists*). Three things are missing, and this plan supplies them:

- **The board is not Andrew's board.** `config/board.json` currently holds a
  ten-player placeholder. A rehearsal against it tests nothing.
- **The bot's output goes only to a terminal.** For the assistant to narrate a
  draft it must be able to read the bot's messages as data, not scrape console
  text.
- **The end-of-draft summary is one line of text.** "Surface the team I got"
  deserves a real account: what was taken, in what round, where the board ranked
  each player, and what was passed over to take them.

**This plan is blocked on one input Andrew must supply: the URL (or document id)
of his 2026 board spreadsheet, and the name of the tab holding the tiers.** The
only sheet the repository knows about is the 2025 one. Milestone 1 cannot
complete without it; Milestones 2 and 3 can be built and proven in the meantime
against committed fixtures.

## Progress

- [ ] **M1 — Andrew's 2026 board, imported and resolved.** Blocked on the 2026
      sheet URL and tab name.
- [ ] **M2 — Machine-readable message log.** `--log <path>` writes one JSON
      object per message. Not blocked.
- [ ] **M3 — Team report.** `npm run team` renders a completed draft. Not
      blocked.
- [ ] **M4 — The runbook.** The procedure written down, then exercised
      end-to-end against a real mock.

Nothing in this plan has been started. The branch is
`claude/mock-draft-smoke-test`, which already carries the `--mock` flag and the
`loaded` message this plan builds on (commit `a384be6`).

## Surprises & Discoveries

Recorded during design, before implementation, by querying Sleeper's public API
directly. Each of these changed the plan.

**Mock drafts are not discoverable.** `GET /user/<id>/drafts/nfl/2026` returns
Andrew's five real league drafts and does *not* list mocks — checked against a
mock known to exist. There is therefore no "find my latest mock" autodetect, and
the id must be pasted from the browser URL. This removes a step the plan would
otherwise have tried to automate.

**A mock's `league_id` is null, but a *league mock* carries the real league in
`metadata.league_id`.** Andrew's mock `1394452945935794176` reported
`metadata.league_id = 1325817907900354560` — the real LadsLadsLads league — with
`type: league_mock`. That is how the bot recovers `roster_positions` for a
draft that has no league of its own.

**`slot_to_roster_id` is present on a mock and is already the identity
mapping.** This had been predicted to be missing and to need synthesising. It
does not. For a mock, where no rosters exist, identity is the accurate model
rather than a fudge.

**Mocks expire in `pre_draft`.** The mock created for the earlier smoke test was
still `status: pre_draft` with zero picks when re-checked two days later; the
room never filled and the draft never began. A mock is not a durable artifact —
the rehearsal has to be run while the room is live, and a stale id will simply
wait forever. The bot's behaviour here is correct (it polls and waits) but the
runbook must say so, or a waiting bot looks like a hung one.

**The pick clock on that mock was 120 seconds.** That is the budget the whole
relay chain has to fit inside, and it is what makes the console the primary
channel and the assistant the secondary one.

## Decision Log

**D1 — The board import writes names, not ids.** `scripts/importSheet.ts`
resolves player ids itself, through the backtest's `buildIdIndex`, and writes a
`ResolvedBoard`. The new importer will instead write a `BoardInput` — names,
positions, tiers, ranks — and leave id resolution to the existing
`npm run resolve-board`. *Rationale:* `resolveBoard.ts` refuses to guess and
exits non-zero with a per-name report on every unresolved or ambiguous entry.
That check is exactly what should stand between a spreadsheet and a live draft,
where a silent mismatch means the wrong player's name on the clock. The
backtest's more forgiving resolver was appropriate to reconstructing history; it
is not appropriate here.

**D2 — The assistant reads a JSONL log, not the console.** Console output is
formatted for a phone screen and is explicitly the Phase 3 deliverable — its
wording will change. Parsing it would couple the assistant to copy that is meant
to be edited freely. *Rationale:* a structured log is stable, and the
`DraftMessage` union is already the type the notifier consumes.

**D3 — The log appends; it never truncates.** *Rationale:* the bot is already
crash-safe — kill it mid-draft and restart, and it re-derives state from the
feed and emits no duplicate instructions. A log that truncated on restart would
throw away the first half of the record precisely when something has gone wrong
and the record matters most.

**D4 — No "tell me when it starts" step.** Andrew's sketch had him telling the
assistant when the draft began. The bot already handles `pre_draft` by sleeping
and re-polling (`helpers/draft/bot.ts:205`), so it picks up the transition on
its own. *Rationale:* a step that can be deleted is better than a step that can
be forgotten.

**D5 — No offline draft simulator, deliberately.** An alternative was proposed
during design: simulate two hundred drafts at Andrew's slot against the ADP
opponent model in a few seconds, and report which players he gets and how often.
It is the more repeatable loop and the better board-tuning instrument. Andrew
chose the live path. *Rationale for recording it:* the two are complements, not
rivals — a future reader wondering why board tuning is slow should know the
option was considered and is still open.

**D6 — The team report reads a completed draft by id, not only the bot's own
final state.** *Rationale:* it then works on any draft, including the real
September one and past seasons, rather than only on drafts the bot happened to
watch.

## Outcomes & Retrospective

Not started. To be completed at the end of M4.

## Context

### What this repository is

`its-acarn/lads-nfl` is a Next.js site for a fantasy American-football league
called LadsLadsLads, deployed as a static export to GitHub Pages. Underneath
`helpers/draft/` sits a self-contained TypeScript draft assistant with no React
or Next imports; nothing in `pages/` imports it, and it does not affect the
deployed site. Tests are vitest (`npm test`), scripts run under `tsx`, and the
TypeScript target is ES5 with `strict` on and without `downlevelIteration` —
which means indexed `for` loops, never `for...of` over a `Map` or `Set`.

The assistant **never makes a pick.** Sleeper's public API is read-only. The bot
watches the pick feed, tells a human what to draft, and then verifies from the
feed what actually landed.

### Terms used in this plan

**Sleeper** — the platform hosting the league. Its public read API needs no
authentication.

**Draft id** — the number in a Sleeper draft URL, e.g.
`https://sleeper.app/draft/nfl/1394452945935794176`.

**Mock draft** — a practice draft. Anyone can create one; it has no league
behind it and no lasting consequence.

**League mock** — a mock created from inside a league, which Sleeper stamps with
that league's id under `metadata.league_id`. Andrew's mocks are of this kind, so
they inherit the real lineup.

**Board** — Andrew's own ranked, tiered list of players: what he wants,
independent of what the market thinks. Lives in `config/board.json`.

**Tier** — a group of players the board treats as near-interchangeable. Value
falls sharply between tiers and only slightly within one, which is what lets the
engine say "any of these three, so take the scarce position first".

**ADP** — average draft position, the market's consensus. Used only to predict
what *other* managers will do, never to decide what Andrew should want. Keeping
these apart is a load-bearing property of the design.

**`BoardInput` vs `ResolvedBoard`** — the former is what a human writes: player
names. The latter is what the engine consumes: the same board with every name
resolved to a Sleeper `player_id`. `npm run resolve-board` turns one into the
other and refuses to guess.

**`DraftMessage`** — the union type in `helpers/draft/types.ts:306-321` covering
everything the bot can say: `loaded`, `heads_up`, `on_clock`, `escalation`,
`pick_confirmed`, `pick_mismatch`, `draft_paused`, `draft_resumed`,
`draft_complete`, `bot_error`.

**Snake draft** — pick order reverses each round: in a 12-team draft, slot 5
picks 5th, then 20th, then 29th, and so on.

### What already exists

Verified by reading the code and by running the bot against a live mock. None of
this needs building.

The bot waits through `pre_draft` and starts on its own when the status flips
(`bot.ts:205`). It emits `heads_up` with a shortlist as a pick approaches,
`on_clock` with a primary instruction and fallbacks, `escalation` when a pick is
not made in time, and `pick_confirmed` or `pick_mismatch` by reading the feed —
so Andrew never has to report what he picked. `draft_complete` carries a roster
summary. `npm run bot -- --mock <draftId>` runs against a mock, recovering the
lineup from `metadata.league_id` when present and from `settings.slots_*`
otherwise. A run against mock `1394452945935794176` printed:

    player map age: 0h (limit 48h) — OK
    MOCK DRAFT 1394452945935794176 — board has 10 players (NOT marked draft-ready)
    mock of league 1325817907900354560 — using its real lineup
    [20:38:29] READY — 12 teams, 14 rounds, you are slot 5.
               Your picks: 5, 20, 29, 44, 53, 68, 77, 92, 101, 116, 125, 140, 149, 164

That "board has 10 players" line is the gap M1 closes.

### Files this plan will create or change

Create:

- `helpers/draft/sheetBoard.ts` — Google Sheets tab fetch and tier-grid parse,
  extracted from `scripts/importSheet.ts` so one implementation serves both the
  backtest and the live board.
- `helpers/draft/sheetBoard.test.ts`
- `scripts/importBoard.ts` — the `npm run board:import` entry point.
- `helpers/draft/teamReport.ts` — the report logic, kept out of the script so it
  is testable.
- `helpers/draft/teamReport.test.ts`
- `scripts/team.ts` — the `npm run team` entry point.
- `docs/mock-rehearsal.md` — the runbook.

Change:

- `helpers/draft/notifier.ts` — add `JsonlNotifier` and `MultiNotifier`.
- `helpers/draft/notifier.test.ts`
- `scripts/draftbot.ts` — add `--log <path>`; wire the notifier at line 275.
- `scripts/importSheet.ts` — import the extracted parser rather than owning it.
- `config/board.json` — `players` replaced by the real 2026 board (M1's output).
- `package.json` — add `board:import` and `team` scripts.

### What Andrew must supply

**The 2026 board spreadsheet: its URL or document id, and the tab name holding
the tiers.** The 2025 sheet was
`1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88`, with the board on a tab called
`LLL Tiers` and an ADP list on a tab called `List`. If the 2026 board lives in
the same document under a new tab, the tab name alone is enough. It must be
shared as "anyone with the link can view" — the importer fetches CSV without
authenticating and fails with a clear message if the sheet returns HTML instead.

**Whether the 2026 tier columns are laid out as they were in 2025.** The
existing parser expects one column per tier, a tier block occupying spreadsheet
rows 2 to 24, and column headers drawn from `Tier 1` … `Tier 7`, `Last Tier`,
and `QB's`. A different layout is not a problem, but it is a code change rather
than a configuration change, and M1 should discover it early.

## Milestone 1 — Andrew's 2026 board, imported and resolved

The goal is that `config/board.json` holds Andrew's real, tiered 2026 board and
that every name in it resolves to a Sleeper player id, so that everything
downstream is testing the board he would actually draft from.

The work begins by extracting the reusable half of `scripts/importSheet.ts` into
`helpers/draft/sheetBoard.ts`: `parseCsv`, the gviz tab fetch (currently the
unexported `fetchTab`, which addresses a tab by name through
`https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<tab>`),
and `parseTiersTab` together with its `TIER_OF_HEADER` map and its row bounds.
`importSheet.ts` then imports them instead of owning them, so there is one
parser and not two. The new `scripts/importBoard.ts` reads the tiers tab and
writes `config/board.json`, replacing only the `players` array and preserving
every other key byte for byte — `season`, `leagueId`, `draftId`, `myUserId`,
`doNotDraft`, `pins`, the `rules` block, and the `//`-prefixed comment keys that
document it. The rules block encodes tuning Andrew has already done (one QB, one
TE, no kicker, no defense, `vonaFromRound: 9`, `minRoundByPos.QB: 11`) and
overwriting it would be a real loss.

Two details decide whether the result is trustworthy. Ranks must be assigned
tier-major and then column-order within a tier, matching how the sheet reads, so
that the board's ordering is the sheet's ordering — the engine follows board
order outright below `vonaFromRound`, so a scrambled rank here is a wrong pick
in round one. And the importer must refuse to write a board that is obviously
wrong: fewer than fifty players, or a tier number absent from the header map, is
a hard failure rather than a warning, because a partially-parsed board looks
plausible and drafts badly.

The result is that `npm run board:import -- --sheet <url> --tab "<tab>"` followed
by `npm run resolve-board` produces `config/board.resolved.json` with every name
matched. `resolve-board` already reports and exits non-zero on anything it
cannot resolve unambiguously; names it rejects are corrected in the sheet, or
added to the sheet's spelling, rather than forced through.

The proof is that both commands exit zero, that `resolve-board` prints a
resolved count equal to the number of players imported, and that the count is
materially larger than the current ten. As a second check, the plan records the
first fifteen names of the resolved board in the Outcomes section, so a later
reader can see at a glance whether the ordering matches the sheet.

## Milestone 2 — Machine-readable message log

The goal is that everything the bot says is simultaneously written as data, so a
second reader can follow a draft without parsing text meant for a phone screen.

The work adds two classes to `helpers/draft/notifier.ts`. `JsonlNotifier` takes
a file path, opens an append stream once, and writes
`JSON.stringify({ ts, ...msg })` followed by a newline on every `send`.
`MultiNotifier` takes an array of notifiers and awaits each in turn. A failure in
one must not take down the others or the draft: a disk that fills mid-draft
should cost the log, not the rehearsal, so `MultiNotifier` catches, reports the
failure once to the console, and continues. `scripts/draftbot.ts` gains
`--log <path>`, and line 275 becomes a conditional: a `MultiNotifier` wrapping
both when the flag is present, the bare `ConsoleNotifier` when it is not.

The stream opens in append mode, never truncating. The bot is already crash-safe
— killed mid-draft and restarted, it re-derives state from the feed and repeats
no instruction — and the log must preserve that property rather than undermine
it. `logs/` joins `.gitignore`: a rehearsal log is working material, and
committing one would put a mock draft's noise into the repository permanently.

The result is that `npm run bot -- --mock <id> --log run.jsonl` prints exactly
what it printed before and additionally leaves a file whose every line is one
`DraftMessage`.

The proof is a spec in `notifier.test.ts` that runs a sequence of messages
through a `MultiNotifier` over a temporary file and asserts three things: that
the number of lines equals the number of sends, that every line parses as JSON
and carries a `kind` present in the `DraftMessage` union, and that a second
`JsonlNotifier` opened on the same path appends rather than truncates. A fourth
case asserts that a notifier which throws does not prevent its siblings from
receiving the message.

## Milestone 3 — Team report

The goal is that one command turns a finished draft into a readable account of
the team, good enough that Andrew can judge whether the board did its job.

The work puts the logic in `helpers/draft/teamReport.ts` and a thin CLI in
`scripts/team.ts`, invoked as `npm run team -- --draft <id> [--log <path>]`, with
`--fixtures <dir>` as an offline alternative for testing. It fetches the draft
and its picks, builds state through the existing `buildState`, and renders
Markdown to stdout with three sections.

First, the roster in pick order: round, overall pick number, position, name,
and — where the board knows the player — their board rank and tier. Second, the
roster by position, which is what tells Andrew at a glance whether he came out
with a startable lineup. Third, and most useful, what each pick cost: for every
pick, the players the board ranked *above* the one taken who were still
available at that moment. That column is the honest measure of whether the board
was followed, and it is the one thing a Sleeper screenshot cannot show.

Given `--log`, a fourth section joins the `on_clock` instructions against what
actually landed and states how often the recommendation was taken, how often it
was overridden, and what was taken instead. Without the log this section is
omitted rather than guessed at — the feed alone cannot distinguish a considered
override from a recommendation that never arrived.

The result is a report that works on any completed draft: this mock, the real
September draft, or any of the committed fixtures.

The proof is a spec that runs the report over the committed `fixtures/lads/2025`
draft at Andrew's slot and asserts that the roster contains fourteen players
with no duplicates, that every pick's round is consistent with the snake maths
in `snake.ts`, and that the "passed over" list for each pick contains only
players who were genuinely undrafted at that pick number. A second spec runs it
with a synthetic log and asserts the follow-versus-override counts sum to the
number of `on_clock` messages.

## Milestone 4 — The runbook, exercised

The goal is that the procedure exists as something Andrew can follow without
reconstructing it, and that it has been run at least once against a real mock
rather than only reasoned about.

The work writes `docs/mock-rehearsal.md` with the sequence below, then performs
it. Steps one and two are needed only when something has changed; the rehearsal
proper is steps three to six.

1. `npm run fixtures` — refresh the Sleeper player map. Live mode refuses a map
   older than 48 hours; mock mode warns but proceeds.
2. `npm run board:import -- --sheet <url> --tab "<tab>"` then
   `npm run resolve-board` — only when the sheet has changed.
3. Create the mock in the Sleeper app and copy the draft id out of the URL.
4. `npm run bot -- --mock <draftId> --log logs/<date>.jsonl` — this can be
   started before the room fills. The bot polls and waits through `pre_draft`;
   a bot that appears to be doing nothing is a bot that is waiting correctly.
5. Draft. The console carries the instruction the instant it is issued and is
   the channel to trust on a 120-second clock; the assistant reads the log and
   follows a beat later with reasoning and alternatives.
6. `npm run team -- --draft <draftId> --log logs/<date>.jsonl`.

The result is a rehearsal that can be repeated by pasting one id.

The proof is a real run: a mock drafted end to end, its report produced, and the
Outcomes section of this plan filled in with what the bot got right, what it got
wrong, and any wording in the messages that proved unclear under time pressure.
That last point is the real purpose of a rehearsal — the message copy has never
been read by anyone on a clock.

## Acceptance

Run from the repository root. Every command is safe to repeat.

**The board is real.**

    npm run board:import -- --sheet <url> --tab "<tab>"
    npm run resolve-board

The first prints the number of players and tiers parsed. The second exits zero
and prints a resolved count equal to it, with no unresolved names. Then:

    node -e "console.log(require('./config/board.resolved.json').players.length)"

prints a number well above ten.

**The log is machine-readable.**

    npm run bot -- --dry-run --fixtures fixtures/lads/2024 --slot 1 --speed 200 --log /tmp/rehearsal.jsonl
    wc -l /tmp/rehearsal.jsonl
    head -1 /tmp/rehearsal.jsonl | python3 -m json.tool

The dry run completes; the file has one line per console message; the first line
parses as JSON with a `kind` field.

**The report renders.**

    npm run team -- --fixtures fixtures/lads/2025 --slot 2

prints Markdown with fourteen players, each carrying a round and, where the
board knows them, a tier.

**The suite is green.**

    npm test
    npx tsc --noEmit
    npm run build

All three pass. The suite stands at 159 tests before this plan; it should grow
by the specs described in M2 and M3.

**The rehearsal itself.** A mock draft completed end to end with the bot
attached, and its report produced. This one is observed rather than asserted,
and its findings belong in Outcomes.

## What this plan does not cover

Stated plainly, so no one mistakes a green run for more than it is.

**A mock room is not the lads league.** Mocks fill with Sleeper autopick bots and
strangers whose behaviour has nothing to do with the eleven managers Andrew
actually drafts against. The *team* that comes out of a rehearsal is close to
meaningless as a prediction. What a rehearsal genuinely tests is the workflow,
the board, the message copy under time pressure, and whether the engine's
suggestions feel right to Andrew.

**The relay is not fast.** The assistant sits behind a polling loop, a file
write, and a chat round trip. On a 120-second clock that is comfortable; on a
30-second clock it would not be. The console is the channel to trust for speed.

**Nothing here scores the roster.** Whether the resulting team would win is not
asked and not answered.

**The board is only as good as the sheet.** The importer verifies structure —
that tiers parse, that names resolve, that the board is not implausibly short —
and cannot verify judgement.
