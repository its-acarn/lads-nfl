// Golden transcript of the lads/2024 replay. Any engine change that shifts a
// recommendation shows up in review as a snapshot diff — deliberate changes
// update it with `npx vitest run -u`.

import { describe, expect, it } from 'vitest'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { replayAgreement, replayCounterfactual } from './replay'
import { DEFAULT_SIM_OPTS } from './survival'
import { BoardRules, SimOpts } from './types'
import * as fs from 'fs'
import * as path from 'path'

// Lifted from config/board.json so the golden cannot drift from what ships.
function liveRulesOverlay(): Partial<BoardRules> {
  const board = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'board.json'), 'utf8')
  ) as { rules: Record<string, unknown> }
  const overlay: Partial<BoardRules> = {}
  const keys = ['maxByPos', 'minRoundByPos', 'stashRound', 'offBoardDiscount', 'vonaFromRound', 'useRosterNeed', 'useForcedStarters', 'needWeights', 'value']
  for (let i = 0; i < keys.length; i++) {
    if (board.rules[keys[i]] !== undefined) (overlay as Record<string, unknown>)[keys[i]] = board.rules[keys[i]]
  }
  return overlay
}

const GOLDEN_OPTS: SimOpts = { ...DEFAULT_SIM_OPTS, sims: 500 }

describe('golden replay transcript: lads/2024 slot 1', () => {
  const fx = loadFixture('lads', '2024')
  const players = loadTrimmedPlayers()

  it('agreement transcript is stable', () => {
    const result = replayAgreement(fx, players, 1, GOLDEN_OPTS)
    const lines = result.rows.map(
      (r) =>
        `pick ${String(r.pickNo).padStart(3)} R${String(r.round).padStart(2)} ` +
        `actual: ${r.actualPos} ${r.actual} | engine: ${r.primaryPos} ${r.primary}` +
        `${r.forced ? ' [forced]' : ''} -> ${r.hit}`
    )
    lines.push(
      `rates: primary ${(result.primaryRate * 100).toFixed(0)}% top3 ${(result.top3Rate * 100).toFixed(0)}% pos ${(result.samePosRate * 100).toFixed(0)}%`
    )
    expect(lines.join('\n')).toMatchSnapshot()
  })

  it('counterfactual transcript is stable and beats the real roster', () => {
    const result = replayCounterfactual(fx, players, 1, GOLDEN_OPTS)
    expect(result.guardrailViolations).toEqual([])
    expect(result.myValue).toBeGreaterThanOrEqual(result.realValue)
    const lines = result.picks.map(
      (p) =>
        `pick ${String(p.pickNo).padStart(3)} R${String(p.round).padStart(2)} ${p.pos} ${p.name} ` +
        `(${p.value.toFixed(1)})${p.forced ? ' [forced]' : ''}`
    )
    lines.push(`value: engine ${result.myValue.toFixed(1)} vs real ${result.realValue.toFixed(1)}`)
    expect(lines.join('\n')).toMatchSnapshot()
  })
})

// The same fixture under the rules the LIVE bot will run with, rather than
// marketRules. Until this existed the entire replay corpus — golden snapshot
// included — described an engine configuration that will never run: none of
// vonaFromRound, useRosterNeed, useForcedStarters, minRoundByPos or the real
// position caps were set anywhere in it.
describe('golden replay transcript: lads/2024 slot 1, LIVE rules', () => {
  const fx = loadFixture('lads', '2024')
  const players = loadTrimmedPlayers()
  const liveRules = liveRulesOverlay()

  it('agreement transcript is stable under the shipping configuration', () => {
    const result = replayAgreement(fx, players, 1, GOLDEN_OPTS, undefined, liveRules)
    const lines = result.rows.map(
      (r) =>
        `pick ${String(r.pickNo).padStart(3)} R${String(r.round).padStart(2)} ` +
        `actual: ${r.actualPos} ${r.actual} | engine: ${r.primaryPos} ${r.primary}` +
        `${r.forced ? ' [forced]' : ''} -> ${r.hit}`
    )
    expect(lines.join('\n')).toMatchSnapshot()
  })

  it('breaks no guardrail it did not announce', () => {
    // Zero unannounced violations is the bar. An announced relaxation means
    // the configuration was unsatisfiable against this pool and the engine
    // said so, which is a reportable outcome rather than a fault.
    for (let slot = 1; slot <= 12; slot++) {
      const cf = replayCounterfactual(fx, players, slot, GOLDEN_OPTS, liveRules)
      expect(cf.guardrailViolations, `slot ${slot}`).toEqual([])
    }
  })
})
