// Replay the engine against committed fixtures and print the Phase 2 report:
// agreement rates, counterfactual roster values, guardrail violations, and
// the survival calibration table. Exits non-zero if any exit criterion fails.
//
//   npm run replay                 # full report, all fixtures, all slots
//   npm run replay -- --sims 500   # faster
//   npm run replay -- --fixture lads/2024 --slot 3

import { loadAllFixtures, loadTrimmedPlayers } from '../helpers/draft/fixtures.testutil'
import {
  bucketise,
  calibrationMae,
  CalibrationSample,
  replayAgreement,
  replayCounterfactual,
} from '../helpers/draft/replay'
import { DEFAULT_SIM_OPTS } from '../helpers/draft/survival'
import { BoardRules, SimOpts } from '../helpers/draft/types'
import * as fs from 'fs'
import * as path from 'path'

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

// The rules the live bot will actually run with, lifted straight from
// config/board.json so the two cannot drift. Only the RULES are overlaid --
// the board's tiers and ADP still come from the fixture's market, because a
// 2026 board cannot rank a 2020 pool.
function liveRulesOverlay(): Partial<BoardRules> {
  const board = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'board.json'), 'utf8')
  ) as { rules: Record<string, unknown> }
  const r = board.rules
  const overlay: Partial<BoardRules> = {}
  const keys = ['maxByPos', 'minRoundByPos', 'stashRound', 'offBoardDiscount', 'vonaFromRound', 'useRosterNeed', 'useForcedStarters', 'needWeights', 'value']
  for (let i = 0; i < keys.length; i++) {
    if (r[keys[i]] !== undefined) (overlay as Record<string, unknown>)[keys[i]] = r[keys[i]]
  }
  return overlay
}

function main(): void {
  const simsArg = arg('sims')
  const fixtureArg = arg('fixture')
  const slotArg = arg('slot')

  // --rules live overlays config/board.json's rules onto every replay, so the
  // corpus exercises the configuration that will actually drive the draft
  // rather than marketRules, which sets none of it.
  const useLiveRules = arg('rules') === 'live'
  const overlay = useLiveRules ? liveRulesOverlay() : null
  if (useLiveRules) {
    // eslint-disable-next-line no-console
    console.log(`RULES: live (from config/board.json) — ${JSON.stringify(overlay)}\n`)
  }

  const realPlayers = loadTrimmedPlayers()
  let fixtures = loadAllFixtures()
  if (fixtureArg) {
    fixtures = fixtures.filter((f) => `${f.name}/${f.season}` === fixtureArg)
    if (fixtures.length === 0) throw new Error(`unknown fixture ${fixtureArg}`)
  }

  let failed = false
  const calibration: CalibrationSample[] = []

  for (let f = 0; f < fixtures.length; f++) {
    const fx = fixtures[f]
    const teams = fx.draft.settings.teams

    // Replay uses a NEUTRAL reachScale: the market board's ADP is the pick
    // order itself, so observed displacement is 0 by construction and
    // computeReachScale would be degenerate here. Live mode calibrates
    // against the real board's ADP instead; the temperature defaults are
    // tuned so the calibration table below passes at scale 1.
    const opts: SimOpts = {
      ...DEFAULT_SIM_OPTS,
      sims: simsArg ? parseInt(simsArg, 10) : 1000,
      reachScale: 1,
    }

    const slots: number[] = []
    if (slotArg) slots.push(parseInt(slotArg, 10))
    else for (let s = 1; s <= teams; s++) slots.push(s)

    let primarySum = 0
    let top3Sum = 0
    let posSum = 0
    let cfWins = 0
    let violationCount = 0
    let relaxCount = 0

    // eslint-disable-next-line no-console
    console.log(`\n=== ${fx.name}/${fx.season} (${fx.draft.type}, ${teams} teams, ${fx.draft.settings.rounds} rounds) ===`)

    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s]
      const agreement = replayAgreement(fx, realPlayers, slot, opts, calibration, overlay)
      const cf = replayCounterfactual(fx, realPlayers, slot, opts, overlay)
      primarySum += agreement.primaryRate
      top3Sum += agreement.top3Rate
      posSum += agreement.samePosRate
      if (cf.myValue >= cf.realValue) cfWins++
      violationCount += cf.guardrailViolations.length
      relaxCount += cf.forcedRelaxations.length
      for (let v = 0; v < cf.guardrailViolations.length; v++) {
        // eslint-disable-next-line no-console
        console.log(`  VIOLATION slot ${slot}: ${cf.guardrailViolations[v]}`)
      }
      // eslint-disable-next-line no-console
      console.log(
        `  slot ${String(slot).length < 2 ? ' ' : ''}${slot}: agree primary ${pct(agreement.primaryRate)} top3 ${pct(agreement.top3Rate)} pos ${pct(agreement.samePosRate)} | counterfactual ${cf.myValue.toFixed(1)} vs real ${cf.realValue.toFixed(1)} ${cf.myValue >= cf.realValue ? 'WIN' : 'loss'}`
      )
    }

    const n = slots.length
    // eslint-disable-next-line no-console
    console.log(
      `  MEAN: primary ${pct(primarySum / n)} top3 ${pct(top3Sum / n)} pos ${pct(posSum / n)} | counterfactual wins ${cfWins}/${n} | violations ${violationCount}` +
        (relaxCount > 0 ? ` | announced relaxations ${relaxCount}` : '')
    )
    if (violationCount > 0) failed = true
  }

  // ---- calibration table ---------------------------------------------------
  const buckets = bucketise(calibration, 10)
  // eslint-disable-next-line no-console
  console.log(`\n=== survival calibration (${calibration.length} samples) ===`)
  for (let b = 0; b < buckets.length; b++) {
    const bk = buckets[b]
    if (bk.n === 0) continue
    // eslint-disable-next-line no-console
    console.log(
      `  ${pct(bk.lo).padStart(4)}-${pct(bk.hi).padEnd(4)} n=${String(bk.n).padEnd(6)} predicted ${(bk.predictedMean * 100).toFixed(1)}%  empirical ${(bk.empiricalRate * 100).toFixed(1)}%  gap ${bk.absGapPts.toFixed(1)}pts`
    )
  }
  const mae = calibrationMae(buckets)
  // eslint-disable-next-line no-console
  console.log(`  weighted MAE: ${mae.toFixed(1)}pts (exit criterion < 15)`)
  if (mae >= 15) failed = true

  if (failed) {
    // eslint-disable-next-line no-console
    console.error('\nREPLAY EXIT CRITERIA FAILED')
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('\nAll replay exit criteria passed.')
}

main()
