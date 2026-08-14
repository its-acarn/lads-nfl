// How the backtest configures the engine, and why.
//
// The engine is used exactly as the live bot will use it -- no forks, no extra
// flags. Everything that differs between the two runs is an ENGINE INPUT:
// the lineup shape and the position caps. That keeps the backtest testing the
// code that will actually ship.

import { BoardRules, DraftConfig, SimOpts, SleeperDraft, SleeperTradedPick } from '../types'
import { effectiveLineup } from '../needs'
import { DEFAULT_SIM_OPTS } from '../survival'

export const ANDREW_USER_ID = '82919512949014528'

// Andrew's slot in the 2025 lads draft. Recorded because it is easy to assume
// it matches his 2026 slot, which is 5 -- it does not.
export const ANDREW_SLOT_2025 = 2

// The reference displacement the live bot uses for reach calibration
// (DEFAULT_BOT_OPTIONS.reachReference in bot.ts). Carried over unchanged so
// the backtest exercises the shipping configuration rather than a tuned one.
export const REACH_REFERENCE = 6

// "Forced mode off" is not a switch the engine has, and faking it by zeroing
// the K and DEF caps alone is actively harmful: the league lineup lists both as
// dedicated starters, so unfilledMandatoryCount never drops below two,
// isForcedMode fires on the last two picks, the candidate set collapses to K
// and DEF, the cap guardrail then rejects every one of them, and recommend()
// falls through to its relax-everything path -- two arbitrary picks exactly
// where the comparison matters most.
//
// The honest mechanism is to hand the engine a lineup in which those slots are
// bench instead, so no mandatory K or DEF slot ever exists. Andrew's board
// omits both, his real 2025 roster had neither, and a third of this league
// drafts no kicker in a given year, so this is what his season actually looked
// like. The live bot needs the same configuration before September.
// Derived from the caps rather than toggled separately, so there is one source
// of truth: a position capped at zero loses its starter slot. Forced mode is
// then nothing more than raising the K and DEF caps back to one, which restores
// their slots automatically.
export function lineupFor(rosterPositions: string[], rules: BoardRules): string[] {
  return effectiveLineup(rosterPositions, rules)
}

// With forced mode on, kickers and defenses become draftable again. They stay
// off the board -- Andrew never tiered them -- so the engine values them by
// interpolating their ADP onto the board's value curve, discounted. No board
// entries are needed or wanted.
export function rulesFor(rules: BoardRules, forcedMode: boolean): BoardRules {
  if (!forcedMode) return rules
  return {
    maxByPos: {
      QB: rules.maxByPos.QB,
      RB: rules.maxByPos.RB,
      WR: rules.maxByPos.WR,
      TE: rules.maxByPos.TE,
      K: 1,
      DEF: 1,
    },
    minRoundByPos: rules.minRoundByPos,
    stashRound: rules.stashRound,
    offBoardDiscount: rules.offBoardDiscount,
    vonaFromRound: rules.vonaFromRound,
  }
}

export function draftConfig(
  draft: SleeperDraft,
  tradedPicks: SleeperTradedPick[],
  rosterPositions: string[],
  rules: BoardRules,
  forcedMode: boolean
): DraftConfig {
  return {
    draft,
    tradedPicks,
    myUserId: ANDREW_USER_ID,
    rosterPositions: lineupFor(rosterPositions, rulesFor(rules, forcedMode)),
  }
}

// The live bot's simulation defaults, unchanged. reachScale is overwritten per
// decision from the picks visible at that moment, exactly as bot.ts does.
export function simOptsFor(sims?: number): SimOpts {
  return {
    sims: sims === undefined ? DEFAULT_SIM_OPTS.sims : sims,
    seed: DEFAULT_SIM_OPTS.seed,
    baseTemperature: DEFAULT_SIM_OPTS.baseTemperature,
    temperatureSlope: DEFAULT_SIM_OPTS.temperatureSlope,
    reachScale: DEFAULT_SIM_OPTS.reachScale,
    candidateLimit: DEFAULT_SIM_OPTS.candidateLimit,
  }
}
