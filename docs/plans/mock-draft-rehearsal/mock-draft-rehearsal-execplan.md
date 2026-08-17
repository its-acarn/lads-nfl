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

**The 2026 sheet was supplied on 2026-08-16 and is imported.** Document
`1MR-Pj7QUEf3aq6cFoaQXdCP4cOJEIi7gW6JByXwxqLk` ("NFL FANTASY 2026"), a single
tab. It is laid out nothing like the 2025 sheet — see *The 2026 sheet* below —
and one open question about its provenance is recorded there. Every milestone in
this plan is now complete.

## Progress

- [x] **M1 — Andrew's 2026 board, imported and resolved.** Done: **265 players,
      10 tiers, every name resolved.** `helpers/draft/sheetBoard.ts` owns the CSV
      reader, the gviz fetch and *both* tier parsers, and `scripts/importSheet.ts`
      imports them instead of owning them (its 21 specs pass unchanged, which is
      what proves the extraction was faithful). `scripts/importBoard.ts` +
      `npm run board:import` rewrites only the `players` array by textual
      splice; the rules block came through byte for byte, verified. 59 specs
      across the parser and the importer.
- [x] **M2 — Machine-readable message log.** `JsonlNotifier` + `MultiNotifier`;
      `--log <path>` on `npm run bot`. Appends, never truncates; a failing
      notifier is reported once and does not take down its siblings or the
      draft. `logs/` gitignored.
- [x] **M3 — Team report.** `helpers/draft/teamReport.ts` + `npm run team`,
      working from a draft id, a fixture directory, or either plus a log.
- [x] **M4 (rehearsal half) — done early, 2026-08-16.** A full 168-pick mock
      drafted with the bot attached, before M1–M3. Findings in Outcomes; the
      `roster_id` bug it exposed is fixed in `8549a6a`. **The draft is now
      committed as `fixtures/rehearsal2026/`**, so M5 and M8 replay it offline.
- [x] **M4 (runbook half) — `docs/mock-rehearsal.md`.** Written from observed
      behaviour, including the failure modes that looked like faults.
- [x] **M5 — Round floors become absolute.** All three breach paths removed.
      The golden corpus did not move, which is itself a finding: the override
      never fired in the lads/2024 replay, only live.
- [x] **M6 — Opponent roster awareness.** A per-position saturation factor over
      the rosters that actually pick in the gap, folded into the sampler as a
      log-appetite term. Moved one golden pick, in the right direction.
- [x] **M7 — One instruction, no alternatives.** Messages name at most one
      player; the bot re-instructs when that player is sniped mid-pick.
- [x] **M8 — Retune escalation for a relay.** Thresholds are now configurable
      fractions of the draft's own pick timer, raised from 1/3 and 3/4 to 0.6
      and 0.85.

The branch is `claude/mock-draft-smoke-test`. The suite stands at **247 tests**,
up from 160 at the start of this plan.

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

**A mock sits in `pre_draft` until its room fills.** The mock created for the
earlier smoke test (`1394452945935794176`, created 2026-08-15 21:33) was still
`status: pre_draft` with zero picks fifteen hours later, holding 1 of its 12
slots — Andrew's. Nothing had gone wrong; a mock simply does not begin until
someone starts it, and an empty room never will. A mock is not a durable
artifact —
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

**D7 — Round floors are absolute, with no escape hatch at all.** An earlier
design kept the scarcity override on the grounds that ending a draft without a
mandatory starter is worse than breaching a floor. That reasoning does not
survive contact with why the floor exists. *Rationale:* Andrew streams
quarterbacks. A floor of round 11 across a 14-round draft still leaves four
rounds to take one, so the catastrophic case the override guarded against
barely exists — while the case it caused, spending pick 101 on a quarterback,
destroys the strategy outright. Where the two risks are asymmetric like this,
the constraint wins. Recorded because the override was written deliberately and
removing it should look like a decision rather than an oversight.

**D8 — I was wrong to advise tiering the QB column and dropping the floor.**
Said after the rehearsal, reading the floor as a workaround for an untiered
column — which is what an earlier note in the repository called it. It is not:
it encodes a streaming strategy. Recorded because the plan should not leave a
wrong recommendation standing where a later reader might act on it.

**D9 — Opponent-awareness weighting is per-position and uneven.** Not applied
uniformly. *Rationale:* Andrew's own ordering — QB and TE matter most because
the lineup starts one of each, so a team holding one is effectively out of the
market; WR and RB matter least because two start plus two flex slots, and
managers keep drafting them long past nominal need. A uniform weight would
understate the QB effect and overstate the RB one.

**D6 — The team report reads a completed draft by id, not only the bot's own
final state.** *Rationale:* it then works on any draft, including the real
September one and past seasons, rather than only on drafts the bot happened to
watch.

## Outcomes & Retrospective

**A full rehearsal was run on 2026-08-16, out of order, before M1–M3.** Andrew
started mock `1394452945935794176` and the bot was attached for all 168 picks
from slot 5, 11:47:24 to 12:05:11 — under eighteen minutes, because eleven
autopick bots filled the room and picked instantly, stalling only on Andrew's
turns. It found more than the milestones it skipped would have.

**The headline: a bug that made mock mode structurally wrong.** Sleeper leaves
`roster_id` null on every pick of a mock. `state.ts` skipped any pick without
one, so the engine believed it held nobody all draft. Position caps stopped
binding — it offered a second tight end three times against `maxByPos.TE: 1`,
and on the final pick recommended a second quarterback against
`maxByPos.QB: 1`, violating the first rule in the config. Forced-starter logic
read an empty lineup. `DRAFT COMPLETE` printed a blank roster summary, which is
exactly the output this feature exists to produce. `K: 0` and `DEF: 0` survived
by luck, since `0 >= 0` holds whatever the count. Fixed in `8549a6a` by falling
back to `slot_to_roster_id[draft_slot]`, with a regression test that strips the
field from the lads/2024 fixture and asserts the state is identical either way.
No existing test could have caught it: all nine fixtures are real drafts, where
Sleeper populates the field.

**Every message type fired against live data.** One `READY`, fourteen
`ON THE CLOCK`, fourteen `STILL OPEN`, eight `CONFIRMED`, six `MISMATCH`, one
`HEADS UP`, one `DRAFT COMPLETE`. Before this the instruct-and-verify cycle had
only ever seen fixtures on an accelerated clock.

**Escalation fired on all fourteen picks, at ~42s and again at ~91s.** That is
not the bot being wrong; it is the relay being slow. Reading a recommendation in
chat and acting on it took longer than 42 seconds every single time. If the
assistant is in the loop, the first escalation threshold is mistuned — it will
cry wolf on every pick. Either raise it or exempt the first nudge when a relay
is attached.

**`HEADS UP` fired only once in fourteen picks.** With instant bots, every
intervening pick lands inside one poll cycle, so the bot never observes a state
where Andrew is one to three picks away — it goes straight from "just picked" to
"on the clock". Not a defect, but it means a bot-filled mock cannot exercise the
heads-up path, and a human-paced draft is needed to test it.

**The survival model has a structural blind spot.** `survival.ts:84` builds
utilities from `-searchRank / temperature` and nothing else, so the opponent
model cannot know that ten of twelve teams already hold a quarterback. It
predicted 0% survival for Bo Nix twice; he survived both times. Against that,
its 0% call on Mahomes was exactly right, and its 80% call on Garrett Wilson was
wrong in the other direction. Positional saturation is not modelled at all, and
QB is where that hurts most.

**The QB floor and the scarcity override worked, and their interaction is worth
keeping.** `minRoundByPos.QB: 11` held quarterbacks off the board while Allen
(pick 22), Jackson (35) and Maye (52) left. At pick 101 — round 9, exactly
`vonaFromRound: 9` — scarcity logic came online and the override punched through
the floor with an edge of +5.6, the largest of the draft to that point. The
first time that override has run outside a unit test. It then repeated the call
at 116 (+4.6), 125 (+6.0), 140 (+2.7) and 149 (+4.4) as Andrew passed each time.
Its reasoning was partly compromised by the roster bug — "unfilled starter slot"
was true for the wrong reason — so this should be re-checked now the fix is in.

**The resulting team**, for the record, though a bot-filled room says little
about the lads league:

    R1  #5    RB  Jonathan Taylor      R8  #92   RB  Jonathon Brooks
    R2  #20   WR  A.J. Brown           R9  #101  RB  Jonah Coleman
    R3  #29   TE  Trey McBride         R10 #116  WR  Matthew Golden
    R4  #44   WR  Zay Flowers          R11 #125  WR  Travis Hunter
    R5  #53   WR  Davante Adams        R12 #140  RB  Brian Robinson
    R6  #68   RB  RJ Harvey            R13 #149  QB  Baker Mayfield
    R7  #77   RB  Kyle Monangai        R14 #164  RB  Tyjae Spears

Seven RB, five WR, one TE, one QB. Startable against the league's lineup except
K and DEF, which the rules deliberately exclude.

**What the rehearsal did not test**, because the board was still the ten-player
placeholder: anything about Andrew's actual preferences. Nine of ten board names
were gone by pick 29 and every recommendation after that was ADP interpolation.
M1 remains the highest-value milestone, and a second rehearsal after it is the
only way to see the board itself under live conditions.

### The 2026 sheet

**It is a ranked table, not a tier grid.** The plan asked M1 to discover this
early, and it did. The 2025 sheet was one column per tier with a hard row bound;
the 2026 sheet is one row per player:

    RK | TIERS | PLAYER NAME | TEAM | POS | BYE WEEK | UPSIDE | BUST | SOS SEASON | ECR VS. ADP
     1 |     1 | Jahmyr Gibbs| DET  | RB1 |        6 | ...

878 rows, 16 tiers, ranks strictly 1..878 with no gaps, tiers perfectly monotone,
no duplicate names. Both layouts are now supported and told apart by their header
row, because the 2025 grid still has to work for the backtest.

**One open question, which is Andrew's to answer: this is consensus, not
preference.** The `UPSIDE`, `BUST`, `SOS SEASON` and `ECR VS. ADP` columns are
FantasyPros', the ranks are untouched 1..878, and the tiers are perfectly
monotone — the sheet is an unedited export. Keeping preference and market apart
is a load-bearing property of this design: ADP exists to predict what the *other
managers* will do and must never decide what Andrew wants. A board that is
literally the consensus collapses that separation, and the engine would be
drafting ADP while reporting it as Andrew's board.

That is not a reason to refuse the import — Andrew called the sheet a WIP, and
starting from an export and re-tiering it is a perfectly normal way to build a
board. But it is the reason `draftReady` is still absent from
`config/board.json`, which is the gate that stops `npm run bot` running live
against it. Re-order or re-tier the sheet, re-import, and the separation is
restored.

**Depth 300, not 878.** 265 players after dropping K and DEF, which the board's
own `maxByPos` caps at zero. 300 covers all 168 picks with most of a round spare
plus the depth the survival simulator reads; past it a ranked export is mostly
players who will never be drafted and, increasingly, players Sleeper's map has
never heard of. At full depth 61 names fail to resolve; at 300, two did.

**Two names needed correcting, and they needed different corrections.**
`Hollywood Brown` is Sleeper's `Marquise Brown` — a nickname. `Keenan Allen` is
in no Sleeper record at all under any name or team, so he is not on an NFL roster
and cannot be drafted. Andrew chose to record both in `config/board.json` rather
than edit the spreadsheet, as `nameAliases` and `notInLeague`, because a sheet
edit would be lost the next time the export is re-downloaded. Both are applied at
import and **reported on every run**, and a correction that stops matching
anything is reported too — an exclusion list nobody reads is how a player who has
since signed stays undraftable all season.

**The rehearsal is worth re-reading now.** With the real board in place, all
fourteen of its picks are on-board where nine of ten names had previously gone by
pick 29. `npm run team -- --draft 1394452945935794176` now shows, for instance,
that pick 68 (RB RJ Harvey, board #92) passed over twenty-four higher-ranked
players including three quarterbacks — which is the QB floor working exactly as
intended, and the kind of thing the report exists to surface.

### Found while implementing M1–M8

**The rehearsal mock is now a committed fixture.** `fixtures/rehearsal2026/`
holds the draft, its 168 picks, its traded picks and the real league. It sits
outside the `fixtures/<league>/<season>` convention deliberately: every
`roster_id` in it is null, and the ownership sweep in `snake.test.ts` legitimately
requires real rosters, so a mock filed as a league fixture would break it. Every
claim in *Surprises & Discoveries* was re-verified against the fetched artifact —
168 picks, `slot_to_roster_id` the identity mapping, Andrew at slot 5,
`pick_timer` 120, `metadata.league_id` the real lads league.

**M5 moved no golden snapshot, and that is the interesting part.** Removing the
scarcity override was expected to disturb the replay corpus, because
`marketBoard.ts:37` gives the market rules K and DEF floors and a market-pool
replay is exactly the thin pool the override was written for. It disturbed
nothing. The override never fired in the lads/2024 replay at any of the twelve
slots — its only observed firing was the live rehearsal, where the `roster_id`
bug had put forced mode into a false state. So the override was not load-bearing
anywhere the corpus could see, and the case for keeping it was weaker than it
looked. The new specs in `floors.test.ts` fail against the pre-M5 engine and
pass after, which is what makes them worth having.

**The second breach path was the one that actually mattered.** Of the three,
only the `else if` at `recommend.ts:148` — where an active forced mode meant the
floor was never consulted at all — could fire quietly. The scarcity override at
least announced itself in the rationale.

**M6 moved exactly one pick, in the right direction.** In the lads/2024 golden
replay at slot 1, pick 121 (round 11) previously recommended QB Caleb Williams;
it now recommends RB Zach Charbonnet, **which is what the room actually took**.
Primary agreement with the real draft rises from 57% to 64%. That is one line of
one snapshot, but it is the model's blind spot correcting itself against a real
outcome rather than against a fixture written to suit it.

**M6's calibration gain on the rehearsal is real but small, for an instructive
reason.** Mean absolute survival error over 780 player/pick pairs at Andrew's
fourteen picks: 0.2452 → 0.2425 across all positions, and 0.4000 → 0.3834 over
the 199 quarterback pairs. The improvement is concentrated in QB exactly as
predicted, but it is a few percent rather than a transformation — because the
rehearsal room was eleven Sleeper **autopick bots**, and an autopick bot really
does draft by pure ADP regardless of what its roster already holds. A bot-filled
mock is the one room where opponent awareness helps least. The lads league is
not that room, so this number understates the change for the draft that matters.

**M7 needed a decision the plan did not settle.** `sendOnce` stored
`[primary, ...fallbacks]` as the sent-log payload, and `bot.ts:252` treated any
of them landing as `CONFIRMED`. Once the fallbacks are no longer communicated
that is wrong — a fallback pick would be a considered override reported as a
confirmation. Resolved by making the payload **accumulate every single-name
instruction actually issued** for the pick: any of them landing is a genuine
confirmation, because each was live at some point, and the mismatch message now
names the *last* instruction rather than the first, since naming the first would
report a player the bot had already withdrawn.

**`heads_up` keeps one name rather than going silent.** The milestone said to
drop the numbered shortlist; it now shows the single likeliest player. Dropping
it entirely would have left a message that says only "your pick is coming",
which is less useful and no safer.

**The formatter, not the caller, enforces the one-name rule.** `formatDraftMessage`
ignores `fallbacks` and `shortlist` beyond the first entry even when a caller
populates them, and the bot separately sends them empty. Two independent guards,
because this is the property that gets shared in public and a single guard is
one refactor away from leaking.

**M1's byte-for-byte requirement drove a textual splice, not a re-serialise.**
`config/board.json` is hand-formatted and its `//`-prefixed keys are load-bearing
documentation; `JSON.stringify` would reflow all of it. `splicePlayers` locates
the `players` array by bracket-counting (string- and escape-aware), rewrites only
that span, matches the file's own indentation, and then **verifies before
writing** that every other top-level key is unchanged and that the bytes before
and after the array are identical. It refuses to write if not.

**One documentation error fixed in passing.** `config/board.json`'s
`//minRoundByPos` comment described the scarcity override as the way a floor
yields. That was true when written and is now false; it says floors are absolute.

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

## Milestone 5 — Round floors become absolute

The goal is that no code path can draft a position before its `minRoundByPos`
floor, so that a floor expresses a strategy the engine is incapable of
second-guessing.

The reason matters, because it was misunderstood once already and the wrong
reading nearly became a recommendation. Andrew's `minRoundByPos.QB: 11` is not a
patch for an untiered quarterback column. He is a **QB streamer**: quarterbacks
are abundant, weekly matchups matter more than the name on the roster, and
spending an early pick on one is the mistake the floor exists to prevent.
Overriding it does not rescue him from a bad outcome, it imposes a strategy he
rejected.

The work removes all three breach paths in `helpers/draft/recommend.ts`.
**First**, the scarcity override: `isUrgent` and the `!urgent[p.pos]` term at
line 152 go, along with the `scarcity override: ...` rationale. **Second**,
forced mode: the floor check currently sits in an `else if` branch (line 148),
so whenever forced mode is active the floor is not consulted at all — the floor
test must apply unconditionally, before and independent of the forced-set test.
**Third**, the relaxation ladder: `floors` comes out of every level, so the
engine gives up the stash rule, the forced collapse, and finally position caps,
but never a floor. If that leaves no legal candidate at all, it must say so
loudly rather than quietly breach.

The result is that a floor is a hard constraint with the same standing as a
position cap, and the only way past it is to edit `config/board.json`.

The proof is a spec that builds a state where every previous path would have
fired — an unfilled mandatory QB slot, fewer than five quarterbacks left in the
pool, all predicted extinct before the next pick, forced mode active, and the
round below the floor — and asserts the recommendation is not a quarterback.
A second spec asserts the same board with the floor removed *does* return one,
so the first spec is testing the floor rather than an unrelated preference.
A third replays the completed mock `1394452945935794176` at all fourteen of
Andrew's picks and asserts no recommendation ever breaches a floor; measured
against the current tip, picks 101 through 149 already satisfy this because the
`roster_id` fix removed the false forced-mode trigger, so the spec pins
behaviour that is correct today rather than repairing behaviour that is broken.

## Milestone 6 — Opponent roster awareness

The goal is that the engine knows what the other eleven teams already hold, and
uses it when predicting what they will do next.

Today it does not. `helpers/draft/survival.ts:84` builds every opponent's
utility as `-searchRank / temperature` and nothing else, so the simulator models
twelve identical drafters who want the same players in the same order regardless
of what is already on their rosters. In the rehearsal that produced a
quarterback run the engine kept forecasting and the room could not deliver: it
called Bo Nix at 0% survival twice and he survived both times, because ten of
twelve teams already had a starter and simply would not take another.

The work multiplies each candidate's sampling weight by a **saturation factor**
derived from `state.posCountsByRoster`, which the `roster_id` fix (`8549a6a`)
made correct for mocks as well as real drafts. A roster that has filled its
starting requirement at a position becomes much less likely to take another
there. The weighting is deliberately uneven, and the ordering is Andrew's:
**QB and TE strongly**, because the lineup starts one of each and a team with
one is close to done; **WR and RB weakly**, because two start plus two flex
slots and managers keep taking them well past nominal need. K and DEF follow the
QB/TE treatment for the same reason.

The result is a survival curve that stops predicting impossible runs, which
matters because that curve is the whole input to the VONA edge — the number the
engine uses to decide whether a pick is urgent.

The proof is a spec asserting that a quarterback's survival probability rises
when opponents' QB slots are filled, holding everything else constant, and that
the same manipulation moves a running back's probability by materially less.
A second check re-runs the rehearsal feed and reports the calibration error at
Andrew's fourteen picks against the actual outcome, which for the three
zero-survival quarterback calls should fall.

## Milestone 7 — One instruction, no alternatives

The goal is that a message names exactly one player, because these messages get
shared in a public channel and a shortlist tells the other eleven managers what
Andrew is thinking.

The visible half is small: `formatDraftMessage` in `helpers/draft/notifier.ts`
drops the `Else:` lines from `on_clock`, drops the numbered shortlist from
`heads_up`, and drops both from the escalation repeat. The rationale line goes
too — "2 left in RB T2; 0% survives to pick 20" is exactly the read of the board
that should not be public.

The half that is not small is what the fallbacks were doing. `bot.ts:308` keys
the instruction `on_clock:${myNext}` through `sendOnce`, so it is issued **once
per pick and never revised**. The alternatives existed so that a relay holding a
name that gets sniped mid-relay still has somewhere to go — a real risk here,
since the rehearsal showed every pick taking more than 42 seconds. Removing them
without replacing that safety strands Andrew on a drafted player. So the bot
must detect that the instructed player has been taken while his pick is still
open and issue a fresh single-name instruction, which means the message key
becomes `on_clock:${myNext}:${playerId}` and the on-clock stopwatch survives the
re-issue rather than restarting.

The result is a public-safe message that is also strictly more useful: it always
names a player who is actually available.

The proof is a spec driving a feed where the instructed player is drafted by
another team while the pick is open, asserting that a second `on_clock` arrives
naming a different available player, that it arrives once rather than on every
poll, and that a restart mid-pick does not duplicate it. A notifier spec asserts
no rendered message contains `Else`, a shortlist, or a rationale.

## Milestone 8 — Retune escalation for a relay

The goal is that escalation means something. In the rehearsal it fired on all
fourteen picks because reading a recommendation in chat and acting on it took
longer than the threshold every single time. An alert that fires every pick is
not an alert.

**Correction, found during implementation.** This milestone was written as
though the bot used fixed second-counts. It does not, and did not: `bot.ts:168`
already read `draft.settings.pick_timer` and derived `escalateAt1 = timer / 3`
and `escalateAt2 = timer × 0.75` — 40s and 90s on the rehearsal's 120-second
clock, which is exactly the ~42s and ~91s that were observed. So the work here
is narrower than described: the *fractions* become configurable and the first
one is raised. Reading the timer needed nothing.

**A second correction, from the message census.** The Outcomes section reads as
though both thresholds fired on every pick. They cannot have: the census records
*fourteen* `STILL OPEN` messages across fourteen picks, so it was the **first**
escalation firing every time and the second rarely or never. The arithmetic
agrees — the draft ran 11:47:24 to 12:05:11, and 28 escalations would have
required every pick to stay open past 91 seconds, which is more time than the
whole draft took.

The work makes both thresholds configurable fractions of the pick timer
(`escalateFraction1`, `escalateFraction2` on `BotOptions`) and raises the first
from 1/3 to 0.6, with the second moving from 0.75 to 0.85. On a 120-second clock
that is 72s and 102s: the first nudge now sits above the relay's normal cost
(~76s per pick in the rehearsal) with 48 seconds still left to act, and the
second leaves 18. A draft publishing no timer falls back to 120 seconds, as
before.

The proof is a spec asserting that with a 120-second timer the first escalation
fires later than 42 seconds and before the timer expires; that both fire in
order and inside the clock; that the thresholds scale with a 30-second and a
240-second timer rather than sitting at fixed seconds; and — standing in for the
"replay the rehearsal with its real timing" check, which is **not possible
because Sleeper's picks feed carries no timestamps** — that a pick relayed in 55
draft-seconds trips the old thresholds and not the new ones.

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

All three pass. The suite stood at 160 tests before this plan and stands at
**247** after it:

| Spec file | Tests | Covers |
| :-- | --: | :-- |
| `helpers/draft/sheetBoard.test.ts` | 12 | M1 — parser, row bounds, rank order |
| `scripts/importBoard.test.ts` | 13 | M1 — the byte-preserving splice |
| `helpers/draft/notifier.test.ts` | 17 | M2 — the log; M7 — no message leaks the board |
| `helpers/draft/teamReport.test.ts` | 19 | M3 |
| `helpers/draft/floors.test.ts` | 9 | M5 |
| `helpers/draft/saturation.test.ts` | 13 | M6 |
| `helpers/draft/bot.test.ts` | 15 | M7 re-instruction, M8 thresholds |

The M5 and M7 specs were each run against the pre-change code and fail there —
3 of 9 and 5 of 10 respectively — so they pin the new behaviour rather than
merely describing the current one.

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
