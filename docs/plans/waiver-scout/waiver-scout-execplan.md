# ExecPlan — Waiver Scout

**Status:** Planned, not started · **Owner:** Andrew · **Branch:** `waiver-scout`
(cut from `main`)

This ExecPlan is a living document. The sections Progress, Surprises &
Discoveries, Decision Log and Outcomes & Retrospective must be kept up to date
as work proceeds. A reader with only the working tree and this file must be
able to pick the work up at any point.

## Purpose

Give Andrew one page that answers, before waivers run each week: **which
unrostered players in my league are most likely to break out, and why?**

The page is `/waivers` on the existing site. It ranks every free agent at each
position by a transparent score built only from what players and their teams
have actually done on the field: share of snaps, targets and carries, red-zone
work, air yards, the trend in each, and the volume of the offence around them.
It does not use projections from Sleeper or anyone else. Every row carries
plain-English flags explaining why the player ranks where he does ("snap share
+24 pts", "next man up: starter is OUT"). Injuries are first-class: a starter
going down promotes his backup, a free agent who is hurt is scored down, and
Andrew's own injured players are called out at the top of the page with the
best free-agent replacement.

Picking a team on the page highlights, row by row, whether a free agent beats
that team's weakest player at the position and who to drop.

How to see it working: run `npm run dev`, open `http://localhost:3000/waivers`,
choose LadsLadsLads and Andrew's team, and read the RB tab. Each row shows a
score, flags, usage numbers, and an "upgrade over" column.

## Non-Goals

- No projections of any kind, from Sleeper or elsewhere. Andrew asked for the
  ranking to rest on play and team stats alone. Sleeper's trending-adds list
  is shown as a column for market context and never feeds the score.
- No push notifications, scheduled jobs or server. The site is a static export
  to GitHub Pages and stays that way; everything is fetched in the browser.
- No data sources beyond Sleeper. Route participation, yards per route run and
  coverage data are not in Sleeper's feed and are out of scope.
- No fitted model. Weights are hand-set in a config file. Learning them from
  past seasons is Milestone 7, deferred.
- No making waiver claims. The page is read-only against Sleeper.

## Definitions

- **Free agent / available:** a player not on any roster in the chosen league.
  A player counts as rostered if his id appears in any roster's `players`,
  `reserve` (IR slots) or `taxi` array from `GET /league/{id}/rosters`.
- **Completed week:** a regular-season week in which every game in the
  schedule feed has `status: "complete"`. A week with any game still
  `pre_game` or in progress is ignored entirely, so a Monday-night game does
  not leave half the league with an extra week of data.
- **Team game:** a completed week in which the player's current NFL team
  played (the team's `TEAM_XXX` entry exists in that week's stats). Bye weeks
  are not team games.
- **Played game:** a team game in which the player recorded `off_snp > 0`.
- **Window (L3):** the player's last three played games. **Prior:** all of
  his played games before the window this season.
- **Snap share:** `sum(off_snp) / sum(tm_off_snp)` over a set of games. Both
  fields are on the player's own weekly stats record.
- **Target share:** `sum(rec_tgt) / sum(TEAM.pass_att)` over the same games,
  where `TEAM` is the `TEAM_XXX` entry for the player's team that week. Pass
  attempts stand in for team targets; the two differ only by throwaways and
  spikes.
- **Carry share:** `sum(rush_att) / sum(TEAM.rush_att)`.
- **Air-yard share:** `sum(rec_air_yd) / sum(TEAM.pass_air_yd)`. Air yards are
  how far the ball travelled past the line of scrimmage on throws to the
  player, caught or not; a high share with few catches often precedes a
  breakout.
- **Red-zone opportunities (RZ opps):** `rec_rz_tgt + rush_rz_att` per played
  game. The red zone is inside the opponent's 20-yard line.
- **Trend:** a metric's window value minus its prior value. Zero when there
  are no prior games.
- **PPG:** fantasy points per played game in the window, using the Sleeper
  precomputed field matching the league's reception scoring: `pts_ppr` when
  `scoring_settings.rec` is 1, `pts_half_ppr` when 0.5, `pts_std` when 0.
- **Team volume:** over the team's last three team games, per game:
  `pass_att`, `rush_att`, `rz_att` (red-zone trips) and plays
  (`pass_att + rush_att + pass_sack`).
- **Percentile:** a player's rank within his position among all scorable
  players (rostered and free), expressed 0–100, ties sharing the average rank.
  Comparing against everyone, not only free agents, keeps "90th percentile"
  meaningful.
- **Score:** a 0–100 weighted sum of percentiles, then injury-adjusted (see
  Interfaces).
- **Depth chart:** Sleeper's `depth_chart_position` and `depth_chart_order` on
  each player in `GET /players/nfl`. Order 1 is the starter.
- **Next man up:** a free agent who stands to inherit a role because the
  player ahead of him on the depth chart is out (rules in Interfaces).
- **Flag:** a short labelled reason attached to a row, produced by a fixed
  rule with a fixed threshold.

## Progress

- [x] (2026-10-05) M0 — Endpoint spike. Every Sleeper endpoint the page needs
      returns `access-control-allow-origin: *` and the fields listed in
      Interfaces exist. Findings are in Surprises & Discoveries.
- [ ] M1 — Fixture capture, types, test wiring.
- [ ] M2 — Usage metrics and team volume.
- [ ] M3 — Score, flags and injury adjustment.
- [ ] M4 — Kicker and defence streaming.
- [ ] M5 — Availability, team view and the board.
- [ ] M6 — The `/waivers` page.
- [ ] M7 (deferred) — Fit weights from past seasons.

## Surprises & Discoveries

- **Team totals come free.** Each week's stats response contains one
  `TEAM_XXX` entry per team with offensive totals (`pass_att`, `rush_att`,
  `rz_att`, `rz_conv`, `pass_air_yd`, `fga`, `pass_sack`) and one bare `XXX`
  entry for that team's fantasy defence (`pts_allow`, `sack`, `int`,
  `fum_rec`, `yds_allow`, `fan_pts_allow_wr` and siblings). Shares need no
  summing of players. Evidence, week 4:

      TEAM_HOU {'pass_att': 31.0, 'rush_att': 19.0, 'rz_att': 2.0, 'rz_conv': 2.0,
                'pass_air_yd': 212.0, 'fga': 3.0, 'pass_sack': 2.0, 'pass_int': None}
      HOU      {'pts_allow': 34.0, 'sack': 3.0, 'yds_allow': 399.0, 'fan_pts_allow_wr': 58.5}

- **Team entries have no snap count.** `TEAM_XXX.off_snp` is absent. Snap
  share uses `tm_off_snp` from the player's own record instead.
- **Absent keys mean zero.** Sleeper omits a stat rather than sending 0
  (`pass_int` above). Every read goes through one helper that defaults to 0.
- **Receivers share one depth-chart order across slots.** WRs carry
  `depth_chart_position` of `LWR`, `RWR` or `SWR`, but `depth_chart_order`
  ranks the whole receiver room. New Orleans, 2026-10-05:

      Chris Olave RWR 1 · Devaughn Vele SWR 2 · Bryce Lance LWR 3 ·
      Barion Brown SWR 4 · Kevin Austin RWR 5

  So "order 1 at the position is out, order 2 inherits" is wrong for WRs. See
  the Decision Log for the receiver rule. About a third of active players
  (110 WRs, 53 RBs, 51 TEs) have no depth-chart position at all and are never
  eligible for next-man-up.
- **Schedule feed is separate and works.** `GET
  https://api.sleeper.com/schedule/nfl/regular/2026` (note `.com`, not
  `.app/v1`) returns 272 games with `week`, `home`, `away`, `status`. On
  2026-10-05 week 4 showed 15 `complete` and 1 `pre_game` (Monday night), which
  is exactly the case the completed-week rule handles.
- **The two 2026 leagues differ.** LadsLadsLads (12 teams) is half-PPR with
  K and DEF slots and 4 bench. Flexi (10 teams) is full PPR, superflex, no K
  or DEF, 12 bench. PPG and the K/DEF tabs key off league settings, not
  hard-coded league ids.
- **Injury vocabulary.** Active-player `injury_status` values seen:
  `Questionable` 280, `IR` 262, `Out` 204, `NA` 65, `PUP` 38, `Sus` 3, `DNR` 2,
  plus null. `Doubtful` was not present on a Monday but is a standard game-week
  designation and is handled.
- **Player map size.** `GET /players/nfl` is 2.57 MB compressed, about 12,200
  players. Fine to fetch once per visit and cache.

## Decision Log

- **Approach A, transparent signal score, over projection-led or a fitted
  model.** Projections lag role changes, which is the thing this page exists
  to catch, and Andrew ruled them out. A fitted model is more rigorous but
  roughly double the work; it is kept as M7 to tune A's weights later.
  (2026-10-05, Andrew)
- **Site page only.** No scheduled digest, no CLI. (2026-10-05, Andrew)
- **League-wide ranking with the user's team highlighted.** Not needs-first.
  (2026-10-05, Andrew)
- **Trending adds are display-only.** They measure other managers, not play.
  (2026-10-05, Andrew: "pure stats from their play and team")
- **Page layout, team view and code structure (Section 3 of the design) were
  not walked through in conversation before this plan was written.** They are
  specified below as proposals. Andrew should read M5 and M6 before they are
  built; anything he changes is recorded here. (2026-10-05, Claude)
- **Window is the player's last three played games, not the last three
  calendar weeks.** Calendar weeks would count byes and injury absences as
  zeros and bury a player returning to a full role. The sample guard (below)
  separately penalises players who have barely played. (2026-10-05, Claude)
- **Shares are volume-weighted** (sum over sum), not averages of weekly
  ratios, so a 10-snap garbage-time week cannot swing a share. (2026-10-05,
  Claude)
- **PPG uses Sleeper's precomputed `pts_ppr` / `pts_half_ppr` / `pts_std`**
  rather than re-scoring with each league's full settings. The leagues' only
  material difference is reception scoring, PPG is 5–10% of the score, and
  re-scoring would add a second scoring engine to maintain. (2026-10-05,
  Claude)
- **Receiver next-man-up rule.** Because WR depth order ranks the whole room,
  the WR "starters" are the three lowest `depth_chart_order` values on the
  team. When any of them is out, the healthy receiver with the lowest order
  outside that top three is next man up. RB, TE and QB use the plain rule:
  order 1 out, order 2 inherits. (2026-10-05, Claude)
- **K and DEF only appear when the league has those slots.** Flexi has
  neither. (2026-10-05, Claude)
- **Tables use AG Grid**, already a dependency (`ag-grid-react`, used in
  `components/league/table`), for sorting without new code. (2026-10-05,
  Claude)
- **No `satisfies` or other TypeScript 4.9+ syntax.** The repo builds with
  TypeScript 4.8.3 under Next 13.5. (2026-10-05, Claude)

## Outcomes & Retrospective

Not started.

## Context and Orientation

The repository is a Next.js 13.5 site (pages router, Chakra UI, Redux
Toolkit) for Andrew's fantasy football leagues on Sleeper, plus a set of
`tsx` scripts and a draft bot. Key facts:

- **Static export.** `.github/workflows/build-and-deploy.yml` runs `npm ci`,
  `npm test`, `npm run build`, `npm run export` and deploys `out/` to GitHub
  Pages on pushes to `main`. Pull requests run everything except the deploy.
  There is no server, so all live data is fetched in the browser. Existing
  pages already do this, for example `pages/age.tsx` calls
  `fetch('https://api.sleeper.app/v1/league/${leagueId}/rosters')` inside a
  `useEffect`.
- **League ids** are exported from `config/config.ts`. The two that matter
  are `ladsLeagueId2026 = '1325817907900354560'` and
  `flexiLeagueId2026 = '1386470320080171008'`.
- **Navigation** is the `LinkItems` array in `components/Sidebar.tsx`
  (Home, Trades, Weight, Age). A new entry adds a sidebar link.
- **Tests** run with Vitest. `vitest.config.mts` includes only
  `helpers/draft/**/*.test.ts` and `scripts/**/*.test.ts`; new test folders
  must be added there. `tsconfig.json` excludes `**/*.test.ts` from the Next
  type-check so tests may use newer syntax, but non-test code must compile
  under TypeScript 4.8.3.
- **Fixtures** are committed JSON under `fixtures/`, written by scripts such
  as `scripts/fetchFixtures.ts` (`npm run fixtures`). Tests read only
  committed fixtures and never touch the network. After refreshing any
  fixture, run `npm test` before committing, because golden snapshots read
  them.
- **Script style.** `scripts/team.ts` shows the house pattern: a short header
  comment with usage, `const API = 'https://api.sleeper.app/v1'`, a `getJson`
  helper with a 15-second abort, logic in `helpers/` so it is testable, the
  script itself only wiring.
- **Managers.** Some managers change display names between seasons (for
  example phillyson and YerMan are the same person). Anything that remembers
  a chosen team keys on Sleeper `user_id` / `owner_id`, never display name.

## Plan of Work

The logic lives in pure, network-free functions under a new
`helpers/waivers/` folder so it can be tested against committed fixtures. A
thin fetch layer and the page sit on top. Each milestone is independently
verifiable.

### M1 — Fixture capture, types, test wiring

Goal: a frozen snapshot of real data to build and test against.

Create `helpers/waivers/types.ts` with the Sleeper shapes the feature reads
(see Interfaces). Create `scripts/fetchWaiverFixtures.ts`, wired as
`"waivers:fixtures": "tsx scripts/fetchWaiverFixtures.ts"` in `package.json`.
It fetches NFL state, the 2026 schedule, stats for weeks 1 through the current
week, trending adds, and both 2026 leagues' league record, rosters and users,
and writes them to `fixtures/waivers/2026/`. To keep the fixture small it
trims each week's stats to the keys listed in `STAT_KEYS` (exported from
`helpers/waivers/types.ts`), drops every entry that is not a QB, RB, WR, TE,
K, DEF or `TEAM_XXX` record (the stats feed also carries defensive players),
and trims the player map to QB/RB/WR/TE/K players who appear in any captured
stats week or roster, plus every `DEF` entry, keeping only
`player_id, full_name, position, team, active, injury_status,
depth_chart_position, depth_chart_order`. It writes a `meta.json` with the
capture timestamp. Add `'helpers/waivers/**/*.test.ts'` to `vitest.config.mts`.

Result: `npm run waivers:fixtures` writes the folder; a smoke test
`helpers/waivers/fixtures.test.ts` loads every file and asserts the
completed-week count is at least 3.

### M2 — Usage metrics and team volume

Goal: turn raw weekly stats into per-player window and prior metrics.

Create `helpers/waivers/weeks.ts` with `completedWeeks(schedule, upToWeek)`
and `teamGames(statsByWeek, team)`. Create `helpers/waivers/metrics.ts` with
`buildUsage(input)` returning a `PlayerUsage` per player with at least one
played game: window and prior snap, target, carry and air-yard shares, RZ
opps per game, PPG, games in window, team games in the last three, last-game
snap share, and per-game rushing and passing counts for QBs. Also
`teamVolume(statsByWeek, team, weeks)`. A single `stat(rec, key)` helper
returns 0 for missing keys.

Result and proof: `helpers/waivers/metrics.test.ts` covers, on hand-built
inputs, a bye week being skipped, an injured week not counting as a played
game, sum-over-sum shares, a player traded mid-season using the team he
played for each week, an incomplete week being excluded, and missing keys as
zero. A fixture test asserts a known starter has snap share above 0.6.

### M3 — Score, flags and injury adjustment

Goal: a 0–100 score and a list of flags per player.

Create `config/waivers.ts` holding every weight, threshold and multiplier
(values in Interfaces) and nothing else. Create `helpers/waivers/score.ts`
with `percentiles(values)` and `scorePlayers(usage, volume, players, config)`.
Create `helpers/waivers/injury.ts` with `nextManUp(players)` returning the set
of next-man-up player ids and the starter each replaces. Create
`helpers/waivers/flags.ts` with `flagsFor(...)`.

Result and proof: `score.test.ts` checks percentile ties, weights summing to
100 per position (a guard against config typos), the sample guard, each
injury multiplier, the next-man-up bonus and the 100 cap. `injury.test.ts`
covers the RB/TE/QB rule, the receiver-room rule with the New Orleans order
from Surprises, injured backups being skipped, and players with no depth order
being ineligible. `flags.test.ts` has one passing and one failing case per
flag threshold.

### M4 — Kicker and defence streaming

Goal: stats-only K and DEF rankings for leagues with those slots.

Create `helpers/waivers/streaming.ts` with `rankDefences` and `rankKickers`
(formulas in Interfaces), using `nextOpponent(schedule, team, week)` from
`weeks.ts`. A team on bye next week is listed last and marked "BYE".

Result and proof: `streaming.test.ts` checks the opponent lookup, bye
handling, and that a defence facing a turnover-prone offence outranks the same
defence facing a clean one.

### M5 — Availability, team view and the board

Goal: one function that produces everything the page renders.

Create `helpers/waivers/availability.ts` with `rosteredIds(rosters)` and
`teamView(roster, scored)` returning, for the chosen roster, the weakest
scored player at each position and the injured players (Questionable or
worse). Create `helpers/waivers/board.ts` exporting
`buildWaiverBoard(inputs, config, ownerId?)`. It returns a `WaiverBoard`
(Interfaces): per position, the top 25 free agents by score; K and DEF lists
when the league has those slots; and, when an owner is given, an `upgradeOver`
on each row and an `alerts` list of that owner's injured players, each paired
with the best free agent at the position.

A row's `upgradeOver` is the owner's lowest-scoring player at the same
position, shown only when the free agent's score beats it by at least
`config.upgradeMargin` (10). That player is the suggested drop.

Result and proof: `board.test.ts` asserts that no rostered player appears in
any list, that lists are sorted by score descending, and that K and DEF are
absent for Flexi, and keeps a golden snapshot of the LadsLadsLads board for
one fixed owner so any scoring change is visible in review.

### M6 — The `/waivers` page

Goal: Andrew can use it.

Create `helpers/waivers/fetch.ts`, which fetches the same inputs the fixture
script captures, live, in the browser, in parallel. The player map is cached
in `localStorage` under `waivers.players.v1` with a timestamp and reused for
six hours; every `localStorage` read and write is wrapped in try/catch so the
page still works when storage is blocked. Create `pages/waivers.tsx` and
`components/waivers/` (`PositionTable.tsx`, `FlagChip.tsx`,
`InjuryAlerts.tsx`). Add `{ name: 'Waivers', icon: FiSearch, href:
'/waivers' }` to `LinkItems` in `components/Sidebar.tsx`.

The page has, top to bottom:

1. A league selector (LadsLadsLads 2026, Flexi 2026) and a team selector
   populated from the league's users. Both are remembered in `localStorage`
   (`waivers.league`, `waivers.owner.<leagueId>`, keyed on `user_id`).
2. A data line: "Stats through week N · player data updated HH:MM".
3. Injury alerts for the chosen team, when there are any: "Kamara (RB) —
   Questionable. Best available RB: X, score 74."
4. Position tabs: QB, RB, WR, TE, and K and DEF when the league has them.
5. Per tab, a sortable table: rank, player, NFL team, score, flags, snap %
   (window, with trend arrow), target % or carry %, RZ opps per game,
   air-yard % (WR/TE), PPG, injury status, trending rank, and "Upgrade over"
   with the suggested drop.

Loading shows a spinner; a failed fetch shows which endpoint failed and a
retry button.

Result and proof: see Validation and Acceptance.

### M7 (deferred) — Fit weights from past seasons

Not scheduled. Pull 2024 and 2025 weekly stats, compute the same metrics at
each week, and fit weights that best predict each player's next three weeks
of PPG. Replace the hand-set numbers in `config/waivers.ts` only if the fitted
weights rank held-out weeks measurably better. Build this only once Andrew has
used the page for a few weeks and the hand-set weights feel wrong.

## Interfaces and Data Shapes

Sleeper endpoints read (all GET, all CORS-open, none authenticated):

    https://api.sleeper.app/v1/state/nfl                         -> { week, season, season_type }
    https://api.sleeper.com/schedule/nfl/regular/{season}        -> [{ week, home, away, status }]
    https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week} -> { [playerId | 'TEAM_XXX' | 'XXX']: { [statKey]: number } }
    https://api.sleeper.app/v1/players/nfl                       -> { [playerId]: PlayerMeta }
    https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=50 -> [{ player_id, count }]
    https://api.sleeper.app/v1/league/{id}                       -> { roster_positions, scoring_settings.rec }
    https://api.sleeper.app/v1/league/{id}/rosters               -> [{ roster_id, owner_id, players, reserve, taxi }]
    https://api.sleeper.app/v1/league/{id}/users                 -> [{ user_id, display_name, metadata.team_name }]

`STAT_KEYS` (the only stat keys read; the fixture keeps only these):

    off_snp tm_off_snp rec_tgt rec_air_yd rec_rz_tgt rush_att rush_yd rush_rz_att
    pass_att pass_rz_att pass_air_yd pass_sack pass_int fum_lost rz_att rz_conv fga
    pts_ppr pts_half_ppr pts_std pts_allow sack int fum_rec def_td

Core output types in `helpers/waivers/types.ts`:

    type Position = 'QB' | 'RB' | 'WR' | 'TE'
    type FlagKind = 'snapSurge' | 'targetHog' | 'workhorse' | 'buyLow'
                  | 'redZone' | 'nextManUp' | 'trending' | 'newRole' | 'injured'
    interface Flag { kind: FlagKind; label: string }   // label e.g. "Snap share +24 pts"
    interface ScoredPlayer {
      playerId: string; name: string; position: Position; team: string
      score: number                      // 0..100 after injury adjustment
      rawScore: number                   // before adjustment
      usage: PlayerUsage
      injuryStatus: string | null
      flags: Flag[]
      trendingRank: number | null        // 1..50, display only
    }
    interface WaiverRow extends ScoredPlayer {
      upgradeOver: { playerId: string; name: string; score: number } | null
    }
    interface WaiverBoard {
      throughWeek: number
      positions: Record<Position, WaiverRow[]>      // top 25 free agents each
      kickers: StreamRow[] | null                    // null when league has no K slot
      defences: StreamRow[] | null
      alerts: { player: ScoredPlayer; bestReplacement: WaiverRow | null }[]
    }

Score weights (each position sums to 100; "pct" means percentile; window
values unless marked trend):

    WR, TE  target share 30 · air-yard share 15 · target share trend 15 ·
            snap share trend 15 · RZ opps 10 · team pass_att/g 10 · PPG 5
    RB      carry share 25 · target share 15 · snap share trend 15 · RZ opps 15 ·
            carry share trend 10 · team (rush_att/g + rz_att/g, averaged pct) 10 · PPG 10
    QB      PPG 35 · rushing (rush_att/g and rush_yd/g, averaged pct) 25 ·
            pass_att/g 15 · pass_rz_att/g 15 · team plays/g 10

Adjustments, applied in this order:

    sample guard   played >= 2 of the team's last 3 team games -> scored normally
                   otherwise, last-game snap share >= 0.50       -> scored, flag newRole
                   otherwise                                     -> not listed
    next man up    +15
    injury         Questionable x0.9 · Doubtful x0.6 · Out, IR, PUP, Sus, NA x0.3
    cap            min(100, score)

Flag rules:

    snapSurge  last played game snap share - prior snap share >= 0.20 (needs prior games)
    targetHog  window target share >= 0.20 (WR, TE) or >= 0.12 (RB)
    workhorse  window carry share >= 0.50 (RB)
    buyLow     window air-yard share >= 0.25 and PPG below the position median (WR, TE)
    redZone    RZ opps per game >= 2
    nextManUp  in nextManUp() result; label names the injured starter and status
    trending   in the trending-adds list; label "Trending #N"
    newRole    admitted by the sample guard's second clause
    injured    injury_status is any non-null value other than "Active"

Next man up: a starter is "out" when `injury_status` is `Out`, `IR`,
`Doubtful`, `PUP` or `Sus`. For QB, RB and TE, players on a team are grouped
by `depth_chart_position` and sorted by `depth_chart_order`; if order 1 is out,
the lowest-ordered healthy player after him is next man up. For WR, all
receivers on the team form one group; the three lowest orders are the
starters, and if any is out, the lowest-ordered healthy receiver outside the
three is next man up.

Streaming (window = each team's last three team games, opponent from the
schedule for the first week after the last completed week):

    DEF score  pct(own sack/g + int/g + fum_rec/g) 40 · pct(-own pts_allow/g) 30 ·
               pct(opponent pass_sack/g + pass_int/g + fum_lost/g) 30
    K score    pct(team fga/g) 50 · pct(team (rz_att - rz_conv)/g) 30 ·
               pct(team plays/g) 20

## Concrete Steps

All commands run from the repository root, `/Users/andrew/orca/lads-nfl`.

Start the branch:

    git switch main && git pull && git switch -c waiver-scout

After M1, capture fixtures and confirm the shape:

    npm run waivers:fixtures
      wrote fixtures/waivers/2026/state.json
      wrote fixtures/waivers/2026/schedule.json
      wrote fixtures/waivers/2026/stats.week1.json ... stats.weekN.json
      wrote fixtures/waivers/2026/players.json  (~1,500 players)
      wrote fixtures/waivers/2026/trending.json
      wrote fixtures/waivers/2026/lads/{league,rosters,users}.json
      wrote fixtures/waivers/2026/flexi/{league,rosters,users}.json
      wrote fixtures/waivers/2026/meta.json

After every milestone:

    npm test
      Test Files  N passed
      Tests  N passed

After M6, the build must still produce a static export:

    npm run build && npm run export
      ...
      Export successful. Files written to /Users/andrew/orca/lads-nfl/out
    ls out/waivers.html
      out/waivers.html

## Validation and Acceptance

The feature is accepted when all of the following hold.

1. `npm test` passes, including the new `helpers/waivers/` specs and the
   board golden snapshot, with no network access.
2. `npm run build && npm run export` succeeds and writes `out/waivers.html`.
3. With `npm run dev` running, opening `http://localhost:3000/waivers`:
   - shows a "Waivers" link in the sidebar;
   - after loading, shows "Stats through week N", where N is the last week in
     which every game is complete;
   - lists up to 25 players on each of the QB, RB, WR and TE tabs, none of
     whom appears on any roster in the league in the Sleeper app;
   - shows K and DEF tabs for LadsLadsLads and not for Flexi;
   - every row has a score between 0 and 100 and, where a flag applies, a
     chip whose label states the number behind it;
   - choosing Andrew's team fills the "Upgrade over" column on some rows and,
     if any of his players is Questionable or worse, shows an alert naming
     that player and a replacement;
   - reloading keeps the chosen league and team, and the second load does not
     re-download `players/nfl` (visible in the browser network tab) within six
     hours.
4. Spot check, by hand, one flagged row against the Sleeper app: for a player
   flagged "Snap share +X pts", the snap counts on his Sleeper game log agree
   with the change to within a point.
5. In a private window with site storage blocked, the page still loads and
   ranks players; only the remembering of selections is lost.

## Idempotence and Recovery

- `npm run waivers:fixtures` overwrites `fixtures/waivers/2026/` each run. A
  refresh changes the golden snapshot; run `npm test`, inspect the snapshot
  diff, and update it with `npx vitest run -u` only if the changes are
  explained by the new data.
- The page only reads from Sleeper. Nothing it does can change a league.
- If Sleeper changes or removes the undocumented stats or schedule endpoints,
  the page shows the failing URL. The pure functions and fixtures are
  unaffected, so the fix is confined to `helpers/waivers/fetch.ts` and the
  fixture script.
- Cached player data can be cleared by removing the `waivers.players.v1`
  `localStorage` key; the next load refetches.

## Artifacts and Notes

The M0 spike checks, rerunnable at any time:

    for u in stats/nfl/regular/2026/4 players/nfl "players/nfl/trending/add?lookback_hours=48&limit=50"; do
      curl -sI -H "Origin: https://its-acarn.github.io" "https://api.sleeper.app/v1/$u" \
        | grep -i access-control-allow-origin
    done
      access-control-allow-origin: *   (x3)

    curl -s https://api.sleeper.app/v1/state/nfl
      {"week":4,"season":"2026","season_type":"regular","display_week":4,...}
