// Run the hindsight-free 2025 backtest and write the report.
//
//   npm run backtest
//
// Runs four configurations and writes
// docs/plans/draft-backtest-2025/report.md. The headline is the swap model
// with forced mode OFF, because Andrew's board has no kickers or defenses and
// his real 2025 roster had neither -- that is the like-for-like comparison.
//
// No network, no clock: every input is committed and the engine is seeded, so
// re-running reproduces the report byte for byte.
//
// See docs/plans/draft-backtest-2025/draft-backtest-2025-execplan.md, M6.

import * as fs from 'fs'
import * as path from 'path'
import { myPickNumbers, myRosterId } from '../helpers/draft/snake'
import { draftConfig } from '../helpers/draft/backtest/config'
import {
  loadBoard2025,
  loadFfc,
  loadJimmygPicks,
  loadLads2025Draft,
  loadLads2025League,
  loadLads2025Picks,
  loadLads2025TradedPicks,
  loadSheetAdp,
} from '../helpers/draft/backtest/load'
import { PipelineInputs } from '../helpers/draft/backtest/pipeline'
import { CounterfactualPick, CounterfactualResult, OpponentModel, runCounterfactual } from '../helpers/draft/backtest/swap'
import { buildUniverse, crossCheckAdp } from '../helpers/draft/backtest/universe'
import { PlayerLabel } from '../helpers/draft/backtest/swap'

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'plans', 'draft-backtest-2025', 'report.md')
const SIMS = 2000

const realFeed = loadLads2025Picks()
const draft = loadLads2025Draft()
const league = loadLads2025League()
const tradedPicks = loadLads2025TradedPicks()
const board = loadBoard2025()
const adp = loadSheetAdp()
const jimmygPicks = loadJimmygPicks()

const myPickNos = myPickNumbers(draftConfig(draft, tradedPicks, league.roster_positions, board.rules, false))
const rosterId = myRosterId(draft, board.myUserId)

function pipeline(forcedMode: boolean): PipelineInputs {
  return { adp, jimmygPicks, board, draft, tradedPicks, rosterPositions: league.roster_positions, forcedMode, sims: SIMS }
}

function run(model: OpponentModel, forcedMode: boolean): CounterfactualResult {
  return runCounterfactual({ pipeline: pipeline(forcedMode), realFeed, myPickNos, myRosterId: rosterId, model })
}

function label(p: PlayerLabel): string {
  return `${p.pos} ${p.name}`
}

const tierById: Record<string, number> = {}
for (let i = 0; i < board.players.length; i++) tierById[board.players[i].player_id] = board.players[i].tier

function tierLabel(playerId: string): string {
  return tierById[playerId] === undefined ? '—' : `T${tierById[playerId]}`
}

// Raw pick-for-pick agreement understates how close the two drafts are: a
// "disagreement" where both players sit in the same tier is the engine saying
// they are interchangeable and breaking the tie on need, not a difference of
// opinion about who is better. And two of the divergences are the engine
// merely reordering picks Andrew made himself.
interface Closeness {
  sharedPlayers: string[]
  sameTier: number
  tierComparable: number
  reorderings: number
}

function closeness(r: CounterfactualResult): Closeness {
  const engineIds: Record<string, boolean> = {}
  for (let i = 0; i < r.engineRoster.length; i++) engineIds[r.engineRoster[i].player_id] = true
  const shared: string[] = []
  for (let i = 0; i < r.realRoster.length; i++) {
    if (engineIds[r.realRoster[i].player_id]) shared.push(r.realRoster[i].name)
  }
  let sameTier = 0
  let tierComparable = 0
  let reorderings = 0
  for (let i = 0; i < r.myPicks.length; i++) {
    const p = r.myPicks[i]
    if (p.outcome === 'self') reorderings++
    const a = tierById[p.real.player_id]
    const b = tierById[p.engine.player_id]
    if (a === undefined || b === undefined) continue
    tierComparable++
    if (a === b) sameTier++
  }
  return { sharedPlayers: shared, sameTier, tierComparable, reorderings }
}

function rosterLines(roster: PlayerLabel[]): string {
  const byPos: Record<string, string[]> = {}
  for (let i = 0; i < roster.length; i++) {
    if (!byPos[roster[i].pos]) byPos[roster[i].pos] = []
    byPos[roster[i].pos].push(roster[i].name)
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const out: string[] = []
  for (let i = 0; i < order.length; i++) {
    if (byPos[order[i]]) out.push(`${order[i]} (${byPos[order[i]].length}): ${byPos[order[i]].join(', ')}`)
  }
  return out.join('\n')
}

function qbRound(picks: CounterfactualPick[]): string {
  for (let i = 0; i < picks.length; i++) {
    if (picks[i].engine.pos === 'QB') return `round ${picks[i].round} (pick ${picks[i].pickNo}), ${picks[i].engine.name}`
  }
  return 'never'
}

function summarise(r: CounterfactualResult): string {
  let agreed = 0
  let diverged = 0
  let noPartner = 0
  for (let i = 0; i < r.myPicks.length; i++) {
    if (r.myPicks[i].outcome === 'agreed') agreed++
    else diverged++
    if (r.myPicks[i].outcome === 'no-partner') noPartner++
  }
  return `engine agreed with ${agreed} of ${r.myPicks.length} picks; ${diverged} diverged; ${noPartner} into a player no manager drafted`
}

function comparisonTable(r: CounterfactualResult): string {
  const rows: string[] = [
    '| Round | Pick | You took | Your tier | Engine took | Its tier | |',
    '|---|---|---|---|---|---|---|',
  ]
  for (let i = 0; i < r.myPicks.length; i++) {
    const p = r.myPicks[i]
    const mark =
      p.outcome === 'agreed'
        ? 'same pick'
        : p.outcome === 'no-partner'
        ? 'diverged, nobody drafted him'
        : p.outcome === 'self'
        ? 'reordered your own pick'
        : tierById[p.real.player_id] !== undefined && tierById[p.real.player_id] === tierById[p.engine.player_id]
        ? 'diverged, same tier'
        : 'diverged'
    rows.push(
      `| ${p.round} | ${p.pickNo} | ${label(p.real)} | ${tierLabel(p.real.player_id)} | ` +
        `${label(p.engine)} | ${tierLabel(p.engine.player_id)} | ${mark} |`
    )
  }
  return rows.join('\n')
}

function pickDetail(p: CounterfactualPick): string {
  const parts: string[] = []
  const heading = p.outcome === 'agreed' ? 'agreed' : 'diverged'
  parts.push(`### Round ${p.round} — pick ${p.pickNo} · ${heading}`)
  parts.push('')
  parts.push(`- **You took:** ${label(p.real)}`)
  parts.push(`- **Engine took:** ${label(p.engine)}`)
  if (p.outcome === 'swapped') {
    parts.push(`- **Exchange:** roster ${p.displacedRosterId} receives ${p.real.name} in place of their pick ${p.displacedRealPickNo}`)
  } else if (p.outcome === 'no-partner') {
    parts.push(`- **Exchange:** none — no manager ever drafted ${p.engine.name}, so ${p.real.name} goes undrafted`)
  } else if (p.outcome === 'self') {
    parts.push(`- **Exchange:** none — ${p.engine.name} is a player you took at another of your own picks, so no manager is displaced`)
  }
  if (p.forced) parts.push('- **Forced:** the candidate set was collapsed to unfilled starters')
  parts.push(`- **Engine's reasoning:** ${p.rationale.join(' · ')}`)
  if (p.globalRationale.length > 0) parts.push(`- **Context:** ${p.globalRationale.join(' · ')}`)
  parts.push(`- **Reach calibration at this pick:** ${p.reachScale.toFixed(2)}`)
  return parts.join('\n')
}

function main(): void {
  const headline = run('swap', false)
  const forcedOn = run('swap', true)
  const cascadeOff = run('cascade', false)
  const cascadeOn = run('cascade', true)

  const universe = buildUniverse({ adp, ladsPicks: realFeed, jimmygPicks })
  const cc = crossCheckAdp(universe, loadFfc().players)

  const out: string[] = []
  out.push('# What Andrew\'s 2025 team would have looked like')
  out.push('')
  out.push('Generated by `npm run backtest`. Every input is committed and the engine is')
  out.push('seeded, so this file reproduces byte for byte.')
  out.push('')
  out.push('**This report makes no claim about which team would have scored more.** It says')
  out.push('what the team would have been and why. Judging whether it was better is deferred')
  out.push('to M7 of the plan, which is not built.')
  out.push('')
  out.push('## The two rosters')
  out.push('')
  out.push('Headline configuration: pairwise-swap opponents, forced mode off.')
  out.push('')
  out.push('**What you actually drafted**')
  out.push('')
  out.push('```')
  out.push(rosterLines(headline.realRoster))
  out.push('```')
  out.push('')
  out.push('**What the engine would have drafted**')
  out.push('')
  out.push('```')
  out.push(rosterLines(headline.engineRoster))
  out.push('```')
  out.push('')
  const close = closeness(headline)
  out.push(`${summarise(headline)}.`)
  out.push('')
  out.push('## How different is it, really')
  out.push('')
  out.push('Pick-for-pick agreement understates how close the two drafts are, in two ways.')
  out.push('')
  out.push(
    `- **${close.sharedPlayers.length} of 14 players appear on both rosters**` +
      (close.sharedPlayers.length > 0 ? `: ${close.sharedPlayers.join(', ')}.` : '.')
  )
  out.push(
    `- **${close.reorderings} of the divergences are the engine reordering your own picks** — ` +
      'it took a player you took yourself, just at a different one of your turns. No third ' +
      'party is involved and the roster is unaffected.'
  )
  out.push(
    `- **${close.sameTier} of ${close.tierComparable} comparable divergences are within the same tier of your own board.** ` +
      'Where that holds, the engine is not disagreeing with you about who is better — your ' +
      'board says the two are interchangeable, and the engine broke the tie on roster need.'
  )
  out.push('')
  out.push('## Round by round')
  out.push('')
  out.push(comparisonTable(headline))
  out.push('')
  out.push('## Every pick, with the engine\'s reasoning')
  out.push('')
  for (let i = 0; i < headline.myPicks.length; i++) {
    out.push(pickDetail(headline.myPicks[i]))
    out.push('')
  }

  out.push('## The quarterback check')
  out.push('')
  out.push('Andrew\'s board lists 23 quarterbacks in preference order with no tier breaks,')
  out.push('so the plan priced them level with the last tier — an assumption, not something')
  out.push('the sheet states. The check on it is which round the engine actually takes one.')
  out.push('')
  out.push(`- Engine took its first quarterback in **${qbRound(headline.myPicks)}**.`)
  out.push('- Andrew really took Brock Purdy at pick 146, **round 13**.')
  out.push('')
  const qbPick = headline.myPicks.filter((p) => p.engine.pos === 'QB')[0]
  const engineQbRound = qbPick ? qbPick.round : 99
  const gap = Math.abs(engineQbRound - 13)
  if (gap >= 3) {
    out.push(
      `**The assumption does not hold.** The engine reaches for a quarterback ${gap} rounds ` +
        'earlier than Andrew did. Pricing the QB column level with the last tier gives every ' +
        'one of the 23 quarterbacks the same value as a last-tier skill player, and because ' +
        'an empty QB slot carries a full 1.0 need weight against 0.75 for a flex-eligible ' +
        'receiver, the engine takes one the moment the board thins. That is coherent engine ' +
        'behaviour on a bad input, not an engine fault — the sheet simply never said where ' +
        'quarterbacks belong. The fix is tier breaks in that column, which costs a few ' +
        'minutes and would replace the guess with Andrew\'s actual view.'
    )
  } else {
    out.push('The assumption holds: the engine reaches for a quarterback at about the same point Andrew did.')
  }
  out.push('')

  out.push('## Sensitivity checks')
  out.push('')
  out.push('**Forced mode on** — the engine must fill the kicker and defense slots the')
  out.push('league lineup requires, spending two of fourteen picks on positions Andrew\'s')
  out.push('board does not rank at all and that a third of this league never drafts.')
  out.push('')
  out.push('```')
  out.push(rosterLines(forcedOn.engineRoster))
  out.push('```')
  out.push('')
  out.push(`${summarise(forcedOn)}. First quarterback in ${qbRound(forcedOn.myPicks)}.`)
  out.push('')
  out.push('**Cascade opponents** — instead of receiving the player Andrew really took, a')
  out.push('displaced manager falls through to the next name on their own real queue. More')
  out.push('behaviourally plausible, but every roster drifts further from reality with each')
  out.push('round, so the comparison gets noisier the deeper it goes.')
  out.push('')
  out.push('```')
  out.push(rosterLines(cascadeOff.engineRoster))
  out.push('```')
  out.push('')
  out.push(`Forced off: ${summarise(cascadeOff)}.`)
  out.push('')
  out.push('```')
  out.push(rosterLines(cascadeOn.engineRoster))
  out.push('```')
  out.push('')
  out.push(`Forced on: ${summarise(cascadeOn)}.`)
  out.push('')

  out.push('## Integrity checks')
  out.push('')
  const runs: { name: string; r: CounterfactualResult }[] = [
    { name: 'swap / forced off (headline)', r: headline },
    { name: 'swap / forced on', r: forcedOn },
    { name: 'cascade / forced off', r: cascadeOff },
    { name: 'cascade / forced on', r: cascadeOn },
  ]
  for (let i = 0; i < runs.length; i++) {
    const inv = runs[i].r.invariants
    out.push(
      `- **${runs[i].name}**: every roster holds 14 — ${inv.everyRosterHolds14 ? 'yes' : 'NO'}; ` +
        `duplicates — ${inv.duplicates.length}; added vs reality — ${inv.addedVsReality.length}; ` +
        `removed vs reality — ${inv.removedVsReality.length}; manager fallbacks — ${runs[i].r.fallbacks.length}`
    )
  }
  out.push('')
  out.push(
    `The ADP prior in use agrees with Fantasy Football Calculator\'s independent 2025 ` +
      `pre-season consensus at Pearson ${cc.pearson.toFixed(3)} over ${cc.matched} matched players ` +
      `(${cc.unmatched} unmatched).`
  )
  out.push('')
  out.push('The engine cannot see the future, and that is proved rather than asserted:')
  out.push('`helpers/draft/backtest/lookahead.test.ts` scrambles every pick from the decision')
  out.push('point onward, rebuilds the whole pipeline, and requires an identical')
  out.push('recommendation at all 14 picks. The same check applied to a deliberately leaky')
  out.push('prior built from realized pick order fails at 13 of 14, which is what makes a')
  out.push('passing run mean something.')
  out.push('')

  out.push('## What this cannot tell you')
  out.push('')
  out.push('- **One draft, one slot.** A single sample. It can show the engine is not')
  out.push('  obviously broken; it cannot show it is good.')
  out.push('- **Opponents are semi-scripted and do not react.** Nobody adjusts to being')
  out.push('  sniped, which mildly favours the engine.')
  out.push('- **The swap assumption is convenient, not behavioural.** A manager denied a')
  out.push('  player would take whatever their own board said next, not necessarily the one')
  out.push('  Andrew took. The cascade rosters above show how much that choice moves things.')
  out.push('- **The ADP prior is slightly stale.** The spreadsheet was captured before')
  out.push('  Fantasy Football Calculator\'s 31 August window, so late pre-season injury news')
  out.push('  — Joe Mixon most visibly — had not yet moved it.')
  out.push('- **No points.** Whether this roster would have scored more is not answered here.')
  out.push('- **Nothing after draft day.** Waivers and trades are most of a fantasy season')
  out.push('  and none of this models them.')
  out.push('')

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, out.join('\n'))
  // eslint-disable-next-line no-console
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`)
  // eslint-disable-next-line no-console
  console.log(`headline: ${summarise(headline)}`)
  // eslint-disable-next-line no-console
  console.log(`first QB: ${qbRound(headline.myPicks)}`)
}

if (require.main === module) {
  main()
}
