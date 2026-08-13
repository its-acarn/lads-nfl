// Replay a completed draft through the engine.
//
// Mode A (agreement): at each of a slot's real picks, ask the engine what it
// would have done against the true board state and record whether the room
// agreed (primary / top-3 / same position).
//
// Mode B (counterfactual): the engine actually takes its primary at each of
// the slot's picks; every other roster replays its real sequence, skipping
// players the engine already took. Rosters are then scored with the same
// market values.
//
// Calibration: survival predictions at every decision point are bucketed
// against what actually happened by my next pick.

import { buildMarketFixture, marketConfig } from './marketBoard'
import { recommend } from './recommend'
import { buildState } from './state'
import { survival } from './survival'
import { roundOf, slotToRoster } from './snake'
import {
  BoardState,
  DraftConfig,
  PlayerMap,
  Position,
  Recommendation,
  ResolvedBoard,
  SimOpts,
  SleeperDraft,
  SleeperLeague,
  SleeperPick,
  SleeperTradedPick,
} from './types'

export interface ReplayFixture {
  name: string
  season: string
  league: SleeperLeague
  draft: SleeperDraft
  picks: SleeperPick[]
  tradedPicks: SleeperTradedPick[]
}

export type AgreementHit = 'primary' | 'top3' | 'position' | 'miss'

export interface AgreementRow {
  pickNo: number
  round: number
  actual: string
  actualPos: Position
  primary: string
  primaryPos: Position
  hit: AgreementHit
  forced: boolean
}

export interface AgreementResult {
  slot: number
  rows: AgreementRow[]
  primaryRate: number
  top3Rate: number
  samePosRate: number
}

export interface CounterfactualPick {
  pickNo: number
  round: number
  name: string
  pos: Position
  value: number
  forced: boolean
}

export interface CounterfactualResult {
  slot: number
  picks: CounterfactualPick[]
  myValue: number
  realValue: number
  guardrailViolations: string[]
  posCounts: Record<Position, number>
}

export interface CalibrationSample {
  predicted: number
  survived: boolean
}

interface Prepared {
  cfg: DraftConfig
  board: ResolvedBoard
  players: PlayerMap
  sorted: SleeperPick[]
  myPickNos: number[]
  userId: string
}

function prepare(fx: ReplayFixture, realPlayers: PlayerMap, slot: number): Prepared {
  if (!fx.draft.draft_order) throw new Error(`${fx.name}/${fx.season}: draft_order missing`)
  const users = Object.keys(fx.draft.draft_order)
  let userId: string | null = null
  for (let i = 0; i < users.length; i++) {
    if (fx.draft.draft_order[users[i]] === slot) userId = users[i]
  }
  let draft = fx.draft
  if (userId === null) {
    // Orphan slot (no user joined; commissioner-run team). The live engine
    // stays strict, but replay covers the slot via a synthetic user.
    userId = `replay-slot-${slot}`
    const patchedOrder: Record<string, number> = {}
    for (let i = 0; i < users.length; i++) patchedOrder[users[i]] = fx.draft.draft_order[users[i]]
    patchedOrder[userId] = slot
    draft = { ...fx.draft, draft_order: patchedOrder }
  }
  const market = buildMarketFixture(draft, fx.picks, realPlayers, userId)
  const cfg = marketConfig(draft, fx.league, fx.tradedPicks, userId)
  const sorted = fx.picks.slice().sort((a, b) => a.pick_no - b.pick_no)
  const myPickNos = buildState(cfg, [], market.board, market.players).myPickNos
  return { cfg, board: market.board, players: market.players, sorted, myPickNos, userId }
}

export function replayAgreement(
  fx: ReplayFixture,
  realPlayers: PlayerMap,
  slot: number,
  opts: SimOpts,
  collectCalibration?: CalibrationSample[]
): AgreementResult {
  const prep = prepare(fx, realPlayers, slot)
  const rows: AgreementRow[] = []
  let primaryHits = 0
  let top3Hits = 0
  let posHits = 0

  for (let i = 0; i < prep.myPickNos.length; i++) {
    const pickNo = prep.myPickNos[i]
    const feed = prep.sorted.filter((p) => p.pick_no < pickNo)
    const state = buildState(prep.cfg, feed, prep.board, prep.players)
    const rec = recommend(state, opts)
    const actualPick = prep.sorted.filter((p) => p.pick_no === pickNo)[0]
    if (!actualPick) throw new Error(`${fx.name}/${fx.season}: no actual pick at ${pickNo}`)
    const actual = prep.players[actualPick.player_id]

    const top3 = [rec.primary].concat(rec.fallbacks)
    let hit: AgreementHit = 'miss'
    if (rec.primary.player_id === actualPick.player_id) hit = 'primary'
    else if (top3.some((s) => s.player_id === actualPick.player_id)) hit = 'top3'
    else if (rec.primary.pos === actual.position) hit = 'position'
    if (hit === 'primary') primaryHits++
    if (hit === 'primary' || hit === 'top3') top3Hits++
    if (hit !== 'miss') posHits++

    rows.push({
      pickNo,
      round: roundOf(prep.cfg.draft, pickNo),
      actual: actual.full_name || actualPick.player_id,
      actualPos: actual.position,
      primary: rec.primary.name,
      primaryPos: rec.primary.pos,
      hit,
      forced: rec.forced,
    })

    // Calibration: did each candidate with a prediction survive the real
    // picks up to my next pick? (The player actually taken here is not an
    // opponent outcome, so it is excluded.)
    if (collectCalibration && state.myRemainingPickNos.length > 1) {
      const rep = survival(state, opts)
      const nextPickNo = state.myRemainingPickNos[1]
      const takenBetween: Record<string, boolean> = {}
      for (let k = 0; k < prep.sorted.length; k++) {
        const p = prep.sorted[k]
        if (p.pick_no > pickNo && p.pick_no < nextPickNo) takenBetween[p.player_id] = true
      }
      const ids = Object.keys(rep.survivalById)
      for (let k = 0; k < ids.length; k++) {
        if (ids[k] === actualPick.player_id) continue
        collectCalibration.push({ predicted: rep.survivalById[ids[k]], survived: !takenBetween[ids[k]] })
      }
    }
  }

  const n = rows.length || 1
  return {
    slot,
    rows,
    primaryRate: primaryHits / n,
    top3Rate: top3Hits / n,
    samePosRate: posHits / n,
  }
}

export function replayCounterfactual(
  fx: ReplayFixture,
  realPlayers: PlayerMap,
  slot: number,
  opts: SimOpts
): CounterfactualResult {
  const prep = prepare(fx, realPlayers, slot)
  const myRoster = slotToRoster(fx.draft, slot)
  const rules = prep.board.rules

  // Each opponent replays their own sequence, skipping engine-taken players.
  const queueByRoster: Record<number, SleeperPick[]> = {}
  for (let i = 0; i < prep.sorted.length; i++) {
    const p = prep.sorted[i]
    if (p.roster_id === null) throw new Error(`${fx.name}/${fx.season}: pick ${p.pick_no} has no roster_id`)
    if (!queueByRoster[p.roster_id]) queueByRoster[p.roster_id] = []
    queueByRoster[p.roster_id].push(p)
  }

  const taken: Record<string, boolean> = {}
  const synthetic: SleeperPick[] = []
  const myPicks: CounterfactualPick[] = []
  const violations: string[] = []
  const posCounts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  let myValue = 0
  let realValue = 0

  const valueOf: Record<string, number> = {}
  const posOf: Record<string, Position> = {}
  for (let i = 0; i < prep.board.players.length; i++) {
    const bp = prep.board.players[i]
    valueOf[bp.player_id] = 0 // filled below from a state pool snapshot
    posOf[bp.player_id] = bp.pos
  }
  const emptyState = buildState(prep.cfg, [], prep.board, prep.players)
  for (let i = 0; i < emptyState.pool.length; i++) {
    valueOf[emptyState.pool[i].player_id] = emptyState.pool[i].value
  }

  for (let i = 0; i < prep.sorted.length; i++) {
    const actual = prep.sorted[i]
    const pickNo = actual.pick_no
    const round = roundOf(prep.cfg.draft, pickNo)
    if (actual.roster_id === myRoster) {
      const state = buildState(prep.cfg, synthetic, prep.board, prep.players)
      const rec: Recommendation = recommend(state, opts)
      const chosen = rec.primary
      if (taken[chosen.player_id]) {
        violations.push(`pick ${pickNo}: engine chose already-taken ${chosen.name}`)
      }
      taken[chosen.player_id] = true
      posCounts[chosen.pos]++
      myValue += valueOf[chosen.player_id] || 0
      realValue += valueOf[actual.player_id] || 0
      myPicks.push({ pickNo, round, name: chosen.name, pos: chosen.pos, value: valueOf[chosen.player_id] || 0, forced: rec.forced })

      if (!rec.forced) {
        if (chosen.pos === 'K' && round < rules.minRoundK) violations.push(`pick ${pickNo}: K before round ${rules.minRoundK}`)
        if (chosen.pos === 'DEF' && round < rules.minRoundDEF) violations.push(`pick ${pickNo}: DEF before round ${rules.minRoundDEF}`)
      }
      if (posCounts[chosen.pos] > rules.maxByPos[chosen.pos]) {
        violations.push(`pick ${pickNo}: ${chosen.pos} over cap ${rules.maxByPos[chosen.pos]}`)
      }

      synthetic.push({
        pick_no: pickNo,
        round,
        draft_slot: slot,
        player_id: chosen.player_id,
        picked_by: prep.userId,
        roster_id: myRoster,
        is_keeper: null,
        metadata: null,
      })
    } else {
      const queue = queueByRoster[actual.roster_id!] || []
      let replacement: SleeperPick | null = null
      while (queue.length > 0) {
        const cand = queue.shift() as SleeperPick
        if (!taken[cand.player_id]) {
          replacement = cand
          break
        }
      }
      if (replacement === null) {
        // Their whole real sequence is gone (engine sniped everything left):
        // take the best remaining market player.
        for (let k = 0; k < prep.board.players.length; k++) {
          if (!taken[prep.board.players[k].player_id]) {
            replacement = {
              pick_no: pickNo,
              round,
              draft_slot: actual.draft_slot,
              player_id: prep.board.players[k].player_id,
              picked_by: actual.picked_by,
              roster_id: actual.roster_id,
              is_keeper: null,
              metadata: null,
            }
            break
          }
        }
      }
      if (replacement === null) throw new Error(`${fx.name}/${fx.season}: no replacement for pick ${pickNo}`)
      taken[replacement.player_id] = true
      synthetic.push({ ...replacement, pick_no: pickNo, round, draft_slot: actual.draft_slot, roster_id: actual.roster_id })
    }
  }

  // Legal-lineup check at the end of the counterfactual — only meaningful
  // when the draft has at least as many rounds as mandatory starter slots
  // (flexi drafts 4 rounds against 6 starters; no lineup can be legal).
  const finalState = buildState(prep.cfg, synthetic, prep.board, prep.players)
  const mandatory: [Position, number][] = [['QB', 0], ['RB', 0], ['WR', 0], ['TE', 0], ['K', 0], ['DEF', 0]]
  let mandatoryCount = 0
  for (let i = 0; i < prep.cfg.rosterPositions.length; i++) {
    const s = prep.cfg.rosterPositions[i]
    for (let m = 0; m < mandatory.length; m++) {
      if (mandatory[m][0] === s) {
        mandatory[m][1]++
        mandatoryCount++
      }
    }
  }
  if (fx.draft.settings.rounds >= mandatoryCount) {
    // Parity rule: the market pool only contains players who were actually
    // drafted, so a position can be genuinely unfillable (lads 2023 drafted
    // 8 Ks for 12 teams). The engine is held to the real roster's standard:
    // missing a starter is a violation only if the real roster filled it.
    const realCounts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
    for (let i = 0; i < prep.sorted.length; i++) {
      if (prep.sorted[i].roster_id === myRoster) {
        realCounts[prep.players[prep.sorted[i].player_id].position]++
      }
    }
    for (let m = 0; m < mandatory.length; m++) {
      const pos = mandatory[m][0]
      const required = Math.min(mandatory[m][1], realCounts[pos])
      if (finalState.myPosCounts[pos] < required) {
        violations.push(
          `final lineup: ${pos} ${finalState.myPosCounts[pos]}/${mandatory[m][1]} filled (real roster had ${realCounts[pos]})`
        )
      }
    }
  }

  return { slot, picks: myPicks, myValue, realValue, guardrailViolations: violations, posCounts }
}

export interface CalibrationBucket {
  lo: number
  hi: number
  n: number
  predictedMean: number
  empiricalRate: number
  absGapPts: number
}

export function bucketise(samples: CalibrationSample[], buckets: number): CalibrationBucket[] {
  const out: CalibrationBucket[] = []
  for (let b = 0; b < buckets; b++) {
    const lo = b / buckets
    const hi = (b + 1) / buckets
    let n = 0
    let predSum = 0
    let survived = 0
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      if (s.predicted >= lo && (s.predicted < hi || (b === buckets - 1 && s.predicted <= hi))) {
        n++
        predSum += s.predicted
        if (s.survived) survived++
      }
    }
    const predictedMean = n > 0 ? predSum / n : 0
    const empiricalRate = n > 0 ? survived / n : 0
    out.push({
      lo,
      hi,
      n,
      predictedMean,
      empiricalRate,
      absGapPts: n > 0 ? Math.abs(predictedMean - empiricalRate) * 100 : 0,
    })
  }
  return out
}

// Weighted mean absolute gap in percentage points across non-empty buckets.
export function calibrationMae(buckets: CalibrationBucket[]): number {
  let n = 0
  let weighted = 0
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].n === 0) continue
    n += buckets[i].n
    weighted += buckets[i].absGapPts * buckets[i].n
  }
  return n === 0 ? 0 : weighted / n
}
