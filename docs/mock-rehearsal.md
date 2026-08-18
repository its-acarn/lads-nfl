# Mock-draft rehearsal

How to draft a Sleeper mock against your real board with the bot attached, and
read back the team you got.

Written from a rehearsal that was actually run (2026-08-16, mock
`1394452945935794176`, 168 picks, slot 5) rather than from what the code looked
like it would do. Where the two differed, this document follows what happened.

The bot **never makes a pick.** Sleeper's public API is read-only. It watches
the pick feed, tells you what to draft, and then reads the feed back to confirm
what actually landed.

---

## The short version

```
npm run bot -- --mock <draftId> --log logs/$(date +%F).jsonl
```

...then draft in the Sleeper app, then:

```
npm run team -- --draft <draftId> --log logs/$(date +%F).jsonl
```

Everything below is the detail around those two commands.

---

## Step 1 — Refresh the player map

```
npm run fixtures
```

Only needed if `fixtures/players.trim.json` is more than a couple of days old.

Live mode **refuses** a map older than 48 hours; mock mode warns and proceeds.
The map defines the draftable pool and carries the injury designations the stash
rule reads, so a stale one hides players signed since it was taken and treats a
since-injured player as healthy.

## Step 2 — Import the board

Only when the spreadsheet has changed.

```
npm run board:import -- --sheet 1MR-Pj7QUEf3aq6cFoaQXdCP4cOJEIi7gW6JByXwxqLk
npm run resolve-board
```

`--tab` defaults to **`My Board`**, the 2026 board tab. Pass `--tab "<name>"` for
any other. If the name is not in the sheet the import stops and lists the tabs
that are — see the warning below for why that matters more than it sounds.

Two sheet layouts are supported and detected automatically from the header row:

- **Ranked table** — one row per player, with `RK | TIERS | PLAYER NAME | TEAM |
  POS | ...`. This is the 2026 sheet and the shape a FantasyPros export arrives
  in. Position and team come straight from the row; `RB1`/`WR355`/`DST` are
  reduced to `RB`/`WR`/`DEF`.
- **Tier grid** — one column per tier, names in rows 2–24. This is the 2025
  sheet, still read by the backtest.

### Two ways to write the tier column

A ranked tab may state tiers either way, and the importer picks the mode from
what is in the column:

- **Numbers** — `1`, `1`, `2`, `2`… one per row, as an export arrives.
- **Break markers** — an `x` on the **first player of each tier**, blank
  everywhere else. The tier number is then derived from position: running count
  of markers, and rows above the first `x` are tier 1.

Markers exist because a board maintained by **dragging rows** cannot also carry
hand-typed tier numbers. Every drag across a boundary would need a second edit
in the tier cell, and forgetting it trips the monotonic check and fails the
import. With markers a tier decrease is not merely detected, it is impossible to
express — drag a player anywhere and he takes the tier of the block he lands in.

Marker mode is entered only when the column contains **no tier number anywhere
and at least one marker**. A half-converted column — some numbers, some marks —
stays in number mode and reports the marks as unusable rows, rather than
silently re-tiering the whole board off two stray cells.

`--depth N` sets how far down a ranked sheet to read (default 300). A 12×14
draft is 168 picks, so 300 covers every pick with room to spare plus the depth
the survival simulator reads. Anyone past it is priced by ADP interpolation,
which is exactly what "off-board" means. Going deeper mostly adds players
Sleeper's map has never heard of, and the resolver will then refuse the import
over names that could not have mattered.

Positions your rules cap at zero (`maxByPos.K: 0`, `maxByPos.DEF: 0`) are
dropped at import — carrying them would only give the engine something it must
then refuse.

> **Warning: Google silently serves the first tab.** Asked for a tab name — or
> even a gid — that does not exist, the CSV endpoints answer `200` with the
> *first* sheet rather than an error. This is not hypothetical: `--tab` used to
> default to `LLL Tiers`, which is the **2025** sheet's name, so every 2026
> import quietly read the `ADP` export instead and produced a board that looked
> entirely healthy — right player count, plausible names, wrong board. The mock
> of 2026-08-16 was drafted against the market's rankings, not Andrew's.
>
> The importer now reads the sheet's real tab list first and **refuses a tab the
> sheet does not have**, naming the ones it does. `--gid <n>` (the number in the
> sheet URL) skips that lookup, as an escape hatch for the day Google changes
> the page the list is read from.
>
> Still worth checking the "first 15" line against what you expect. A guard
> against the wrong *tab* is not a guard against the wrong *sheet*.

### When a name will not resolve

`resolve-board` refuses to guess and exits non-zero listing every name it could
not place. Two kinds of problem, two different fixes, both recorded in
`config/board.json` so they survive re-downloading the export:

```jsonc
"nameAliases": { "Hollywood Brown": "Marquise Brown" },   // Sleeper's name for them
"notInLeague": [ "Keenan Allen" ]                          // no Sleeper record at all
```

Both are applied at import and **printed on every run**, along with a note if
one of them stops matching anything — so if a player on `notInLeague` signs
somewhere, delete them from the list and re-import rather than leaving them
quietly undraftable all season.

The first reads the tier grid and rewrites **only** the `players` array in
`config/board.json`. Every other key — `season`, `leagueId`, `draftId`,
`myUserId`, `doNotDraft`, `pins`, the whole `rules` block and the `//`-prefixed
comments that document it — is left byte for byte as it was. The rules encode
tuning that took real thought, and losing it to an import would be a genuine
setback.

The second resolves every name to a Sleeper `player_id`. **It refuses to
guess.** Anything ambiguous or unfound is reported by name and the command exits
non-zero. Fix the spelling in the sheet and re-run rather than forcing it
through: a silent mismatch means the wrong player's name on the clock.

The sheet must be shared as **"anyone with the link can view"**. If it is not,
the importer fetches HTML instead of CSV and says so.

The importer refuses to write a board of fewer than 50 players. A partially
parsed board — a renamed column, a moved tier block — still looks plausible and
drafts badly.

> **The board is only as good as the sheet.** The importer checks structure —
> that tiers parse and do not go backwards, that names resolve, that the board
> is not implausibly short. It cannot check judgement. If the sheet is an
> unedited rankings export, then the "board" the engine treats as *your
> preference* is really the market's consensus, and the separation between what
> you want and what the room will do — which the whole design rests on —
> collapses. Re-order and re-tier it before setting `draftReady`.

## Step 3 — Create the mock

In the Sleeper app. Copy the id out of the URL:

```
https://sleeper.app/draft/nfl/1394452945935794176
                                ^^^^^^^^^^^^^^^^^^^
```

**Mocks are not discoverable through the API.** `GET /user/<id>/drafts/nfl/2026`
returns only real league drafts, so there is no "find my latest mock" and the id
has to be pasted.

Create it **from inside the league** if you can. A league mock carries the real
league id in `metadata.league_id`, and the bot uses that to pick up the real
lineup. A standalone mock falls back to deriving the lineup from
`settings.slots_*`, which works but is not necessarily the lineup you draft
against in September.

## Step 4 — Start the bot

```
npm run bot -- --mock <draftId> --log logs/2026-08-16.jsonl
```

Start it **before** the room fills. It polls through `pre_draft` and picks up
the transition on its own.

> **A bot that appears to be doing nothing is a bot that is waiting correctly.**
> A mock sits in `pre_draft` until someone starts it, and an empty room never
> will. The rehearsal mock sat at `pre_draft` with 1 of 12 slots filled for
> fifteen hours before it was started. Nothing was wrong. A stale draft id
> behaves identically — it waits forever — so check the id if the room is
> definitely full and nothing is happening.

What it prints at startup:

```
player map age: 0h (limit 48h) — OK
MOCK DRAFT 1394452945935794176 — board has 157 players
mock of league 1325817907900354560 — using its real lineup
logging every message to logs/2026-08-16.jsonl
[11:47:24] READY — 12 teams, 14 rounds, you are slot 5.
           Your picks: 5, 20, 29, 44, 53, 68, 77, 92, 101, 116, 125, 140, 149, 164
```

Check the slot and the pick numbers against the app **now**. A wrong `myUserId`
is far cheaper to spot here than at pick one.

`--log` is optional but recommended: it writes one JSON object per message,
which is what a second reader (a relaying assistant, or `npm run team` later)
follows. It **appends and never truncates**, so killing the bot and restarting
keeps the first half of the record. `logs/` is gitignored.

## Step 5 — Draft

Watch the console. It carries the instruction the instant it is issued and is
the channel to trust on a 120-second clock.

What you will see per pick:

```
[11:52:31] ON THE CLOCK — pick 20
           TAKE: WR A.J. Brown
[11:53:43] STILL OPEN after 72s — pick 20
           TAKE: WR A.J. Brown
[11:53:58] CONFIRMED pick 20: WR A.J. Brown. Nice one.
```

**One name, no numbers, and nothing to interpret.** The reader of these messages
is someone drafting the name they are given and doing no analysis, so anything
beyond the name is at best noise beside the instruction and at worst a decision
they are not equipped to make.

Three things used to appear here and no longer do:

- **The survival forecast** — `TAKE: WR A.J. Brown (64% survives)`. It once
  rendered on Andrew's console only, on the reasoning that it tells him whether
  a pick is urgent or safe to skip. But the console is not a private screen; it
  is the text that gets relayed on. There is now a single rendering for
  everyone, and the forecast is in none of it.
- **`Likely: <name>`** on the approach warning. That name is provisional by
  construction — the board moves between the warning and the clock. In the
  2026-08-17 mock it said Puka Nacua and the instruction four seconds later
  said Jonathan Taylor. A reader who drafts the name in front of them cannot be
  given a name they are meant to ignore.
- **The `HEADS UP` message itself.** Dropping the name left a bare "pick 20 is 3
  away", which is a notification the relay must read and then discard: they act
  on the instruction, and nothing else asks anything of them. The message kind
  is gone from `DraftMessage` rather than merely silenced, so nothing can send
  one. That also removes a full `recommend()` — a survival simulation — that ran
  on the approach purely to fill a shortlist which was never rendered.

The forecast is still *computed*, because it drives the recommendation. It is
simply never rendered, so a future channel cannot leak it by accident.

If the player you were told to take is drafted while your pick is still open,
the bot issues a **fresh** single-name instruction naming someone still
available. You never need to ask for an alternative.

You never have to report what you picked. The bot reads it back from the feed
and says `CONFIRMED` or `MISMATCH`. A `MISMATCH` is not an error — it just means
you overrode the recommendation, and the engine recomputes from the roster you
actually hold.

Escalation (`STILL OPEN`) fires at 60% and 85% of the draft's own pick timer —
72s and 102s on a 120-second clock. Those thresholds exist because a relay is
slow; see *What the rehearsal taught us* below.

### If something goes wrong

- **The bot dies.** Restart it with the same command. It rebuilds state from the
  feed and the sent-log in `.draftbot/`, and re-sends nothing. The `--log` file
  is appended to, not replaced.
- **`BOT ERROR` repeatedly.** It reports every fifth consecutive failure and
  keeps retrying with backoff. A permanent fault (bad id, unsupported draft
  shape) will say so in the message.
- **The draft is paused.** It says so once and then polls only the draft object
  until it resumes.

## Step 6 — Read the team back

```
npm run team -- --draft <draftId> --log logs/2026-08-16.jsonl
```

Four sections:

1. **The team in pick order** — round, pick, position, player, and where your
   board ranked them.
2. **By position** — whether you came out with a startable lineup.
3. **What each pick cost** — for every pick, the players your board ranked
   *above* the one taken who were still available at that moment. This is the
   honest measure of whether the board was followed, and the one thing a
   Sleeper screenshot cannot show.
4. **Instructions vs. picks** — how often you took the recommendation, how often
   you overrode it, and what you took instead. Omitted without `--log`: the
   picks feed alone cannot tell a considered override from a recommendation
   that never arrived.

It works on any completed draft, not just one the bot watched:

```
npm run team -- --fixtures fixtures/lads/2025 --slot 2
```

---

## What the rehearsal taught us

Recorded because none of it was predictable from the code.

**A bot-filled room finishes in eighteen minutes.** Eleven Sleeper autopick bots
picked instantly, stalling only on Andrew's turns. 168 picks ran 11:47:24 to
12:05:11.

**A ranked board says nothing about backfields.** The 2026-08-17 mock came out
holding Bucky Irving *and* Kenny Gainwell, Tony Pollard *and* Tyjae Spears —
two Tampa Bay backs and two Tennessee ones. Nothing was malfunctioning: the
board ranks players, and at each of those picks the second back genuinely was
the highest-ranked man available. But two backs out of one backfield split the
touches that make either worth owning, and the injury that hands one the job is
the same injury that removes the other, so the pair is worth less than its two
ranks suggest. That is a fact about a roster, and a list of players has no way
to say it. `rules.maxPerNflTeamByPos: { "RB": 1 }` says it instead. Replaying
the same feed with the rule on changes exactly two picks (101 and 164) and
leaves the other twelve alone.

**Pick faster than the poll and the instruction never arrives.** In the
2026-08-17 mock, pick 92 produced no `ON THE CLOCK` and no `CONFIRMED` — the
bot went from pick 77's confirmation straight to the approach of pick 101.
Nothing was wrong with the pick itself: Chris Godwin was taken, Sleeper recorded
him against Andrew's user id, and the engine rebuilt from the feed and carried
on. The pick simply landed *between two polls*, so the bot never observed the
on-the-clock state at all.

Worth knowing for two reasons. It cannot happen on a real 120-second clock,
where the relay is the slow part — those mock picks were landing 16 seconds
apart, well inside one poll cycle. And it means the `Instructions vs. picks`
table counts instructions *issued*, not picks made: that mock reports "13 of 13
taken" for a 14-pick draft. A missing row there is not an override.

**That also meant `HEADS UP` barely fired.** With instant bots, every intervening
pick lands inside one poll cycle, so the bot went straight from "you just
picked" to "you are on the clock" and never observed the one-to-three-away
window. It fired once in fourteen picks. Recorded because it was the first
evidence the message was not worth its keep; it has since been removed
outright, for the separate reason that the relay had nothing to do with it.

**The relay is slower than you think.** Andrew's picks took about 76 seconds
each. Reading a recommendation and acting on it is simply not a 40-second
operation, which is why the first escalation threshold was moved from a third
of the pick timer to 60% of it.

**A mock room is not the lads league.** The *team* a rehearsal produces is close
to meaningless as a prediction — the room is bots and strangers. What a
rehearsal genuinely tests is the workflow, the board, the message copy under
time pressure, and whether the recommendations feel right.

**Sleeper leaves `roster_id` null on every pick of a mock.** This one was a real
bug and is fixed (`8549a6a`): the engine skipped every pick and believed it held
nobody, so position caps stopped binding and `DRAFT COMPLETE` printed a blank
roster. It now falls back to `slot_to_roster_id[draft_slot]`. Worth knowing
because it is invisible in every committed fixture — those are real drafts,
where Sleeper populates the field.

---

## Reference

| Command | What it does |
| :-- | :-- |
| `npm run fixtures` | Refresh the Sleeper player map |
| `npm run board:import -- --sheet <id> [--tab "<tab>"] [--gid <n>]` | Sheet → `config/board.json` (tab defaults to `My Board`) |
| `npm run resolve-board` | Names → player ids; refuses to guess |
| `npm run bot -- --mock <id> [--log <path>]` | Run against a live mock |
| `npm run bot -- --dry-run --fixtures <dir> --slot N --speed 200` | Replay a fixture through the real loop |
| `npm run team -- --draft <id> [--log <path>]` | Report a completed draft |
| `npm test` | The suite |

Runtime state lives in `.draftbot/sent-log.<draftId>.json` (gitignored). Delete
it only if you want the bot to re-send messages it has already sent.
