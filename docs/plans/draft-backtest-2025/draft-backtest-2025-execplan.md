# ExecPlan — Hindsight-Free 2025 Draft Backtest

**Status:** Draft, awaiting the board spreadsheet URL · **Owner:** Andrew ·
**Branch:** `claude/sleeper-api-draft-selection-wua79b`

## Purpose

Answer one question with evidence: **if the draft bot had picked for Andrew in
the 2025 LadsLadsLads draft, what would his team have looked like?**

The answer must be trustworthy, which means the engine gets to see only what a
real drafter would have seen at the moment of each pick — no knowledge of which
players get taken later, and no knowledge of how the 2025 season turned out.
Every existing replay in this repository violates that rule, so the backtest is
built as new code alongside them rather than as a flag on top of them.

The output is a committed report: the fourteen players the engine would have
drafted, set against the fourteen Andrew really drafted, round by round, with
every divergence named and the engine's reasoning at that pick shown; and an
explicit statement of what the test cannot tell us.

Whether that roster would also have *scored* more is a second and separate
question. It is worth answering, but it is **deferred** — Milestone 7 holds it,
nothing in Milestones 1 through 6 depends on it, and the decision to build it
comes after the roster has been read.

## Progress

- [x] **M1 — Contemporaneous data acquisition.** Done. `npm run backtest:data`
      writes `adp.ffc.json` (156 players, 718 drafts, snapshot 2025-08-31..09-01,
      validated as preceding the 2025-09-04 kickoff), `adp.jimmyg.json` (180
      picks) and `league.2025.json` (14 lineup slots, 42 scoring keys, playoffs
      from week 15, so scoring would run weeks 1–14).
- [x] **M2 — Board and ADP import from the spreadsheet.** Done.
      `npm run backtest:board` writes `config/board.2025.json` (157 players,
      8 tiers: T1=12 T2=10 T3=10 T4=14 T5=15 T6=22 T7=21 T8=53; QB=23 RB=57
      TE=18 WR=59, no K, no DEF) and `fixtures/backtest2025/adp.sheet.json`
      (327 of 358 rows; ids from lads2025=168, jimmyg2025=25, trim2026=134).
      All 157 board names resolved, Ollie Gordon included. 37 specs cover it.
- [x] **M3 — Contemporaneous player universe and ADP prior.** Done.
      `helpers/draft/backtest/universe.ts` builds 327 players with a dense
      `search_rank` of 1..327. ADP provenance: 292 from the sheet's Sleeper
      column, 35 from its rank column, and **zero** from either fallback layer —
      every player both 2025 drafts took is already on the sheet. All 168 lads
      picks present. Cross-check against Fantasy Football Calculator: 152
      matched, 4 unmatched, Pearson 0.885.
- [x] **M4 — Visibility chokepoint and the lookahead proof.** Done, and it
      holds. `visibility.ts` is the single seam; `pipeline.ts` rebuilds
      universe, ADP, state and simulation from the feed at every decision so
      the proof has something to bite on. Measured: the honest pipeline
      diverges at **0 of 14** picks under a scrambled future; a deliberately
      leaky prior built from realized pick order diverges at **13 of 14** — all
      but the last pick, which has no future to rearrange. The
      deliberate-break check is a permanent test, not a one-off.
- [x] **M5 — Pairwise-swap counterfactual.** Done. `swap.ts` walks the real
      draft with the engine at slot 2. All twelve rosters end on exactly 14, no
      player is drafted twice, no manager needed a fallback, and an all-agreeing
      run reproduces the real feed byte for byte. Four pick outcomes are
      distinguished: agreed, swapped, self (the engine reordered two of
      Andrew's own picks) and no-partner.
- [ ] **M6 — Run, report, record.** Produce the committed roster report and
      write the findings back into this plan.
- [ ] **M7 (deferred) — Real-points scoring.** Not scheduled. Build only if
      reading the M6 report raises a question that points would settle.

Nothing is implemented yet. This plan is the only artifact so far.

## Surprises & Discoveries

Recorded during investigation, before any code was written. These are the
findings that shaped the design; treat them as established facts.

**The existing replay harness reads the future in four places.** The most
severe is `helpers/draft/marketBoard.ts:67`, which sets each player's
`search_rank` — the engine's proxy for Average Draft Position — to the pick
number at which that player was actually taken. The opponent simulator
therefore knows exactly when every player will come off the board. Second, the
market pool contains only players who were actually drafted, so the engine
never considers anyone the room passed over. Third, `fixtures/players.trim.json`
is an August 2026 snapshot whose ADP encodes how the 2025 season turned out.
Fourth, the "schedule-forced" heuristic at `helpers/draft/recommend.ts:76`
derives a position's supply horizon from `search_rank`, which under the first
leak is literally the pick number where the last player at that position goes;
its own code comment admits this.

**A genuine 2025 pre-season ADP list exists.** Fantasy Football Calculator
publishes one over a public JSON API, aggregated across 718 real drafts, in
this league's exact format — half-PPR, twelve teams — snapshotted 31 August
2025, before the NFL season began. Measured against what the lads room actually
did, its Pearson correlation with realized pick order is 0.903, with a mean
absolute deviation of 12.0 picks and a median of 8.6. It covers 127 of the 168
lads picks and is 156 players deep.

**A second, independent 2025 sample exists in Andrew's own leagues.** The
"Jimmy G-whizz" league (league id `1267961681892356096`, draft id
`1267961683133878272`) is a twelve-team, fifteen-round snake drafted on 31
August 2025, eight days after the lads draft and still before the season. Its
realized pick order correlates with the lads order at 0.893 and covers 92% of
the lads picks — 154 of 168. It runs 180 picks deep, so it extends past the end
of the Fantasy Football Calculator list.

**Using pre-season consensus ADP is more faithful than using Andrew's own
board.** Sleeper's live `search_rank` field, which the production bot will
consume in September 2026, *is* pre-season consensus. So a 2025 pre-season
consensus list is the exact analogue of live conditions, not a compromise.

**The 2026 player map is missing players who mattered in 2025.** Of the 156
players on the Fantasy Football Calculator list, 19 fail to match
`fixtures/players.trim.json`. Past a trivial naming quirk for defenses
("Denver Defense" versus "Denver Broncos"), the misses include Tyreek Hill,
Austin Ekeler and Keenan Allen — all absent from the 2026 snapshot because they
are not on an NFL roster now. The backtest therefore cannot use that file as
its player universe.

**This league streams kickers and defenses.** Across 2022, 2023, 2024 and 2025,
four or five of the twelve teams drafted no kicker at all, and two to five
drafted no defense. Only seven to ten of each were taken per draft, against
twelve required lineup slots. Andrew's own 2025 roster is fourteen skill
players with no kicker and no defense. The engine's "forced mode" will spend
rounds 13 and 14 on a kicker and a defense, so the backtest must be able to
measure whether that costs him rather than assume it does not.

**Sleeper publishes its own computed fantasy points per player per week.** The
weekly stats payload carries a `pts_half_ppr` field alongside the raw stats.
This gives the scoring code an independent ground truth to validate against
before it is trusted with the league's own custom settings.

**The board spreadsheet carries its own ADP list, and it is a better prior than
the one this plan originally chose.** The `List` tab is 358 players deep against
Fantasy Football Calculator's 156, includes 21 kickers and 30 defenses, and its
`Sleeper` column is a 2025 snapshot of the very `search_rank` field the
production bot consumes live. Same source, same units, contemporaneous. It also
correlates 0.982 with the sheet's own rank column, which is expected once you
know both are ADP rather than preference.

**`List` was initially misread as Andrew's ranking.** It is not; it is pasted
market reference data. That misreading produced an apparent 19-way conflict
between "his tiers" and "his ranks" that does not exist — a board differing from
ADP in 19 of 133 places is a board doing its job. Recorded because the same
mistake would corrupt the value function if repeated: `LLL Tiers` is preference,
`List` is market.

**Kickers and defenses are ranked in `List` but absent from `LLL Tiers`.** They
sit at ADP ranks 118 to 326 — Brandon Aubrey 118, Denver 124, Philadelphia 125 —
so the null-`search_rank` problem that makes defenses indistinguishable in the
2026 player map does not arise here. Andrew nonetheless does not tier them,
drafted neither in 2025, and a third of this league drafts no kicker in any
given year.

**The quarterback column has no tier breaks.** Twenty-three names in preference
order, from Allen and Lamar down to Penix, with nothing to price them against
the skill tiers. Andrew's revealed behaviour is to draft the position very late:
in 2025 he took Brock Purdy, eleventh on that column, at pick 146 in round 13.

**Found during M1: `loadAllFixtures` assumed every directory under `fixtures/`
was a league.** It read each child as a league and each grandchild as a season,
so the moment `fixtures/backtest2025/` appeared the whole existing suite threw
on a missing `league.json`. Fixed by identifying a draft fixture from its
contents — a directory holding all four of `league.json`, `draft.json`,
`picks.json` and `traded_picks.json` — rather than from its position in the
tree. Latent fragility that any new fixture directory would have triggered.

**Sleeper freezes pick metadata at pick time — verified, not assumed.** This
matters enormously, because it means the draft feed itself carries
contemporaneous position, team and injury designations. The check: the
lads/2020 fixture's newest `news_updated` timestamp is 2020-09-05, the day of
that draft. Were the field refreshed on read it would show 2026 dates. In
lads/2025 the range runs 2025-02-17 to 2025-08-23T19:15, the last of those
fifteen minutes into the draft itself. So the backtest gets real draft-day
attributes for free, and the engine's stash rule acts on the designations that
actually stood: 25 Questionable, 4 PUP, 1 Sus across the 168 picks.

**Found during M3: the two ADP fallback layers are inert.** Every player taken
in either 2025 draft, and every player on the board, already appears on the
spreadsheet's 358-row List tab, so the Jimmy G-whizz tail-extension and the
deterministic tail both resolve zero players. Both are implemented anyway and
asserted to be zero, so a future sheet that stops covering the field turns them
non-zero rather than failing.

**The spreadsheet's ADP snapshot is slightly older than Fantasy Football
Calculator's.** The two correlate at 0.885, but the largest disagreements lean
one way: Joe Mixon sits at 63 in the sheet against an FFC ADP of 135.5. Mixon's
August 2025 foot injury cratered his ADP late in the month, and FFC's window is
31 August while the sheet was evidently captured earlier. Both are pre-season
and neither carries outcome knowledge, so this is not a leak — but the prior in
use is a little staler than the cross-check, and any surprising engine pick
around an injured player should be read with that in mind.

**Found during M5: the simultaneous credit needed a mechanism, not just a
rule.** The credit is recorded at the displaced manager's own later pick
number, which is where it belongs — but `buildState` derives availability from
the pick feed, so `visibleAt` would keep showing that player as available until
that pick landed, and the engine could draft the very player its own swap had
given away. Fixed with an explicit `excludeIds` on the decision request: players
already spoken for whose pick has not yet landed are removed from the pool. That
is not future knowledge; in the counterfactual those players genuinely are on
someone's roster, so it makes the pool tell the truth. The duplicate-detection
invariant would have caught it, which is why that invariant is asserted rather
than assumed.

**Found during M2: 31 of the 358 ADP rows cannot be resolved to a Sleeper id at
all.** They sit at ranks 226 to 356 — Tyler Lockett, Amari Cooper, Brandin
Cooks, Russell Wilson among them — and are unresolvable because they were
drafted in neither 2025 fixture *and* have since dropped out of the 2026 player
map, so no source of any vintage supplies an id. They are reported and dropped
rather than blocking the import. This cannot silently lose anyone who mattered:
the id index is built from the lads 2025 picks feed, so every player actually
drafted that year resolves by construction, and an unresolved entry inside the
168-pick draftable depth is still fatal.

## Decision Log

**The backtest is new code, not a flag on the existing replay.** The existing
`helpers/draft/replay.ts` is built around the synthetic market board and its
hindsight is structural, not incidental. Bolting a hindsight-free mode onto it
would leave two code paths tangled in one file and make it easy for a future
change to reintroduce a leak. The backtest lives in `helpers/draft/backtest/`
with its own tests. The existing replay stays exactly as it is and keeps
serving its original purpose, which is validating pick mathematics and
guardrails.

**The counterfactual uses a pairwise swap, not a cascade.** When the engine
takes a player Andrew did not take, the manager who really took that player
instead takes the player Andrew really took. Every other pick in the draft is
untouched. Andrew proposed this and it is better than the cascade the existing
`replay.ts:266` performs, in which a displaced manager falls through to the next
entry on their own queue and shifts every subsequent pick, compounding drift
across fourteen rounds. The swap holds the rest of the room constant, so the
only variable is which player of each pair sits on which roster. That is a
controlled experiment; the cascade is a noisy simulation.

**The swap is credited simultaneously.** The naive swap has a bias that favours
the engine. If the engine takes player X at pick 2, and the manager who really
took X was not due until pick 40, then player Y — the man Andrew really took at
pick 2 — sits unclaimed in the pool for 38 picks, and the engine could come back
and draft him too, ending up with both. In reality Y was gone at pick 2. So the
moment the engine takes X, Y is credited to the displaced manager's roster and
removed from the pool. That manager's later pick becomes a no-op. The exchange
stays one-for-one and nobody drafts a player who was genuinely unavailable.

**The swap assumption is an idealisation and the report must say so.** A
manager denied player X would not necessarily reach for player Y; they would
take whatever their own board said next, possibly at another position. The swap
buys experimental control at the cost of behavioural realism. The cascade model
is retained as a sensitivity check so the two together bracket the honest
answer, and the report states this in plain language rather than implying the
room was faithfully simulated.

**The harness may use hindsight; the engine may not.** Performing the swap
requires knowing who took X later, which is future knowledge. That knowledge
lives entirely in the opponent simulation and never enters the engine's inputs.
The boundary is enforced by a single visibility function and proved by a test,
not asserted in a comment.

**The ADP prior is layered, with the spreadsheet's own list primary.** The
`List` tab's `Sleeper` column leads, because it is the same `search_rank` field
the production bot consumes and it is 358 players deep including kickers and
defenses. `List`'s own rank column fills any gap in it. Fantasy Football
Calculator's 2025 consensus is demoted to a cross-check rather than a source —
if the two disagree sharply the discrepancy is worth understanding before
trusting either. The Jimmy G-whizz realized pick order extends the tail past
`List`. Anyone on none of these is ranked below everyone who is, ordered
deterministically. Every layer predates the 2025 season.

**Player ids resolve from draft-day metadata first, not the 2026 map.** Raised
during pre-implementation review of this plan. M3 originally said to consult
`fixtures/players.trim.json` for name-to-id lookup, but that file is an August
2026 snapshot and is missing Tyreek Hill, Austin Ekeler and Keenan Allen — the
exact players this plan exists to keep. The lookup order is therefore: the 2025
lads picks feed's `metadata` first, then the Jimmy G-whizz picks feed, then the
2026 map as a last resort for players neither draft touched. Both feeds carry
`player_id` alongside `first_name` and `last_name`, stamped at draft time, so
the first two layers are contemporaneous and authoritative.

**"Forced mode off" is a lineup configuration, not an engine flag.** Raised
during pre-implementation review. The engine has no switch for it, and simply
setting `maxByPos.K` and `maxByPos.DEF` to zero is actively harmful: the league
lineup lists K and DEF as dedicated starters, so `unfilledMandatoryCount` never
falls below two, `isForcedMode` fires on the last two picks, the candidate set
collapses to K and DEF, the cap guardrail then rejects every one of them, and
`recommend()` falls through to its relax-everything path — producing two
arbitrary picks precisely where the comparison matters most. The correct
mechanism is to hand the engine a lineup in which K and DEF are replaced by
bench slots, so no mandatory K or DEF slot ever exists. This is a harness-level
configuration of an engine input, not a change to the engine, which keeps the
backtest testing the code that will actually ship. The forced-on sensitivity run
instead uses the real lineup with `maxByPos.K` and `maxByPos.DEF` at one, and
lets kickers and defenses be valued off-board from their `List` ADP — no board
entries needed.

**The lookahead proof must rebuild the whole pipeline, not just re-slice the
feed.** Raised during pre-implementation review. As M4 was originally worded the
test would compare `recommend()` on two identically-sliced feeds and pass
trivially, proving only that the slice works. The leak this plan exists to
remove did not live in the pick array — it lived in the *ADP prior*, which the
old harness derived from realized pick order. So the test permutes the players
occupying picks at and after the decision point and then rebuilds everything
downstream — universe, ADP prior, board, state — before asserting the
recommendation is unchanged. Under that construction, any input derived from the
draft's outcome shifts and the test fails. Its ability to fail is verified once
by temporarily reinstating an ADP prior built from pick order, confirming a red
test, and reverting.

**Preference and market are kept strictly apart.** `LLL Tiers` feeds the value
function and nothing else; `List` feeds the opponent model and nothing else. The
engine's idea of what is *good* comes only from Andrew; its idea of what the
room will *do* comes only from ADP. Blending them would let market opinion leak
into the value function and quietly turn the backtest into a test of consensus.

**Quarterbacks are priced alongside the last tier.** The QB column has no tier
breaks, so it is treated as a preference ladder sitting at the back of the
board, level with "Last Tier". The engine therefore takes a quarterback only
once the skill tiers have thinned. This matches both the one-quarterback lineup
and Andrew's revealed behaviour of taking one in round 13. It is an assumption,
not a reading of the sheet, so M6 must report which round the engine actually
takes its quarterback in — that number is the check on whether the assumption
was right, and it is cheap to revise.

**Kickers and defenses are never drafted, and forced mode is off.** They are
absent from the board because Andrew does not draft them, and the league streams
both. The engine spends all fourteen picks on skill players and one
quarterback, finishing with a lineup that is illegal on paper and filled from
waivers in practice — which is exactly what Andrew's real 2025 roster did. This
makes the backtest a like-for-like comparison. The consequence for M6 is that
**the forced-mode-off run is the headline** and forced-on becomes the
sensitivity check, inverting what this plan originally specified. The live bot
will need the same setting configured before September, which is a finding for
the main draft-bot work, not for this backtest.

**Scoring gives both rosters a replacement-level kicker and defense if they did
not draft one.** This mirrors what every manager in this league actually does —
stream them off waivers — and makes the comparison fair. It also correctly
charges the engine for spending a draft pick on a position it could have had
for free.

**Only Andrew's slot is backtested.** Running all twelve slots would multiply
the work and tell us about other people's teams. Slot 2 is the question.

**The deliverable is the roster; scoring is deferred.** The question this plan
answers is what Andrew's team would have looked like, not whether it would have
scored more. Season points are the only check in scope that could catch an
engine drafting plausible-looking players for unsound reasons, so the milestone
is retained rather than cut — but it is deferred behind the report, on the
reasoning that reading the roster first tells us whether points are needed at
all. The cost is a real risk, recorded here so it is not forgotten: a believable
roster may end the exercise before anyone checks it was arrived at soundly. The
mitigation is that M6 prints the engine's own rationale for every pick, so the
reasoning is inspectable even without points. Everything scoring needs — the
weekly statistics fetch included — lives inside M7, and no earlier milestone
imports from it, so picking it up later disturbs nothing.

## Outcomes & Retrospective

Not yet started. To be filled in at M6 with the roster the engine would have
drafted, how far it diverged from what Andrew really did, whether its stated
reasoning reads as sound at each divergence, how different the forced-mode and
cascade variants look, and what the exercise revealed about the engine that the
existing replay could not. If reading it leaves the soundness question open, say
so plainly here — that is the signal to pick up the deferred M7.

## Context

### What this repository is

A Next.js 13 static site for a group of Sleeper fantasy football leagues,
deployed to GitHub Pages. Alongside the site, an open pull request (#2) adds a
draft assistant: a pure-TypeScript decision engine under `helpers/draft/` with
no React or Next imports, command-line scripts under `scripts/`, committed JSON
snapshots of historical drafts under `fixtures/`, and a live loop that watches a
draft in progress and prints pick instructions to a console. Tests run under
vitest; the engine is deterministic under a fixed random seed.

The bot never picks. Sleeper's public API is read-only, so the bot watches the
pick feed, tells a human what to take, and verifies afterwards what actually
landed.

### Terms used in this plan

**ADP** — Average Draft Position. The consensus pick number at which a player
is taken across many drafts. The engine uses it as its model of what opponents
will do. Sleeper exposes a proxy called `search_rank`.

**Board** — a drafter's own ranked list of players, grouped into tiers. Andrew's
2025 board lives in a Google Sheet. The engine's value function is driven by it.

**Tier** — a group of players a drafter considers roughly interchangeable. The
engine's value function pays a large premium for a higher tier and only a tiny
amount for a better rank within a tier, so tiers, not ranks, drive decisions.

**Hindsight / lookahead** — using information that did not exist at the moment
of the decision. Two distinct kinds matter here: knowing which players get
drafted later in the same draft, and knowing how the season turned out.

**Counterfactual** — a re-run of a real draft with one drafter's decisions
replaced, to see what would have happened.

**Pairwise swap** — the counterfactual model defined in the Decision Log: the
engine takes X instead of Y, and the manager who really took X takes Y instead.

**Cascade** — the alternative counterfactual model, in which a displaced manager
falls through to the next player on their own real queue.

**Survival** — the engine's estimate of the probability that a given player is
still available at the drafter's next pick. Computed by Monte Carlo simulation
over the ADP prior.

**Forced mode** — engine behaviour that collapses the candidate set to unfilled
mandatory starting positions when picks are running out, so the drafter cannot
finish with an illegal lineup.

**Optimal weekly lineup** — the highest-scoring legal starting lineup that could
have been fielded from a roster in a given week, chosen with hindsight. Used for
scoring because it removes start/sit skill from the comparison and isolates the
quality of the players drafted.

**Replacement level** — the score of a freely available player at a position;
here, the median weekly score among kickers or defenses.

### The specific draft under test

The 2025 LadsLadsLads league is `1181351037804883968` and its draft is
`1181351037804883969`: a twelve-team, fourteen-round snake with no reversal
round and a 120-second pick timer, drafted 23 August 2025. The starting lineup
that season was quarterback, two running backs, two receivers, a tight end, one
flex, a kicker and a defense, with five bench spots.

Andrew is Sleeper user `82919512949014528`, display name StranraerCarny. In the
2025 draft he held **draft slot 2, roster id 6**, giving him picks 2, 23, 26,
47, 50, 71, 74, 95, 98, 119, 122, 143, 146 and 167.

The roster he actually drafted, in order: Bijan Robinson, Bucky Irving, Jaxon
Smith-Njigba, TreVeyon Henderson, Tetairoa McMillan, Mark Andrews, Rashee Rice,
Josh Downs, Jordan Addison, Trey Benson, Nick Chubb, Dylan Sampson, Brock Purdy
and Brandon Aiyuk. Fourteen skill players, no kicker, no defense.

The league's scoring settings carry 42 keys. The ones that matter most: half a
point per reception, four points per passing touchdown, six per rushing or
receiving touchdown, one tenth of a point per rushing or receiving yard, four
hundredths per passing yard, minus one per interception and minus two per lost
fumble.

### Files this plan will create or change

New, all under `helpers/draft/backtest/`: `universe.ts` (the contemporaneous
player set and ADP prior), `visibility.ts` (the single chokepoint through which
picks become visible), and `swap.ts` (the pairwise-swap counterfactual). Each
gets a matching `.test.ts`, plus `lookahead.test.ts` which holds the proof.
Deferred to M7: `scoring.ts` (league scoring and optimal weekly lineups).

New scripts: `scripts/fetchBacktestData.ts` (network fetch into fixtures),
`scripts/importSheet.ts` (Google Sheet to board), and `scripts/backtest.ts`
(the runner).

New fixture directory `fixtures/backtest2025/` holding the fetched 2025-era
data. New npm scripts `backtest:data`, `backtest:board` and `backtest`.

Unchanged: everything under `helpers/draft/` that already exists. The backtest
consumes `recommend()`, `buildState()`, `survival()` and `needs.ts` exactly as
the live bot does. If the backtest cannot be built without modifying the
engine, that is a finding worth recording, not a licence to fork it.

### The board spreadsheet

Supplied and readable. Document id `1_unKKpufduAF1loscJ4rOCHLXiwi0UF5DM-jsY25i88`,
shared as "anyone with the link can view", so the CSV export endpoint serves it
without authentication. Three tabs, of which two are used:

`LLL Tiers` (gid `1292573651`) is **the board** — Andrew's own preferences, and
the authority on what the engine should want. It is laid out as one column per
tier rather than one row per player: seven numbered tiers, two further columns
both labelled "Last Tier", and a separate ungraded column of 23 quarterbacks.
157 players in total across the tier block, which occupies rows 2 through 24;
everything below that in column A is a scratch list and is ignored.

`List` is **not** a ranking Andrew authored — it is a pasted ADP reference,
358 players deep, carrying rank, team, bye week, position and a `Sleeper`
column holding Sleeper's own ADP for that player. It is used as the opponent
model's ADP prior and never as a statement of preference.

`Jimmy Tiers` is the board for a different league and is ignored entirely.

## Milestone 1 — Contemporaneous data acquisition

**Goal:** get every piece of 2025-era data onto disk, validated, so that
everything downstream runs offline and reproducibly.

Write `scripts/fetchBacktestData.ts`, modelled on the existing
`scripts/fetchFixtures.ts` — same hand-rolled validators that throw loudly on
shape drift rather than writing bad data, same "network-touching scripts are
small and separate" convention. It fetches three things and writes them under
`fixtures/backtest2025/`. Weekly player statistics are *not* fetched here; they
are needed only for scoring and so belong to the deferred M7.

The 2025 pre-season ADP consensus, from
`https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=12&year=2025`,
written to `adp.ffc.json`. This is a **cross-check**, not the prior — the prior
comes from the spreadsheet in M2. Validate that the payload's `meta.start_date`
falls before 4 September 2025 — the first day of the 2025 NFL season — and fail
loudly if it does not, because an ADP list dated after kickoff would carry
outcome knowledge and silently poison the whole exercise.

The Jimmy G-whizz draft picks, from
`https://api.sleeper.app/v1/draft/1267961683133878272/picks`, written to
`adp.jimmyg.json`. Validate that exactly 180 picks come back.

The league's 2025 settings, from
`https://api.sleeper.app/v1/league/1181351037804883968`, written to
`league.json`. Validate that `scoring_settings.rec` is 0.5, confirming the
half-PPR format match with the ADP list, and that `roster_positions` matches the
2025 lineup this plan assumes.

**Result:** `fixtures/backtest2025/` exists and is committed. Every later
milestone runs with no network access.

**Proof:** from the repository root, `npm run backtest:data` prints one line per
file written and exits zero. Then `ls fixtures/backtest2025` lists exactly
`adp.ffc.json`, `adp.jimmyg.json` and `league.json`. A validation line in the
script's output reports the ADP snapshot date and asserts it precedes kickoff,
printing something of the form
`ADP snapshot 2025-08-31 — precedes 2025 kickoff, OK`.

## Milestone 2 — Board and ADP import from the spreadsheet

**Goal:** turn the two useful tabs of Andrew's 2025 spreadsheet into two
committed artifacts — the board that drives value, and the ADP list that drives
the opponent model — failing loudly on anything ambiguous. This runs before the
universe is built because the universe's ADP prior comes from here.

Write `scripts/importSheet.ts`. It takes a Google Sheets document id, fetches
each needed tab through the CSV export endpoint
(`/export?format=csv&gid=<gid>`), and parses both.

From `List` (the ADP reference, 358 rows, header `Rank, Player, Team, Bye, POS,
Sleeper`): emit `fixtures/backtest2025/adp.sheet.json` — one entry per player
with name, team, position and both rank columns. The `POS` column carries a
position with its positional rank appended, so `WR1` and `RB12` must be split
into position and index. Fail loudly if the header row does not match, rather
than guessing at column positions.

From `LLL Tiers` (the board, gid `1292573651`): read only the tier block, rows 2
through 24, one column per tier. Column headers give the tier: `Tier 1` through
`Tier 7`, then two columns both labelled `Last Tier`, then `QB's`. Treat the two
`Last Tier` columns as one tier, numbered 8 — they are adjacent, identically
labelled, and nothing distinguishes them. Everything below row 24 in column A is
a scratch list and must be ignored; a naive read of the whole column picks up
351 extra names, which is how this was first got wrong.

Quarterbacks come from the `QB's` column with no tier of their own. Per the
Decision Log they are assigned tier 8, level with `Last Tier`, preserving their
column order as the within-tier ordering. Kickers and defenses are deliberately
absent from the board and stay absent — they are not imported from `List`.

Rank is then derived, not read: sort by tier, then by position within the tier
column, and number 1..N. This satisfies the resolver's monotonicity rule by
construction. The `List` rank is never used as a board rank, because `List` is
market data and not Andrew's preference; mixing them is the specific error the
Decision Log forbids.

Resolution of names to Sleeper player ids reuses the normalisation in
`scripts/resolveBoard.ts:26` and reports every unresolved or ambiguous name with
a reason, exiting non-zero. The resolver never guesses. One known casualty:
Ollie Gordon appears in the tier block but not in `List`, so he has no ADP; that
is fine, since board membership and ADP are independent.

Output is `config/board.2025.json` and `fixtures/backtest2025/adp.sheet.json`,
both committed, so the backtest is reproducible without the spreadsheet.

**Result:** Andrew's real 2025 preferences and a 358-deep contemporaneous ADP
list, cleanly separated.

**Proof:** `npm run backtest:board` prints
`board: 157 players in 8 tiers -> config/board.2025.json` and
`adp: 358 players -> fixtures/backtest2025/adp.sheet.json`, then exits zero. A
spec asserts the board contains no kicker and no defense, that tier is
non-decreasing in derived rank across all 157 entries, and that the scratch list
below row 24 contributed nothing.

## Milestone 3 — Contemporaneous player universe and ADP prior

**Goal:** define exactly which players existed to be drafted in August 2025, and
give each one a pre-season ADP, using nothing dated after 23 August 2025 except
where explicitly justified.

Write `helpers/draft/backtest/universe.ts`. The universe is the union of four
sets: every player drafted in the 2025 lads draft, taken from
`fixtures/lads/2025/picks.json`; every player on the spreadsheet's `List` tab;
every player drafted in the Jimmy G-whizz draft; and every player on Andrew's
board.

Player attributes come from each pick's `metadata` object, which Sleeper stamps
at draft time and which therefore carries the player's position, team and injury
status as they were on draft day. Where a player appears only in the ADP list
and was never drafted in either fixture, fall back to the ADP list's own name,
position and team. The 2026 file `fixtures/players.trim.json` may be consulted
only to resolve a Sleeper player id from a name, never for ADP, injury status or
team, and the module must make that restriction structural rather than a
convention — expose only an id-lookup function, not the player records.

Name matching reuses the normalisation already written in
`scripts/resolveBoard.ts:26`, which lowercases, strips punctuation and drops
generational suffixes so "Marvin Harrison Jr." matches "marvin harrison". It
needs one addition: the Fantasy Football Calculator cross-check names defenses
as "Denver Defense" while Sleeper names them "Denver Broncos", so defense
entries match on the city portion and the position tag.

The ADP prior is layered as recorded in the Decision Log: the spreadsheet's
`Sleeper` column first, then the spreadsheet's own rank column where that is
blank, then the Jimmy G-whizz realized pick order for players the sheet does not
cover, then a deterministic tail. Emit the layered result as a
`search_rank`-shaped integer per player, because that is what
`helpers/draft/survival.ts` already consumes — no engine change is needed.

Cross-check rather than merge: compare the layered prior against the Fantasy
Football Calculator list fetched in M1 and report the correlation and the
largest disagreements. A sharp divergence means one of the two sources is not
what it appears to be, and is worth understanding before either is trusted.

**Result:** a single function that returns the 2025 player universe with a
pre-season ADP attached to every member, provably free of 2026 data.

**Proof:** a new spec `helpers/draft/backtest/universe.test.ts` asserts that
every one of the 168 players drafted in lads/2025 is present in the universe;
that at least 150 of them carry an ADP from the spreadsheet or Jimmy G-whizz
layers rather than the deterministic tail; that Tyreek Hill, Austin Ekeler and
Keenan Allen are all present, since their absence from the 2026 map is precisely
the failure this milestone exists to prevent; and that no player record contains
a field sourced from `players.trim.json` other than the id. Run with `npm test`;
the file appears in the passing list.

## Milestone 4 — Visibility chokepoint and the lookahead proof

**Goal:** make it structurally impossible for the engine to see the future, and
prove it by test rather than by inspection. This is the milestone that makes the
whole exercise credible, so it lands before any counterfactual is built.

Write `helpers/draft/backtest/visibility.ts`, exposing a single function that
takes the full pick feed and a pick number and returns only those picks with a
strictly lower pick number. Every path by which the backtest constructs engine
state goes through it. Nothing else in `helpers/draft/backtest/` may index the
raw pick array.

Then write the proof, in `helpers/draft/backtest/lookahead.test.ts`. For each of
Andrew's fourteen picks, build the engine state twice. The first build uses the
real feed. The second uses a feed in which every pick at or after the current
pick number has been replaced — players randomly reassigned among those picks,
under a fixed seed so the test is deterministic. Run `recommend()` on both and
assert the primary pick, both fallbacks and the full rationale come out
identical.

If the engine reads the future in any way, the two runs diverge and the test
fails. This is a falsifiable property, not a promise.

The test is itself verified by deliberately breaking it: temporarily feed the
engine the unsliced pick array, confirm the test fails, then revert. A test that
cannot fail proves nothing, and this check is recorded in Progress when done.

Expect this milestone to surface a real problem. The schedule-forced heuristic
at `helpers/draft/recommend.ts:76` derives a position's supply horizon from
`search_rank`. Under the honest ADP prior that becomes a rough estimate rather
than the exact future it was tuned against, so forced mode will behave
differently here than in the existing replay. That is a finding to record in
Surprises & Discoveries, not a reason to change the engine — the engine must
stay exactly as the live bot will run it, or the backtest tests something that
will never be deployed.

**Result:** a single, auditable boundary between what the engine knows and what
the harness knows.

**Proof:** `npm test` shows `lookahead.test.ts` passing with fourteen
assertions. The deliberate-break check is performed once and its result recorded
in this plan's Progress section.

## Milestone 5 — Pairwise-swap counterfactual

**Goal:** replay the real 2025 draft with the engine picking at slot 2, using
the swap model, and produce the roster it would have ended up with.

Write `helpers/draft/backtest/swap.ts`. Walk the real draft pick by pick. At any
pick that is not Andrew's, the real player is taken, unless that player has
already been credited to a displaced manager by an earlier swap, in which case
the pick is a no-op. At each of Andrew's picks, build state from
`visibility.ts`, call `recommend()`, and take the primary.

If the engine's choice matches what Andrew really did, nothing else happens and
that round is identical to reality. If it differs, apply the swap immediately:
the engine's player joins Andrew's roster, and the player Andrew really took is
credited at that same instant to whichever manager really took the engine's
player, and removed from the pool. If the engine took someone no manager ever
drafted, there is no displaced manager and no swap partner; Andrew's real pick
simply leaves the pool uncredited, and that case is counted and reported.

The invariant that proves the model held: at the end, the multiset of all
drafted players across all twelve rosters must differ from reality by exactly
the set of swapped pairs, every roster must hold exactly fourteen players, and
no player may appear twice. Assert all three.

Also implement the cascade model — a displaced manager falls through to the next
player on their own real queue — behind a flag, for the sensitivity check the
Decision Log commits to. Both models share the same visibility chokepoint.

**Result:** the roster the engine would have drafted, plus a transcript showing
every pick, every divergence and every swap.

**Proof:** `npm run backtest -- --model swap` prints a fourteen-row transcript
of Andrew's picks with the engine's choice, his real choice, and the displaced
manager where one exists; then prints the three invariant checks as explicit
pass lines. A spec `helpers/draft/backtest/swap.test.ts` asserts the invariants
hold and that a draft in which the engine agrees with every real pick reproduces
the real draft byte for byte.

## Milestone 6 — Run, report, record

**Goal:** produce the answer — the roster — in a form Andrew can read and
challenge.

Write `scripts/backtest.ts` to tie the pieces together and emit a report to
`docs/plans/draft-backtest-2025/report.md`, committed. It runs four
configurations: the swap model with forced mode off and on, and the cascade
model with forced mode off and on. **The swap run with forced mode off is the
headline** — Andrew's board has no kickers or defenses and his real 2025 roster
had neither, so forced-off is the like-for-like comparison. The others are
sensitivity checks.

The report must also state which round the engine took its quarterback in. The
QB column carries no tier, so pricing it level with "Last Tier" is an assumption
this plan made rather than something the sheet said; that round number is the
check on whether the assumption held, and revising it is cheap.

The report leads with the thing that answers the question: the two rosters set
side by side, round by round. For each of the fourteen rounds it shows the pick
number, the player Andrew really took, the player the engine would have taken,
and — where they differ — the manager who was displaced and the player they
received in exchange. Rounds where the engine agreed are marked as such, because
agreement is as informative as divergence.

Underneath each divergence it prints the engine's own rationale for that pick,
verbatim from the recommendation: how many players remained in that tier, the
survival percentage to the next pick, the value edge, and which roster slot it
filled. This is what makes the roster judgeable without points. A name alone
tells Andrew nothing about whether the reasoning was sound; the rationale does.

Then a summary: how many of the fourteen picks the engine agreed with, how many
diverged, and how many diverged into a player no manager drafted at all. Then
the forced-mode comparison shown as two rosters, since a forced run spends two
of the fourteen picks on positions the board does not rank at all. Then the
cascade rosters, as the sensitivity check the Decision Log commits to.

It closes with the limits, in plain language and not as a footnote: this is one
draft at one slot; opponents are semi-scripted and do not react to being sniped,
which mildly favours the engine; the swap assumption is convenient rather than
behavioural, and the cascade rosters show how much that choice moved the answer;
and **this report makes no claim about whether the resulting team is better** —
it says what the team would have been and why, nothing more. Judging whether it
would have scored more is deferred to M7.

Then update this plan: tick M1 through M6 in Progress, record what the run
revealed in Surprises & Discoveries, and write Outcomes & Retrospective.

**Result:** a committed, reproducible roster comparison with the reasoning
behind every pick and its own caveats attached.

**Proof:** `npm run backtest` exits zero and writes the report. The report
contains a fourteen-row round-by-round comparison for the headline
configuration, an agreement summary of the form `engine agreed with 6 of 14
picks; 8 diverged; 1 into a player no manager drafted`, and all four
configurations. Re-running the command reproduces the report byte for byte,
because the engine is seeded and every input is committed — checked by running
it twice and diffing.

## Milestone 7 (deferred) — Real-points scoring

**Deferred by decision.** Not scheduled. Build this only if reading the M6
report raises a question that points would settle. Nothing in M1 through M6
imports from it, and the weekly-statistics fetch it needs lives here rather than
in M1, so this milestone can be picked up or abandoned without disturbing
anything.

**Goal:** score any roster on what actually happened in the 2025 season, under
this league's own rules, and trust the result.

Extend `scripts/fetchBacktestData.ts` to also fetch weekly player statistics for
the 2025 regular season, from
`https://api.sleeper.app/v1/stats/nfl/regular/2025/<week>` for weeks 1 through
the league's `playoff_week_start` minus one, written to
`fixtures/backtest2025/stats/week-<n>.json`. Trim each week to the players in
the backtest universe plus the fields the scorer needs, to keep the committed
size reasonable.

Then write `helpers/draft/backtest/scoring.ts` with two pieces. The first
applies a Sleeper scoring-settings object to a player's raw weekly statistics,
producing a points total — a sum over the settings keys present in the stat
line. The second chooses the optimal legal lineup for a roster in a week: fill
each dedicated starting slot and the flex with the highest scorers available,
respecting flex eligibility of running backs, receivers and tight ends.

Validate the first piece before trusting it. Run it with generic half-PPR
settings over every player in a sample of weeks and compare the output to
Sleeper's own `pts_half_ppr` field, which is present in the same payload. They
must agree within a small rounding tolerance. Only once that passes is the
scorer run with the league's own 42-key settings, which differ from generic
half-PPR in details like the field-goal distance buckets and defensive points
allowed.

Both rosters get a replacement-level kicker and defense in any week they lack
one, valued at the median weekly score among all kickers or all defenses that
week. This mirrors the streaming every manager in this league does, and charges
the engine correctly for having spent picks on those positions.

**Result:** a season point total and weekly series for any roster, trusted
because it reproduces Sleeper's own arithmetic.

**Proof:** a spec `helpers/draft/backtest/scoring.test.ts` asserts agreement
with `pts_half_ppr` within 0.01 points across at least 500 player-weeks, and
asserts that the optimal-lineup chooser puts the highest-scoring eligible player
in the flex. The M6 report gains a points section stating the totals for both
rosters, with the added caveat that optimal weekly lineups assume perfect
start/sit decisions for both, and that the comparison ignores waivers and
trades, which are most of a fantasy season.

## Acceptance

The work is done when, from a clean checkout of this branch with dependencies
installed and no network access, this sequence succeeds:

    npm test
    npm run backtest

`npm test` reports every spec passing, including `universe.test.ts`,
`lookahead.test.ts` and `swap.test.ts`. `npm run backtest` exits zero and writes
`docs/plans/draft-backtest-2025/report.md` containing the two rosters side by
side round by round, the engine's rationale beneath every divergence, an
agreement summary, results for all four configurations, and the stated limits —
including the explicit statement that the report makes no claim about which team
would have scored more.

M7 is deferred and forms no part of acceptance. `scoring.test.ts` does not
exist and `fixtures/backtest2025/stats/` is absent; both arrive only if M7 is
picked up.

The lookahead property is proved, not asserted: `lookahead.test.ts` shows that
scrambling every pick after the decision point leaves the engine's
recommendation unchanged at all fourteen of Andrew's picks.

`npm run build` still passes, so the GitHub Pages deployment is unaffected, and
`package-lock.json` remains at `lockfileVersion: 2` for the Node 16 workflow.
