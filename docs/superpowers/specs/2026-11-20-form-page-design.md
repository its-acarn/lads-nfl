# Form page — design

**Status:** approved 2026-11-20 · **Date:** 2026-11-20 · **Owner:** Andrew

## Intent

Andrew opens this page to find players to **trade for or pick up off the
waiver wire** to improve his LadsLadsLads team. It answers four questions in
one place:

1. Who is scoring well lately (form over the last X games)?
2. Is that form backed by usage, or is it a hot streak? (and the reverse:
   who is being used heavily but not yet scoring — buy-low targets)
3. Who has soft matchups coming, judged by how many points each NFL defence
   has been allowing to each position?
4. Where is each LadsLadsLads team (Andrew's included) strong or thin, so he
   knows what he needs and who has depth to trade from?

## Goals

- Points are **LadsLadsLads 2026 league scoring**, exactly. Computed from raw
  weekly stats × the league's `scoring_settings`. Verified on week 10: this
  reproduces Sleeper's own half-PPR numbers for every QB/RB/WR/TE/K/DEF,
  differing only by the league's custom `fum: -1` (on top of `fum_lost: -2`).
- Every table's window is changeable: last **1–8 games, or Season**.
  Default 3.
- Every player row says who holds him: **FA**, the manager's name, or
  **Mine**, with a filter to narrow to free agents / other teams / mine.
- Covers all positions in the league: QB, RB, WR, TE, K, DEF.

## Non-goals

- No projections from Sleeper or anyone else (same stance as the Waiver
  Scout).
- No league picker or other leagues; LadsLadsLads 2026 only. (Keeping the
  league id in one constant so another league is a one-line change later.)
- No past seasons.
- No writing to Sleeper (no claims, no trade offers).
- No server, cron or notifications: static export, everything fetched in the
  browser, like `/waivers`.

## Anti-goals (failure even if it works)

- Points that don't match what the league shows. That would make every
  comparison untrustworthy.
- A noisy page where the useful signal (form vs usage, matchups) is buried.
- Byes and injury absences counted as zero-point games, which would make
  good players look out of form.

## Constraints

- Next 13 static export to GitHub Pages, Chakra UI, TypeScript 4.8 strict.
- Sleeper API only, read-only, CORS-open. The data loading already exists in
  `helpers/waivers/fetch.ts` (`fetchWaiverInputs`): state, schedule, league,
  rosters, users, trimmed player map (cached 6 h in localStorage), and per-week
  stats from `api.sleeper.com/stats/nfl/{season}/{week}` with each player's
  team for that week.
- Logic must be pure and network-free, tested against committed fixtures
  (repo convention: `helpers/waivers/*.test.ts`, `fixtures/waivers/2026/`).

## Approaches considered

- **A. New `/form` page reusing the Waiver Scout's data layer — chosen.**
  Own Sidebar entry, new pure logic in `helpers/form/`, shared fetch. Costs a
  one-off refresh of the shared trim/fixtures and the waivers snapshot.
- **B. Form tabs inside `/waivers`.** One load, but `/waivers` is free-agent
  only with a fixed 3-game window; trade targets and a variable window fight
  that, and the page is already busy.
- **C. Static write-up in `public/`.** Simplest, but stale between
  regenerations and no real toggles; useless for a weekly decision.

Andrew picked A.

## Design

### Data

- Reuse `fetchWaiverInputs(ladsLeagueId2026, …)`.
- Extend `STAT_KEYS` (`helpers/waivers/types.ts`) with every stat key needed
  for scoring: at minimum every key with a non-zero value in the LadsLadsLads
  `scoring_settings` (pass_yd, pass_td, pass_2pt, rush_td, rush_2pt, rec,
  rec_yd, rec_td, rec_2pt, fum, fgm_* buckets, fgmiss, xpm, xpmiss,
  pts_allow_* buckets, ff, safe, blk_kick, st_td, st_ff, st_fum_rec, def_st_*,
  fum_rec_td, …). Builder may instead keep every key present in
  `scoring_settings` generically; either is fine as long as the scoring test
  below passes.
- `shapeLeague` keeps the full `scoring_settings` (it currently keeps only
  `rec`). Waiver Scout behaviour must not change.
- Refresh `fixtures/waivers/2026/` with `npm run waivers:fixtures` so tests
  have many weeks (current fixture holds weeks 1–4). This changes the
  waivers golden snapshot; review that diff, it should only reflect new data.

### Scoring — `helpers/form/scoring.ts`

`pointsFor(line, scoring) = Σ stat[k] × scoring[k]` over keys in both.
Test: for a fixture week, league points equal Sleeper's `pts_half_ppr`
except where the player has `fum`, where they differ by exactly `−fum`.

### The window

- A player's window is his **last X games played**, not last X weeks.
  Played = `off_snp > 0` for QB/RB/WR/TE (the Waiver Scout's rule); for K and
  DEF, **his own stat row that week has `gp > 0`** (not his current team's
  schedule, so a kicker signed mid-season or a backup never gets phantom
  zero games). Checked on week 10: every kicker who played has `gp`,
  including one who scored 0; inactive kickers have no `gp`. *(Builder-check
  call.)* Only completed weeks count
  (`completedWeeks`).
- "Season" = all games played.
- Each table has its own window control. The matchup colouring on the
  player table uses the points-allowed table's window.

### Table 1 — Player form

One row per player with ≥1 game in the window. Columns:

| Column | Meaning |
|---|---|
| Player, Pos, NFL team, injury chip | identity |
| Owner | FA / manager name / Mine |
| GP | games in window (shows e.g. "2 of 3" if fewer than X played) |
| Avg | league points per game in window |
| Season | league points per game, season |
| Δ | Avg − Season |
| Weeks | each game's points in the window, oldest → newest |
| Floor | lowest single game in window |
| Hit | games in window ≥ position threshold, e.g. "3/4" |
| Snap %, Tgt %, Carry %, RZ/g | usage over the same window (QB–TE only) |
| Signal | Buy low / Sell high / blank (below) |
| Next 3 | next three opponents, coloured by matchup (below); "BYE" shown |

Controls: window, position (All, QB, RB, WR, TE, FLEX = RB/WR/TE, K, DEF),
owner filter (All / Free agents / Other teams / Mine), sort by any column
(default Avg desc), "min games" (default 1), name search.

*(Added 2026-11-21.)* A **Last** column shows the week of his last game and
how many of his current team's games (finished weeks only) he has missed
since. Players who have missed 2+ are hidden by default, with a toggle and a
count of how many are hidden; a name search finds them anyway. Exception:
**returning** players (no Out/IR-type status, first on his depth chart,
on an NFL team) stay visible with a chip, since they are often the best target the week
before they play again. Limits live in `config/form.ts`.

Hit thresholds (Andrew's call left open; these are defaults, editable on the
page): QB 18, RB 12, WR 12, TE 9, K 8, DEF 7.

### Buy low / Sell high signal (QB–TE)

Within each position, over the same window. **Pool** *(builder-check call)*:
players with ≥ 2 games in the window and a real role — window snap share
≥ 50% for QB, ≥ 25% for RB/WR/TE. This keeps garbage-time backups from
setting the percentiles. *(Added 2026-11-21.)* Also out of the pool: anyone
listed IR / Out / PUP / Sus / NA, or who has missed more than one of his
team's games since he last played, so injured or benched players neither get
a signal nor skew the percentiles. Pool cut-offs and the ±25 thresholds are untuned
starting values, kept together in one config constant (`config/form.ts`)
so they can be adjusted after Andrew sees real output.

- **Usage percentile:** average percentile of the usage measures that matter
  for the position — QB: pass att/g, rush att/g, RZ opps/g; RB: snap %,
  carry %, target %, RZ opps/g; WR/TE: snap %, target %, air-yards %, RZ
  opps/g. Reuse `percentiles` from `helpers/waivers/score.ts`.
- **Points percentile:** percentile of Avg.
- Gap = usage − points. **Buy low** if gap ≥ +25; **Sell high** if ≤ −25.
  Thresholds live in one config constant.
- Hover/tooltip shows both percentiles so the reasoning is visible.

### Table 2 — Points allowed

One row per NFL team (32). Columns QB, RB, WR, TE, K, DEF: average league
points per game scored **against** that team by players at that position,
over the team's last X games (team games, so byes are skipped).

- Points against team T in week w at position P = sum of league points of
  every player at P whose week-w team played T in week w (opponent from the
  schedule). Position = the player's Sleeper `position`.
- Each cell shows the value and its rank (1 = gives up the most = softest),
  coloured on a soft → tough scale.
- Window control (default 6: a team's last 3 games proved too noisy, see
  2026-11-21 review), sortable by any column.

### Matchup colouring (Next 3 on Table 1)

For each of a player's next three weeks starting at `upcomingWeek`, look up
the opponent's rank in Table 2 for the player's position: ranks 1–10 soft
(green), 11–22 neutral, 23–32 tough (red). The rank is printed on the badge
(e.g. "WAS #23") so it reads without colour or hover. BYE shown plainly.

### Table 3 — League team form

One row per LadsLadsLads team (12), using **current rosters** and each
player's window Avg (Table 1's window):

- Best possible starting lineup by slot, filled greedily by Avg under the
  league's `roster_positions` (QB, RB×2, WR×2, TE, FLEX×2 from RB/WR/TE, K,
  DEF). Columns: points per slot group (QB, RB, WR, TE, FLEX, K, DEF), total.
- **Bench depth:** sum of the best bench player at each of RB/WR/TE (who'd
  be next in), so "has depth to trade from" is visible.
- Each cell ranked 1–12 and coloured; Andrew's row highlighted.
- Clicking a team expands it to show the players in that best lineup and the
  bench players behind the Bench figure.

Who is eligible for the lineup and bench (Andrew's call): **every rostered
player, including IR/reserve and injured players**, as long as he has a
points figure. A player with no games in the window uses his season
average; a player with no games all season is left out. Injury status is
shown as a chip, never used to exclude.

This measures *current* strength (what each team could field now), not
what they actually scored, because that's what matters for trades.

### "Mine"

Andrew picks his team from a selector (same pattern and localStorage
remembering as `/waivers`); "Mine" and the highlight follow it.

### Page

- Route `pages/form.tsx`, Sidebar item "Form".
- Layout: header with league name and "through week N"; tabs or stacked
  sections for Player form, Points allowed, Team form. Builder's call.
- Loading and error states as on `/waivers`.

## Left to the builder

- Module boundaries inside `helpers/form/`, component split, Chakra table vs
  ag-grid (both already in the repo).
- Exact colours (must work in light and dark), tooltips, mobile behaviour
  (horizontal scroll inside the table is fine).
- Whether usage reuses `buildUsage` with a window parameter or a new
  function; `buildUsage`'s fixed `WINDOW = 3` must stay the Waiver Scout's
  behaviour.
- Test coverage beyond the scoring test above: window rules (byes,
  injuries), points-allowed attribution, signal thresholds, lineup filling.
