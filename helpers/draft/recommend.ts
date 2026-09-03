// The decision rule behind every instruction:
//   score(p) = (V(p) − E[best V at pos(p) at my next pick]) × need(pos(p))
// over the guardrail-filtered candidate set, with pins and forced mode on
// top. Position-best candidates always have edge ≥ 0 (the pool only
// shrinks), so cross-position comparison is anchored by non-negative edges.

import { computeNeeds, forcedPositions, isForcedMode, parseLineup } from './needs'
import { roundOf } from './snake'
import { survival } from './survival'
import { BoardState, PoolPlayer, Position, Recommendation, Scored, SimOpts } from './types'

// Injury designations that keep a player out of the candidate set before
// board.rules.stashRound.
const STASH_INJURY = ['Out', 'IR', 'PUP', 'Sus', 'COV', 'DNR', 'NA']
const STASH_STATUS = [
  'Injured Reserve',
  'Physically Unable to Perform',
  'Non Football Injury',
  'Suspended',
  'Inactive',
]

function isStashOnly(p: PoolPlayer): boolean {
  if (p.injuryStatus && STASH_INJURY.indexOf(p.injuryStatus) !== -1) return true
  if (p.status && STASH_STATUS.indexOf(p.status) !== -1) return true
  return false
}

function toScored(p: PoolPlayer, score: number, survivalPct: number | null, rationale: string[]): Scored {
  return {
    player_id: p.player_id,
    name: p.name,
    pos: p.pos,
    team: p.team,
    value: Math.round(p.value * 10) / 10,
    offBoard: p.offBoard,
    score: Math.round(score * 100) / 100,
    survivalToNextPct: survivalPct === null ? null : Math.round(survivalPct * 100),
    rationale,
  }
}

export function recommend(state: BoardState, opts: SimOpts): Recommendation {
  if (state.myRemainingPickNos.length === 0) {
    throw new Error('recommend: no remaining picks for my roster')
  }
  const pickNo = state.myRemainingPickNos[0]
  const round = roundOf(state.cfg.draft, pickNo)
  const rules = state.board.rules

  // Two behaviours the drafter can switch off entirely. Both default on.
  const useNeed = rules.useRosterNeed !== false
  const useForced = rules.useForcedStarters !== false

  const shape = parseLineup(state.cfg.rosterPositions)
  const needs = computeNeeds(state.myPosCounts, shape, rules)
  let forced = useForced && isForcedMode(state.myRemainingPickNos.length, needs)
  let forcedSet: Position[] = forced ? forcedPositions(needs) : []

  const globalRationale: string[] = []
  if (forced) {
    globalRationale.push(
      `forced mode: ${state.myRemainingPickNos.length} pick(s) left for ${needs.unfilledMandatoryCount} unfilled starter slot(s) (${forcedSet.join(', ')})`
    )
  }

  // Schedule-forced: my raw pick count may cover the unfilled starters, but
  // only the picks that land BEFORE a position's supply runs out actually
  // count for it. Supply horizon per position ~ the worst ADP among its
  // remaining players (in a market replay that IS the pick number where the
  // last one goes; live it is the usual rooms-draft-near-ADP approximation).
  // When the union of still-viable picks is no bigger than the number of
  // unfilled starter slots, collapse now instead of at the last pick.
  if (useForced && !forced && needs.unfilledMandatoryCount > 0) {
    const unfilled = forcedPositions(needs)
    const viableUnion: Record<number, boolean> = {}
    for (let u = 0; u < unfilled.length; u++) {
      let horizon = 0
      for (let i = 0; i < state.pool.length; i++) {
        const p = state.pool[i]
        if (p.pos === unfilled[u] && p.searchRank > horizon && p.searchRank < 1000000) {
          horizon = p.searchRank
        }
      }
      for (let n = 0; n < state.myRemainingPickNos.length; n++) {
        if (state.myRemainingPickNos[n] <= horizon) viableUnion[state.myRemainingPickNos[n]] = true
      }
    }
    if (Object.keys(viableUnion).length <= needs.unfilledMandatoryCount) {
      forced = true
      forcedSet = unfilled
      globalRationale.push(
        `forced by scarcity schedule: only ${Object.keys(viableUnion).length} viable pick(s) left for ${needs.unfilledMandatoryCount} unfilled starter slot(s) (${forcedSet.join(', ')})`
      )
    }
  }

  // ---- survival: the scoring input, and nothing else ----------------------
  // It used to feed a scarcity override that could waive a round floor. It no
  // longer does; see the guardrail note below.
  const report = survival(state, opts)

  // Round floors. ABSOLUTE: no code path may breach one.
  //
  // The floor is not a workaround for an untiered column, which is how it was
  // read once and read wrongly. Andrew streams quarterbacks: they are
  // abundant, weekly matchups matter more than the name on the roster, and
  // spending an early pick on one is precisely the mistake `minRoundByPos.QB`
  // exists to prevent. An override does not rescue him from a bad outcome, it
  // imposes a strategy he rejected.
  //
  // The scarcity override that used to sit here waived a floor when an
  // unfilled mandatory position was down to five players and predicted extinct
  // by the next pick. Against a floor of 11 in a 14-round draft there are
  // still four rounds left to take one, so the catastrophe it guarded against
  // barely exists — while the case it caused, spending pick 101 on a
  // quarterback, destroys the strategy outright. Where the risks are that
  // asymmetric, the constraint wins (D7).
  const minRoundByPos = rules.minRoundByPos || {}

  // ---- guardrails ---------------------------------------------------------
  // Applied in layers so that when no legal candidate exists the engine gives
  // up the CHEAPEST rule first and says which one. It used to drop every
  // guardrail at once and report only "guardrails relaxed", so a breached
  // position cap looked identical to a healthy pick -- and the replay corpus
  // under the live rules produced seven of them, all at the final picks, with
  // nothing in the output to explain them.
  // Round floors are NOT in this list. The engine gives up the stash rule,
  // then the forced collapse, then finally position caps — but never a floor.
  interface Relaxation {
    stash: boolean
    quota: boolean
    collapse: boolean
    stacks: boolean
    caps: boolean
  }

  // ---- positional quotas -------------------------------------------------
  // "Three running backs by the end of round six." Binds just in time: while
  // enough picks remain inside the window to settle the debt later, this adds
  // nothing and the board decides. See BoardRules.minCountByRound.
  const minCountByRound = rules.minCountByRound || {}
  const quotaSet: Position[] = []
  const quotaPositions = Object.keys(minCountByRound) as Position[]
  for (let i = 0; i < quotaPositions.length; i++) {
    const pos = quotaPositions[i]
    const quota = minCountByRound[pos]
    if (quota === undefined) continue
    const owed = quota.count - (state.myPosCounts[pos] || 0)
    if (owed <= 0) continue
    // `byRound` is inclusive, so a pick IN that round still counts toward
    // paying the debt.
    let picksLeftInWindow = 0
    for (let n = 0; n < state.myRemainingPickNos.length; n++) {
      if (roundOf(state.cfg.draft, state.myRemainingPickNos[n]) <= quota.byRound) picksLeftInWindow++
    }
    // The window has closed. The rule stops applying, the same way a round
    // floor stops mattering once its round arrives -- and saying so on every
    // one of the remaining picks would be noise, not information.
    if (picksLeftInWindow === 0) continue
    // More owed than picks left to pay with: a bot attached mid-draft, or a run
    // of overrides. Stand down and put it on the record. Unlike a floor this is
    // a claim about picks already spent, and refusing to recommend anything
    // does not get them back.
    if (owed > picksLeftInWindow) {
      globalRationale.push(
        `quota: ${quota.count} ${pos} by end of round ${quota.byRound} can no longer be met — ` +
          `${owed} owed with ${picksLeftInWindow} pick(s) left in the window`
      )
      continue
    }
    // Equality, given the branch above. Written as >= so that reordering these
    // guards cannot silently turn a missed deadline into a free pass.
    if (owed >= picksLeftInWindow) {
      quotaSet.push(pos)
      globalRationale.push(
        `quota: ${owed} more ${pos} owed by end of round ${quota.byRound}, ` +
          `${picksLeftInWindow} pick(s) left in that window`
      )
    }
  }

  const maxPerNflTeamByPos = rules.maxPerNflTeamByPos || {}

  // ---- positional ceilings -------------------------------------------------
  // "At most three running backs through round six." The mirror of the quota
  // and, unlike it, a prohibition: it only ever removes candidates, so taking
  // someone else always satisfies it and it cannot starve another rule. Beside
  // RB 3 by round 5 the pair pins the first six rounds at exactly three backs.
  // Relaxed with the position caps -- it is one.
  const maxCountByRound = rules.maxCountByRound || {}
  const ceilingHit = (pos: Position): boolean => {
    const c = maxCountByRound[pos]
    return c !== undefined && round <= c.byRound && (state.myPosCounts[pos] || 0) >= c.count
  }
  const ceilingPositions = Object.keys(maxCountByRound) as Position[]
  for (let i = 0; i < ceilingPositions.length; i++) {
    const c = maxCountByRound[ceilingPositions[i]]
    if (c !== undefined && ceilingHit(ceilingPositions[i])) {
      globalRationale.push(`ceiling: at most ${c.count} ${ceilingPositions[i]} through round ${c.byRound}, already held`)
    }
  }

  const filterPool = (relax: Relaxation): PoolPlayer[] => {
    const out: PoolPlayer[] = []
    for (let i = 0; i < state.pool.length; i++) {
      const p = state.pool[i]
      if (state.board.doNotDraftIds.indexOf(p.player_id) !== -1) continue
      if (!relax.caps && (state.myPosCounts[p.pos] || 0) >= rules.maxByPos[p.pos]) continue
      if (!relax.caps && ceilingHit(p.pos)) continue
      // One per NFL team at this position. A null team is a free agent and
      // shares a backfield with nobody, so it constrains nothing.
      if (!relax.stacks && p.team) {
        const perTeam = maxPerNflTeamByPos[p.pos]
        const held = (state.myTeamCountsByPos[p.pos] || {})[p.team] || 0
        if (perTeam !== undefined && held >= perTeam) continue
      }
      // Applied unconditionally, and BEFORE the forced-set test. It used to sit
      // in an `else if` on that test, so whenever forced mode was active the
      // floor was not consulted at all — a second, quieter breach path than the
      // scarcity override, and the one that actually fired in the rehearsal.
      const floor = minRoundByPos[p.pos]
      if (floor !== undefined && round < floor) continue
      if (!relax.quota && quotaSet.length > 0 && quotaSet.indexOf(p.pos) === -1) continue
      if (forced && !relax.collapse && forcedSet.indexOf(p.pos) === -1) continue
      if (!relax.stash && round < rules.stashRound && isStashOnly(p)) continue
      out.push(p)
    }
    return out
  }

  const levels: { relax: Relaxation; gaveUp: string | null }[] = [
    { relax: { stash: false, quota: false, collapse: false, stacks: false, caps: false }, gaveUp: null },
    { relax: { stash: true, quota: false, collapse: false, stacks: false, caps: false }, gaveUp: 'the stash rule' },
    { relax: { stash: true, quota: false, collapse: true, stacks: false, caps: false }, gaveUp: 'the stash rule and the forced collapse' },
    // One per NFL team goes before position caps: it is a correlation
    // preference, where a cap is a decision about roster shape.
    {
      relax: { stash: true, quota: false, collapse: true, stacks: true, caps: false },
      gaveUp: 'the stash rule, the forced collapse and one per NFL team',
    },
    {
      relax: { stash: true, quota: false, collapse: true, stacks: true, caps: true },
      gaveUp: 'the stash rule, the forced collapse, one per NFL team and your position caps',
    },
    // The quota is the last thing given up -- it is the only rule here Andrew
    // stated as a "must". By this rung the forced collapse has already been
    // released two levels earlier, so the one conflict that could empty the
    // candidate set (a quota and a forced starter demanding disjoint
    // positions) resolves without the quota ever yielding.
    {
      relax: { stash: true, quota: true, collapse: true, stacks: true, caps: true },
      gaveUp: 'every rule including your position quota',
    },
  ]

  let candidates: PoolPlayer[] = []
  let relaxed = false
  for (let l = 0; l < levels.length; l++) {
    candidates = filterPool(levels[l].relax)
    if (candidates.length > 0) {
      if (levels[l].gaveUp !== null) {
        relaxed = true
        globalRationale.push(`no legal candidate — gave up ${levels[l].gaveUp}`)
      }
      break
    }
  }
  if (candidates.length === 0) {
    // Every remaining player is behind a round floor. Saying so loudly is the
    // point: quietly breaching one would destroy the strategy the floor
    // encodes, and the only way past a floor is to edit config/board.json.
    const blocked: string[] = []
    const floored = Object.keys(minRoundByPos) as Position[]
    for (let i = 0; i < floored.length; i++) {
      const f = minRoundByPos[floored[i]]
      if (f !== undefined && round < f) blocked.push(`${floored[i]} (floor round ${f})`)
    }
    throw new Error(
      `recommend: no candidate at pick ${pickNo} (round ${round}) that does not breach a round floor. ` +
        `Floors are absolute and were not relaxed. Blocked positions: ${blocked.join(', ') || 'none'}. ` +
        'Lower the floor in config/board.json if this is genuinely what you want.'
    )
  }

  candidates = candidates.slice(0, opts.candidateLimit)

  // ---- scoring ------------------------------------------------------------
  // Two regimes. Early on the board wins outright: take the highest-ranked
  // player still available and let scarcity wait. From `vonaFromRound` the
  // scarcity rule takes over.
  //
  // The gate exists because the two cannot simply be blended. Within a tier the
  // ordering term is worth hundredths of a point while a positional-scarcity
  // edge is worth several, so any weighting that lets the board's order compete
  // late would have to be large enough to invert the tier plateaus themselves —
  // a mid-tier-1 player would price below a top-tier-2 one and the board would
  // stop being a board.
  const vonaFrom = rules.vonaFromRound === undefined ? 1 : rules.vonaFromRound
  const boardOrderPhase = round < vonaFrom
  if (boardOrderPhase) {
    globalRationale.push(
      `board order (round ${round} < ${vonaFrom}): taking the highest-ranked player available, scarcity ignored`
    )
  }

  const scored: { p: PoolPlayer; score: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]
    const expectedBest = report.myNextPickNo === null ? 0 : report.expectedBestValueByPos[p.pos]
    const edge = p.value - expectedBest
    // With roster need switched off every eligible position weighs the same,
    // so the pick turns purely on board value and scarcity. Caps and round
    // floors still apply; they are filters, not weights.
    const need = useNeed ? Math.max(needs.weights[p.pos], relaxed ? 0.05 : 0) : 1
    // Position caps are enforced by the guardrail filter above, and a need
    // weight only reaches zero when a position is capped, so straight board
    // value cannot pick an ineligible player here.
    scored.push({ p, score: boardOrderPhase ? p.value : edge * need })
  }
  scored.sort(
    (a, b) => b.score - a.score || b.p.value - a.p.value || (a.p.player_id < b.p.player_id ? -1 : 1)
  )

  // ---- pins override in their round window --------------------------------
  // Resolved against the guardrail-filtered candidates, not the raw pool, so a
  // pin still respects
  // do-not-draft, position caps, round floors and the stash rule. Scanning the
  // pool directly meant a pin overrode every guardrail except the cap.
  //
  // And a pin never overrides forced mode: the collapse exists to stop the
  // drafter finishing with a mandatory starter slot empty, which is exactly
  // what a late-window pin used to be able to cause.
  let pinned: PoolPlayer | null = null
  if (forced && state.board.pins.length > 0) {
    for (let i = 0; i < state.board.pins.length; i++) {
      const pin = state.board.pins[i]
      if (round >= pin.fromRound && round <= pin.toRound) {
        globalRationale.push('pin skipped: forced mode is filling mandatory starter slots')
        break
      }
    }
  } else {
    for (let i = 0; i < state.board.pins.length; i++) {
      const pin = state.board.pins[i]
      if (round < pin.fromRound || round > pin.toRound) continue
      for (let j = 0; j < candidates.length; j++) {
        const p = candidates[j]
        if (p.player_id !== pin.player_id) continue
        if (pinned === null || p.value > pinned.value) pinned = p
        break
      }
    }
  }

  const rationaleFor = (p: PoolPlayer, score: number): string[] => {
    const r: string[] = []
    // In the board-order phase the ranking IS the reason, so lead with it. The
    // scarcity figures below are still printed as context, but they did not
    // decide this pick and the rationale should not imply they did.
    if (boardOrderPhase && p.boardRank !== null) r.push(`your board rank ${p.boardRank}`)
    if (p.tier !== null) {
      let leftInTier = 0
      for (let i = 0; i < state.pool.length; i++) {
        if (state.pool[i].pos === p.pos && state.pool[i].tier === p.tier) leftInTier++
      }
      r.push(`${leftInTier} left in ${p.pos} T${p.tier}`)
    } else {
      r.push('off-board (ADP interpolation)')
    }
    const surv = report.survivalById[p.player_id]
    if (report.myNextPickNo !== null && surv !== undefined) {
      r.push(`${Math.round(surv * 100)}% survives to pick ${report.myNextPickNo}`)
    }
    const expectedBest = report.myNextPickNo === null ? 0 : report.expectedBestValueByPos[p.pos]
    if (report.myNextPickNo !== null) {
      r.push(`edge vs next pick ${(p.value - expectedBest) >= 0 ? '+' : ''}${(p.value - expectedBest).toFixed(1)}`)
    }
    // Only claim roster need influenced the pick when it actually did.
    if (useNeed) {
      if (needs.unfilledMandatory[p.pos] > 0) r.push(`fills ${p.pos} starter slot`)
      else if (needs.weights[p.pos] === 0.75) r.push('fills flex')
      else r.push(`bench depth (need ${needs.weights[p.pos].toFixed(2)})`)
    }
    if (score !== undefined) r.push(boardOrderPhase ? `board value ${score.toFixed(2)}` : `score ${score.toFixed(2)}`)
    return r
  }

  const survFor = (p: PoolPlayer): number | null => {
    const s = report.survivalById[p.player_id]
    return report.myNextPickNo === null ? null : s !== undefined ? s : null
  }

  let primary: Scored
  let rest: { p: PoolPlayer; score: number }[]
  if (pinned !== null) {
    const pinScore = scored.filter((s) => s.p.player_id === pinned!.player_id)
    const score = pinScore.length > 0 ? pinScore[0].score : 0
    const r = rationaleFor(pinned, score)
    r.unshift(`pinned for rounds (board pin)`)
    primary = toScored(pinned, score, survFor(pinned), r)
    rest = scored.filter((s) => s.p.player_id !== pinned!.player_id)
  } else {
    if (scored.length === 0) throw new Error('recommend: empty candidate set even after relaxing guardrails')
    primary = toScored(scored[0].p, scored[0].score, survFor(scored[0].p), rationaleFor(scored[0].p, scored[0].score))
    rest = scored.slice(1)
  }

  // Fallbacks: next two by score; when the top three are effectively tied and
  // share a position, swap the second fallback for the best other-position
  // candidate so the relay always has a cross-position out.
  const fallbacks: Scored[] = []
  for (let i = 0; i < rest.length && fallbacks.length < 2; i++) {
    fallbacks.push(toScored(rest[i].p, rest[i].score, survFor(rest[i].p), rationaleFor(rest[i].p, rest[i].score)))
  }
  if (fallbacks.length === 2) {
    const samePos = primary.pos === fallbacks[0].pos && primary.pos === fallbacks[1].pos
    const spread = Math.abs(primary.score - fallbacks[1].score)
    const tied = spread <= 0.05 * Math.max(Math.abs(primary.score), 1)
    if (samePos && tied) {
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].p.pos !== primary.pos) {
          fallbacks[1] = toScored(rest[i].p, rest[i].score, survFor(rest[i].p), rationaleFor(rest[i].p, rest[i].score))
          fallbacks[1].rationale.push('position diversity (top three tied)')
          break
        }
      }
    }
  }

  return {
    pickNo,
    round,
    forced,
    primary,
    fallbacks,
    rationale: globalRationale,
  }
}
