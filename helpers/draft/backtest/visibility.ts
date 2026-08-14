// The single seam between what the engine knows and what the harness knows.
//
// The harness legitimately uses hindsight: performing a pairwise swap requires
// knowing which manager took a player later in the draft. The ENGINE must
// never see any of it. Every path by which backtest code turns the pick feed
// into engine state goes through visibleAt(), and nothing else in
// helpers/draft/backtest/ may index the raw pick array.
//
// That this holds is proved, not asserted -- see lookahead.test.ts, which
// permutes the players occupying every pick from the decision point onward,
// rebuilds the entire pipeline from that permuted feed, and requires the
// recommendation to come out identical. The same test applied to a
// deliberately leaky prior fails, which is what makes a passing run mean
// something.

import { SleeperPick } from '../types'

// Picks that had already happened when the drafter at `pickNo` was on the
// clock. Strictly less than: the pick being decided has not been made yet.
export function visibleAt(picks: SleeperPick[], pickNo: number): SleeperPick[] {
  const out: SleeperPick[] = []
  for (let i = 0; i < picks.length; i++) {
    if (picks[i].pick_no < pickNo) out.push(picks[i])
  }
  out.sort((a, b) => a.pick_no - b.pick_no)
  return out
}
