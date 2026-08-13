// Golden transcript of the lads/2024 replay. Any engine change that shifts a
// recommendation shows up in review as a snapshot diff — deliberate changes
// update it with `npx vitest run -u`.

import { describe, expect, it } from 'vitest'
import { loadFixture, loadTrimmedPlayers } from './fixtures.testutil'
import { replayAgreement, replayCounterfactual } from './replay'
import { DEFAULT_SIM_OPTS } from './survival'
import { SimOpts } from './types'

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
