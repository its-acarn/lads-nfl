import { describe, expect, it } from 'vitest'
import { myPickNumbers, myRosterId } from '../snake'
import { Scored, SleeperPick } from '../types'
import { draftConfig } from './config'
import {
  loadBoard2025,
  loadJimmygPicks,
  loadLads2025Draft,
  loadLads2025League,
  loadLads2025Picks,
  loadLads2025TradedPicks,
  loadSheetAdp,
} from './load'
import { Decision, DecisionRequest, PipelineInputs } from './pipeline'
import { CounterfactualResult, OpponentModel, runCounterfactual } from './swap'
import { buildUniverse } from './universe'

const realFeed = loadLads2025Picks()
const draft = loadLads2025Draft()
const league = loadLads2025League()
const tradedPicks = loadLads2025TradedPicks()
const board = loadBoard2025()
const adp = loadSheetAdp()
const jimmygPicks = loadJimmygPicks()

const myPickNos = myPickNumbers(draftConfig(draft, tradedPicks, league.roster_positions, board.rules, false))
const rosterId = myRosterId(draft, board.myUserId)

function pipeline(forcedMode: boolean, sims: number): PipelineInputs {
  return {
    adp,
    jimmygPicks,
    board,
    draft,
    tradedPicks,
    rosterPositions: league.roster_positions,
    forcedMode,
    sims,
  }
}

function run(model: OpponentModel, forcedMode: boolean, sims: number): CounterfactualResult {
  return runCounterfactual({
    pipeline: pipeline(forcedMode, sims),
    realFeed,
    myPickNos,
    myRosterId: rosterId,
    model,
  })
}

const headline = run('swap', false, 2000)

describe('the swap counterfactual holds together', () => {
  it('leaves every roster with exactly 14 players', () => {
    expect(headline.invariants.everyRosterHolds14).toBe(true)
    const sizes = Object.keys(headline.invariants.rosterSizes)
    expect(sizes.length).toBe(12)
  })

  it('drafts nobody twice', () => {
    // The simultaneous credit exists to prevent exactly this: without it the
    // engine could take a player its own swap had already given away.
    expect(headline.invariants.duplicates).toEqual([])
  })

  it('differs from reality only by balanced no-partner exchanges', () => {
    // Under a pure sequence of swaps the drafted set is unchanged. It moves
    // only when the engine takes someone the room never drafted, and then it
    // moves by exactly one player in each direction.
    const inv = headline.invariants
    expect(inv.addedVsReality.length).toBe(inv.removedVsReality.length)
    const noPartner = headline.myPicks.filter((p) => p.outcome === 'no-partner').length
    expect(inv.addedVsReality.length).toBe(noPartner)
  })

  it('needed no manager to fall back', () => {
    expect(headline.fallbacks).toEqual([])
  })

  it('actually hands the displaced manager the player Andrew really took', () => {
    const byPick: Record<number, SleeperPick> = {}
    for (let i = 0; i < headline.syntheticFeed.length; i++) {
      byPick[headline.syntheticFeed[i].pick_no] = headline.syntheticFeed[i]
    }
    const swapped = headline.myPicks.filter((p) => p.outcome === 'swapped')
    expect(swapped.length).toBeGreaterThan(0)
    for (let i = 0; i < swapped.length; i++) {
      const p = swapped[i]
      const credited = byPick[p.displacedRealPickNo as number]
      expect(credited, `pick ${p.pickNo} displaced ${p.displacedRealPickNo}`).toBeTruthy()
      expect(credited.player_id).toBe(p.real.player_id)
      expect(credited.roster_id).toBe(p.displacedRosterId)
    }
  })

  it('decides all fourteen of Andrew\'s picks and no others', () => {
    expect(headline.myPicks.map((p) => p.pickNo)).toEqual(myPickNos)
  })

  it('is reproducible', () => {
    const again = run('swap', false, 2000)
    expect(JSON.stringify(again.engineRoster)).toBe(JSON.stringify(headline.engineRoster))
  })
})

describe('a run that agrees with every real pick reproduces the real draft', () => {
  it('produces a byte-identical feed', () => {
    // The strongest structural check available: if the engine wants exactly
    // what Andrew took, nothing anywhere in the walk should move.
    const universe = buildUniverse({ adp, ladsPicks: realFeed, jimmygPicks })
    const realByPick: Record<number, SleeperPick> = {}
    for (let i = 0; i < realFeed.length; i++) realByPick[realFeed[i].pick_no] = realFeed[i]

    const alwaysReal = (_inputs: PipelineInputs, req: DecisionRequest): Decision => {
      const pick = realByPick[req.pickNo]
      const p = universe.players[pick.player_id]
      const primary: Scored = {
        player_id: pick.player_id,
        name: p ? p.full_name || pick.player_id : pick.player_id,
        pos: p ? p.position : 'RB',
        team: p ? p.team : null,
        value: 0,
        offBoard: false,
        score: 0,
        survivalToNextPct: null,
        rationale: [],
      }
      return {
        pickNo: req.pickNo,
        reachScale: 1,
        universe,
        recommendation: { pickNo: req.pickNo, round: 1, forced: false, primary, fallbacks: [], rationale: [] },
      }
    }

    const identical = runCounterfactual({
      pipeline: pipeline(false, 50),
      realFeed,
      myPickNos,
      myRosterId: rosterId,
      model: 'swap',
      decide: alwaysReal,
    })

    expect(identical.myPicks.every((p) => p.outcome === 'agreed')).toBe(true)
    expect(identical.invariants.addedVsReality).toEqual([])
    expect(identical.invariants.removedVsReality).toEqual([])
    expect(JSON.stringify(identical.syntheticFeed)).toBe(JSON.stringify(realFeed))
  })
})

describe('the cascade model, kept as a sensitivity check', () => {
  const cascade = run('cascade', false, 300)

  it('also fills every roster without duplicates', () => {
    expect(cascade.invariants.duplicates).toEqual([])
    expect(cascade.invariants.everyRosterHolds14).toBe(true)
  })
})

describe('a displaced manager who cannot be paid back still drafts', () => {
  it('leaves no hole in the feed', () => {
    // Regression. The swap can fail to pay a manager back: the engine takes
    // their player, and the player they were owed in exchange had already gone
    // to the engine at an earlier pick. The old code skipped that pick
    // entirely, leaving a gap in the feed — which then put a later pick number
    // on the clock and broke the rest of the walk with a misleading error.
    //
    // Reproduced by promoting a late-ADP player to tier 2, which makes the
    // engine reach far enough for the chain to occur.
    const spears = board.players.filter((p) => p.name === 'Tyjae Spears')[0]
    expect(spears, 'fixture should contain Tyjae Spears').toBeTruthy()
    const promoted = {
      ...board,
      players: board.players.map((p) => (p.player_id === spears.player_id ? { ...p, tier: 2 } : p)),
      rules: { ...board.rules, useRosterNeed: false, useForcedStarters: true, vonaFromRound: 3 },
    }

    const r = runCounterfactual({
      pipeline: { ...pipeline(false, 500), board: promoted },
      realFeed,
      myPickNos,
      myRosterId: rosterId,
      model: 'swap',
    })

    const seen: Record<number, boolean> = {}
    for (let i = 0; i < r.syntheticFeed.length; i++) seen[r.syntheticFeed[i].pick_no] = true
    const missing: number[] = []
    for (let n = 1; n <= realFeed.length; n++) if (!seen[n]) missing.push(n)
    expect(missing, 'every pick number must be filled').toEqual([])
    expect(r.invariants.everyRosterHolds14).toBe(true)
    expect(r.invariants.duplicates).toEqual([])
    // The situation did occur, so the test is exercising the path it targets.
    expect(r.fallbacks.length).toBeGreaterThan(0)
  })
})
