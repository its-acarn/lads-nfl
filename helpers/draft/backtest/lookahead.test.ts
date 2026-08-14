// PROOF that the engine cannot see the future — not an assertion that it
// doesn't.
//
// The method: permute the players occupying every pick from the decision point
// onward, rebuild the entire pipeline from that permuted feed, and require the
// recommendation to come out byte for byte identical. Picks before the
// decision point are untouched, so a hindsight-free engine cannot notice the
// difference. Anything that reads the future — an ADP prior derived from
// realized pick order, a pool built from who got drafted — shifts, and the
// comparison fails.
//
// A test that cannot fail proves nothing, so the same check is applied to a
// DELIBERATELY LEAKY pipeline whose ADP is the realized pick order, exactly
// reproducing the leak in the existing replay harness
// (helpers/draft/marketBoard.ts:67). That control must fail. If it ever starts
// passing, this file has stopped testing anything and the real proof above is
// worthless.

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { myPickNumbers } from '../snake'
import { SleeperPick } from '../types'
import { ANDREW_SLOT_2025, draftConfig } from './config'
import {
  loadBoard2025,
  loadJimmygPicks,
  loadLads2025Draft,
  loadLads2025League,
  loadLads2025Picks,
  loadLads2025TradedPicks,
  loadSheetAdp,
} from './load'
import { decideAt, PipelineInputs } from './pipeline'
import { SheetAdpEntry } from './types'

const SEED = 987654321
const SIMS = 200 // determinism does not depend on sim count; fewer is faster

const feed = loadLads2025Picks()
const draft = loadLads2025Draft()
const league = loadLads2025League()
const tradedPicks = loadLads2025TradedPicks()
const board = loadBoard2025()
const adp = loadSheetAdp()
const jimmygPicks = loadJimmygPicks()

const inputs: PipelineInputs = {
  adp,
  jimmygPicks,
  board,
  draft,
  tradedPicks,
  rosterPositions: league.roster_positions,
  forcedMode: false,
  sims: SIMS,
}

const myPicks = myPickNumbers(draftConfig(draft, tradedPicks, league.roster_positions, false))

// Reassign which player sits in each pick at or after `pickNo`, keeping the
// slots themselves — pick_no, round, draft_slot, roster_id — exactly as they
// were. Metadata travels with its player so draft-day attributes are
// unchanged; only the arrangement of the future differs.
function permuteFrom(picks: SleeperPick[], pickNo: number, seed: number): SleeperPick[] {
  const before: SleeperPick[] = []
  const after: SleeperPick[] = []
  for (let i = 0; i < picks.length; i++) {
    if (picks[i].pick_no < pickNo) before.push(picks[i])
    else after.push(picks[i])
  }
  const occupants = after.map((p) => ({ player_id: p.player_id, metadata: p.metadata }))
  const rng = mulberry32(seed)
  for (let i = occupants.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = occupants[i]
    occupants[i] = occupants[j]
    occupants[j] = tmp
  }
  const shuffled: SleeperPick[] = []
  for (let i = 0; i < after.length; i++) {
    shuffled.push({
      pick_no: after[i].pick_no,
      round: after[i].round,
      draft_slot: after[i].draft_slot,
      player_id: occupants[i].player_id,
      picked_by: after[i].picked_by,
      roster_id: after[i].roster_id,
      is_keeper: after[i].is_keeper,
      metadata: occupants[i].metadata,
    })
  }
  return before.concat(shuffled)
}

// The leak in the existing replay harness, reproduced exactly: every player's
// ADP becomes the pick number at which they were actually taken, so the
// opponent simulator knows precisely when each name comes off the board.
function leakyAdpFrom(picks: SleeperPick[], base: SheetAdpEntry[]): SheetAdpEntry[] {
  const pickNoById: Record<string, number> = {}
  for (let i = 0; i < picks.length; i++) pickNoById[picks[i].player_id] = picks[i].pick_no
  const out: SheetAdpEntry[] = []
  for (let i = 0; i < base.length; i++) {
    const e = base[i]
    const realized = pickNoById[e.player_id]
    out.push({
      player_id: e.player_id,
      name: e.name,
      pos: e.pos,
      team: e.team,
      rank: e.rank,
      sleeper: realized !== undefined ? realized : 1000 + e.rank,
    })
  }
  return out
}

function fingerprint(pickNo: number, feedForRun: SleeperPick[], adpForRun: SheetAdpEntry[]): string {
  const run: PipelineInputs = {
    adp: adpForRun,
    jimmygPicks,
    board,
    draft,
    tradedPicks,
    rosterPositions: league.roster_positions,
    forcedMode: false,
    sims: SIMS,
  }
  // Both roles get the same feed here on purpose: the permutation must reach
  // every artifact, or the check tests nothing.
  return JSON.stringify(
    decideAt(run, { attributeFeed: feedForRun, stateFeed: feedForRun, pickNo }).recommendation
  )
}

describe('Andrew held 14 picks in the 2025 draft', () => {
  it('computes them from the draft order, at slot 2', () => {
    expect(draft.draft_order![board.myUserId]).toBe(ANDREW_SLOT_2025)
    expect(myPicks).toEqual([2, 23, 26, 47, 50, 71, 74, 95, 98, 119, 122, 143, 146, 167])
  })
})

describe('the engine cannot see the future', () => {
  for (let i = 0; i < myPicks.length; i++) {
    const pickNo = myPicks[i]
    it(`pick ${pickNo}: scrambling every later pick leaves the recommendation identical`, () => {
      const scrambled = permuteFrom(feed, pickNo, SEED + pickNo)

      // Guard against a silently empty test: the future must actually differ.
      // Only the very last pick has nothing after it to rearrange.
      if (pickNo !== myPicks[myPicks.length - 1]) {
        expect(JSON.stringify(scrambled)).not.toBe(JSON.stringify(feed))
      }
      // ...while everything the engine is allowed to see is untouched.
      const visibleReal = feed.filter((p) => p.pick_no < pickNo)
      const visibleScrambled = scrambled.filter((p) => p.pick_no < pickNo)
      expect(JSON.stringify(visibleScrambled)).toBe(JSON.stringify(visibleReal))

      expect(fingerprint(pickNo, scrambled, adp)).toBe(fingerprint(pickNo, feed, adp))
    })
  }
})

describe('the proof can fail — control against a deliberately leaky prior', () => {
  it('detects an ADP built from realized pick order at every pick that has a future', () => {
    // This is helpers/draft/marketBoard.ts:67 reproduced. If the check above
    // passes for this too, it is not testing anything.
    //
    // Every pick must be caught except the last, where there is nothing after
    // the decision point to rearrange and so no leak can express itself. The
    // measured result is 13 of 14.
    const diverged: number[] = []
    for (let i = 0; i < myPicks.length; i++) {
      const pickNo = myPicks[i]
      const scrambled = permuteFrom(feed, pickNo, SEED + pickNo)
      const honest = fingerprint(pickNo, feed, leakyAdpFrom(feed, adp))
      const shuffled = fingerprint(pickNo, scrambled, leakyAdpFrom(scrambled, adp))
      if (honest !== shuffled) diverged.push(pickNo)
    }
    expect(diverged.length, `caught at picks ${diverged.join(', ')}`).toBe(myPicks.length - 1)
    expect(diverged).not.toContain(myPicks[myPicks.length - 1])
  })
})
