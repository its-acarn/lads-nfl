import { describe, expect, it } from 'vitest'
import { formatDraftMessage } from './notifier'
import { Scored } from './types'

const bijan: Scored = {
  player_id: '9509',
  name: 'Bijan Robinson',
  pos: 'RB',
  team: 'ATL',
  value: 99.9,
  offBoard: false,
  score: 41.2,
  survivalToNextPct: 12,
  rationale: ['3 left in RB T1', '12% survives to pick 24', 'fills RB starter slot'],
}
const chase: Scored = { ...bijan, player_id: '7564', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', survivalToNextPct: 34 }
const offBoard: Scored = { ...bijan, player_id: 'x', name: 'Some Deep Guy', offBoard: true, survivalToNextPct: null }

describe('formatDraftMessage', () => {
  it('heads_up lists the shortlist with survival', () => {
    const s = formatDraftMessage({ kind: 'heads_up', picksAway: 3, myPickNo: 24, shortlist: [bijan, chase] })
    expect(s).toContain('HEADS UP — pick 24 is 3 away.')
    expect(s).toContain('1. RB Bijan Robinson (12% survives)')
    expect(s).toContain("2. WR Ja'Marr Chase (34% survives)")
  })

  it('on_clock leads with TAKE and carries the why', () => {
    const s = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [chase, offBoard] })
    expect(s).toContain('ON THE CLOCK — pick 24')
    expect(s).toContain('TAKE: RB Bijan Robinson')
    expect(s).toContain("Else: WR Ja'Marr Chase")
    expect(s).toContain('Else: RB Some Deep Guy (off-board)')
    expect(s).toContain('Why: 3 left in RB T1')
  })

  it('escalation repeats the instruction with elapsed seconds', () => {
    const s = formatDraftMessage({ kind: 'escalation', pickNo: 24, secondsElapsed: 41, instruction: bijan, fallbacks: [chase] })
    expect(s).toContain('STILL OPEN after 41s — pick 24')
    expect(s).toContain('TAKE: RB Bijan Robinson')
  })

  it('confirmation and mismatch read differently at a glance', () => {
    expect(formatDraftMessage({ kind: 'pick_confirmed', pickNo: 24, player: bijan })).toContain('CONFIRMED pick 24')
    const mm = formatDraftMessage({
      kind: 'pick_mismatch',
      pickNo: 24,
      expected: bijan,
      actual: { player_id: 'z', name: 'Wrong Guy', pos: 'TE', team: null },
    })
    expect(mm).toContain('MISMATCH pick 24')
    expect(mm).toContain('got TE Wrong Guy')
    expect(mm).toContain('Recomputing')
  })

  it('covers lifecycle messages', () => {
    expect(formatDraftMessage({ kind: 'draft_paused' })).toContain('paused')
    expect(formatDraftMessage({ kind: 'draft_resumed' })).toContain('resumed')
    expect(formatDraftMessage({ kind: 'draft_complete', rosterSummary: 'QB: X' })).toContain('DRAFT COMPLETE')
    expect(formatDraftMessage({ kind: 'bot_error', message: 'boom', consecutiveFailures: 5 })).toContain('5 consecutive failures')
  })
})
