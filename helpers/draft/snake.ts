// Pick-number math: snake + linear order, reversal round (3RR), traded
// picks, and slot/roster resolution. Pure functions over the Sleeper draft
// object; throws loudly on anything the engine does not support.

import { DraftConfig, SleeperDraft, SleeperTradedPick } from './types'

export function assertSupportedDraft(draft: SleeperDraft): void {
  if (draft.type !== 'snake' && draft.type !== 'linear') {
    throw new Error(`unsupported draft type "${draft.type}" — only snake and linear are supported`)
  }
  if (!draft.settings || !draft.settings.teams || !draft.settings.rounds) {
    throw new Error('draft.settings.teams/rounds missing')
  }
}

// Is the given round drafted in ascending slot order (1..N)?
export function roundAscends(draft: SleeperDraft, round: number): boolean {
  if (draft.type === 'linear') return true
  let ascending = round % 2 === 1
  const reversal = draft.settings.reversal_round || 0
  // 3RR: from the reversal round onward the snake direction flips once more,
  // so with reversal_round=3 the slot order runs 1..N, N..1, N..1, 1..N, ...
  if (reversal > 0 && round >= reversal) ascending = !ascending
  return ascending
}

export function pickNoFor(draft: SleeperDraft, round: number, slot: number): number {
  const teams = draft.settings.teams
  if (round < 1 || round > draft.settings.rounds) throw new Error(`round ${round} out of range`)
  if (slot < 1 || slot > teams) throw new Error(`slot ${slot} out of range`)
  const posInRound = roundAscends(draft, round) ? slot : teams - slot + 1
  return (round - 1) * teams + posInRound
}

export function roundOf(draft: SleeperDraft, pickNo: number): number {
  return Math.floor((pickNo - 1) / draft.settings.teams) + 1
}

export function slotToRoster(draft: SleeperDraft, slot: number): number {
  const map = draft.slot_to_roster_id
  if (!map) throw new Error('draft.slot_to_roster_id missing — cannot resolve slots to rosters')
  const rosterId = map[String(slot)]
  if (typeof rosterId !== 'number') throw new Error(`slot ${slot} missing from slot_to_roster_id`)
  return rosterId
}

export function myDraftSlot(draft: SleeperDraft, myUserId: string): number {
  if (!draft.draft_order) throw new Error('draft.draft_order missing — draft order not set yet')
  const slot = draft.draft_order[myUserId]
  if (typeof slot !== 'number') {
    const known = Object.keys(draft.draft_order).join(', ')
    throw new Error(`user_id ${myUserId} not in draft_order (known user_ids: ${known})`)
  }
  return slot
}

export function myRosterId(draft: SleeperDraft, myUserId: string): number {
  return slotToRoster(draft, myDraftSlot(draft, myUserId))
}

// Pick numbers owned by a roster after applying traded picks. A traded-pick
// entry (round, roster_id=original owner, owner_id=current owner) moves the
// pick belonging to the original owner's slot in that round. Entries are
// applied in feed order so chained trades resolve to the last owner.
export function ownedPickNumbers(
  draft: SleeperDraft,
  tradedPicks: SleeperTradedPick[],
  rosterId: number
): number[] {
  assertSupportedDraft(draft)
  const teams = draft.settings.teams
  const rounds = draft.settings.rounds
  const owned: number[] = []
  for (let round = 1; round <= rounds; round++) {
    for (let slot = 1; slot <= teams; slot++) {
      const originalOwner = slotToRoster(draft, slot)
      let owner = originalOwner
      for (let t = 0; t < tradedPicks.length; t++) {
        const trade = tradedPicks[t]
        if (trade.round === round && trade.roster_id === originalOwner && trade.season === draft.season) {
          owner = trade.owner_id
        }
      }
      if (owner === rosterId) owned.push(pickNoFor(draft, round, slot))
    }
  }
  return owned.sort((a, b) => a - b)
}

export function myPickNumbers(cfg: DraftConfig): number[] {
  return ownedPickNumbers(cfg.draft, cfg.tradedPicks, myRosterId(cfg.draft, cfg.myUserId))
}

// Every pick number mapped to the roster that owns it, traded picks applied.
// The opponent model needs this to know WHOSE picks fall between now and my
// next one: a roster that already has its starting quarterback is out of the
// market for another, and a survival curve that cannot see that predicts runs
// the room will never produce.
//
// Built in one pass over rounds x slots rather than by calling
// ownedPickNumbers once per roster, which would repeat the same traded-pick
// scan for every team.
export function pickOwners(draft: SleeperDraft, tradedPicks: SleeperTradedPick[]): Record<number, number> {
  assertSupportedDraft(draft)
  const teams = draft.settings.teams
  const rounds = draft.settings.rounds
  const out: Record<number, number> = {}
  for (let round = 1; round <= rounds; round++) {
    for (let slot = 1; slot <= teams; slot++) {
      const originalOwner = slotToRoster(draft, slot)
      let owner = originalOwner
      for (let t = 0; t < tradedPicks.length; t++) {
        const trade = tradedPicks[t]
        if (trade.round === round && trade.roster_id === originalOwner && trade.season === draft.season) {
          owner = trade.owner_id
        }
      }
      out[pickNoFor(draft, round, slot)] = owner
    }
  }
  return out
}
