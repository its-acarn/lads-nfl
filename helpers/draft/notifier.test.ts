import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ConsoleNotifier, formatDraftMessage, JsonlNotifier, MultiNotifier } from './notifier'
import { DraftMessage, Notifier, Scored } from './types'

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
  it('heads_up warns without listing the board', () => {
    const s = formatDraftMessage({ kind: 'heads_up', picksAway: 3, myPickNo: 24, shortlist: [bijan, chase] })
    expect(s).toContain('HEADS UP — pick 24 is 3 away.')
    expect(s).toContain('Likely: RB Bijan Robinson')
    // The rest of the shortlist stays private even when the caller supplies it.
    expect(s).not.toContain("Ja'Marr Chase")
    expect(s).not.toContain('2.')
  })

  it('on_clock leads with TAKE and names nobody else', () => {
    const s = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [chase, offBoard] })
    expect(s).toContain('ON THE CLOCK — pick 24')
    expect(s).toContain('TAKE: RB Bijan Robinson')
    expect(s).not.toContain('Else')
    expect(s).not.toContain("Ja'Marr Chase")
    expect(s).not.toContain('Some Deep Guy')
    // The rationale is the read of the board that must not be public.
    expect(s).not.toContain('Why')
    expect(s).not.toContain('3 left in RB T1')
  })

  it('escalation repeats the instruction with elapsed seconds, and nothing more', () => {
    const s = formatDraftMessage({ kind: 'escalation', pickNo: 24, secondsElapsed: 55, instruction: bijan, fallbacks: [chase] })
    expect(s).toContain('STILL OPEN after 55s — pick 24')
    expect(s).toContain('TAKE: RB Bijan Robinson')
    expect(s).not.toContain('Else')
    expect(s).not.toContain("Ja'Marr Chase")
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

// One of every message kind, each carrying more players and more rationale
// than it is allowed to render, so the suppression is tested rather than the
// absence of anything to suppress.
const everyKind: DraftMessage[] = [
  { kind: 'loaded', draftId: 'test-draft', slot: 5, pickNos: [5, 20], rounds: 14, teams: 12 },
  { kind: 'heads_up', picksAway: 3, myPickNo: 24, shortlist: [bijan, chase, offBoard] },
  { kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [chase, offBoard] },
  { kind: 'escalation', pickNo: 24, secondsElapsed: 55, instruction: bijan, fallbacks: [chase, offBoard] },
  { kind: 'pick_confirmed', pickNo: 24, player: bijan },
  { kind: 'pick_mismatch', pickNo: 24, expected: bijan, actual: { player_id: 'z', name: 'Wrong Guy', pos: 'TE', team: null } },
  { kind: 'draft_paused' },
  { kind: 'draft_resumed' },
  { kind: 'draft_complete', rosterSummary: 'QB: X' },
  { kind: 'bot_error', message: 'boom', consecutiveFailures: 5 },
]

// These messages get shared in a public channel. Anything beyond the single
// name on the clock tells the other eleven managers what Andrew is thinking.
describe('no message leaks the board', () => {
  it('renders no shortlist, no alternatives and no rationale, whatever it is handed', () => {
    for (let i = 0; i < everyKind.length; i++) {
      const s = formatDraftMessage(everyKind[i])
      const kind = everyKind[i].kind
      expect(s, kind).not.toContain('Else')
      expect(s, kind).not.toContain('Shortlist')
      expect(s, kind).not.toContain('Why')
      // The rationale strings on `bijan`, which must never be rendered.
      expect(s, kind).not.toContain('3 left in RB T1')
      expect(s, kind).not.toContain('12% survives to pick 24')
      expect(s, kind).not.toContain('fills RB starter slot')
    }
  })

  // The hole this closes: the rationale array was correctly suppressed, but the
  // survival forecast was rendered on every player in every message. "TAKE: RB
  // Bijan Robinson (12% survives)" tells a rival the bot expects him gone — the
  // same class of information the shortlist was removed to protect.
  it('never renders a survival forecast to the public audience', () => {
    for (let i = 0; i < everyKind.length; i++) {
      const s = formatDraftMessage(everyKind[i])
      expect(s, everyKind[i].kind).not.toContain('% survives')
      expect(s, everyKind[i].kind).not.toContain('12%')
      expect(s, everyKind[i].kind).not.toContain('34%')
    }
  })

  it('defaults to the public audience when the argument is omitted', () => {
    const explicit = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [] }, 'public')
    const defaulted = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [] })
    expect(defaulted).toBe(explicit)
    expect(defaulted).not.toContain('% survives')
  })

  it('keeps (off-board), which reveals nothing actionable', () => {
    const s = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: offBoard, fallbacks: [] })
    expect(s).toContain('(off-board)')
    expect(s).not.toContain('% survives')
  })
})

// Andrew's own console. The forecast is what tells him whether a recommendation
// is urgent or safe to skip, so it belongs here — and only here.
describe('the private rendering', () => {
  it('carries the survival forecast the public one withholds', () => {
    const msg: DraftMessage = { kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [] }
    expect(formatDraftMessage(msg, 'private')).toContain('(12% survives)')
    expect(formatDraftMessage(msg, 'public')).not.toContain('12%')
  })

  it('still names only one player', () => {
    const s = formatDraftMessage(
      { kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [chase, offBoard] },
      'private'
    )
    expect(s).toContain('Bijan Robinson')
    expect(s).not.toContain("Ja'Marr Chase")
    expect(s).not.toContain('Else')
  })

  it('still withholds the rationale, which is a read of the board either way', () => {
    const s = formatDraftMessage({ kind: 'on_clock', pickNo: 24, instruction: bijan, fallbacks: [] }, 'private')
    expect(s).not.toContain('3 left in RB T1')
    expect(s).not.toContain('fills RB starter slot')
  })

  it('ConsoleNotifier uses it, so Andrew sees the forecast on his own screen', async () => {
    const written: string[] = []
    const original = console.log
    // eslint-disable-next-line no-console
    console.log = (s?: unknown) => {
      written.push(String(s))
    }
    try {
      await new ConsoleNotifier(() => '12:00:00').send({
        kind: 'on_clock',
        pickNo: 24,
        instruction: bijan,
        fallbacks: [],
      })
    } finally {
      // eslint-disable-next-line no-console
      console.log = original
    }
    expect(written.join('\n')).toContain('(12% survives)')
  })

  it('names at most one player per message', () => {
    // Every message carrying a player is handed three; only the first may show.
    const withPlayers = everyKind.filter((m) => m.kind === 'heads_up' || m.kind === 'on_clock' || m.kind === 'escalation')
    expect(withPlayers.length).toBe(3)
    for (let i = 0; i < withPlayers.length; i++) {
      const s = formatDraftMessage(withPlayers[i])
      expect(s, withPlayers[i].kind).toContain('Bijan Robinson')
      expect(s, withPlayers[i].kind).not.toContain("Ja'Marr Chase")
      expect(s, withPlayers[i].kind).not.toContain('Some Deep Guy')
    }
  })

  it('a mismatch may name the player who landed and the one instructed, and no others', () => {
    const s = formatDraftMessage({
      kind: 'pick_mismatch',
      pickNo: 24,
      expected: bijan,
      actual: { player_id: 'z', name: 'Wrong Guy', pos: 'TE', team: null },
    })
    expect(s).toContain('Wrong Guy')
    expect(s).toContain('Bijan Robinson')
    expect(s).not.toContain("Ja'Marr Chase")
  })
})

describe('the LOAD confirmation', () => {
  it('states the slot and every pick number before the draft starts', () => {
    // A wrong slot or user id is far cheaper to spot here than at pick one.
    const out = formatDraftMessage({
      kind: 'loaded',
      draftId: '1394795000339914752',
      slot: 5,
      pickNos: [5, 20, 29, 44],
      rounds: 14,
      teams: 12,
    })
    expect(out).toContain('12 teams, 14 rounds')
    expect(out).toContain('slot 5')
    expect(out).toContain('5, 20, 29, 44')
  })
})

// ---------------------------------------------------------------------------
// The machine-readable log. A second reader (the assistant relaying a draft in
// chat) follows THIS, not the console: console copy is written for a phone
// screen and is meant to be reworded freely, so parsing it would couple the
// relay to text that is expected to change.
// ---------------------------------------------------------------------------

const KINDS: DraftMessage['kind'][] = [
  'loaded',
  'heads_up',
  'on_clock',
  'escalation',
  'pick_confirmed',
  'pick_mismatch',
  'draft_paused',
  'draft_resumed',
  'draft_complete',
  'bot_error',
]

const SEQUENCE: DraftMessage[] = [
  { kind: 'loaded', draftId: 'test-draft', slot: 5, pickNos: [5, 20], rounds: 14, teams: 12 },
  { kind: 'heads_up', picksAway: 2, myPickNo: 5, shortlist: [bijan, chase] },
  { kind: 'on_clock', pickNo: 5, instruction: bijan, fallbacks: [chase] },
  { kind: 'escalation', pickNo: 5, secondsElapsed: 55, instruction: bijan, fallbacks: [] },
  { kind: 'pick_confirmed', pickNo: 5, player: bijan },
  { kind: 'draft_complete', rosterSummary: 'RB: Bijan Robinson' },
]

describe('JsonlNotifier', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draftlog-'))
    file = path.join(dir, 'run.jsonl')
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const lines = (): string[] =>
    fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0)

  it('writes exactly one line per send', async () => {
    const n = new JsonlNotifier(file)
    for (let i = 0; i < SEQUENCE.length; i++) await n.send(SEQUENCE[i])
    n.close()
    expect(lines().length).toBe(SEQUENCE.length)
  })

  it('every line parses as JSON and carries a kind from the DraftMessage union', async () => {
    const n = new JsonlNotifier(file)
    for (let i = 0; i < SEQUENCE.length; i++) await n.send(SEQUENCE[i])
    n.close()
    const parsed = lines().map((l) => JSON.parse(l) as DraftMessage & { ts: string })
    for (let i = 0; i < parsed.length; i++) {
      expect(KINDS.indexOf(parsed[i].kind), `line ${i + 1} kind ${parsed[i].kind}`).toBeGreaterThanOrEqual(0)
      expect(parsed[i].kind).toBe(SEQUENCE[i].kind)
      // A timestamp the relay can order by, added alongside the message rather
      // than inside it so the DraftMessage shape is preserved verbatim.
      expect(Date.parse(parsed[i].ts)).toBeGreaterThan(0)
    }
  })

  it('preserves the message payload, not just its kind', async () => {
    const n = new JsonlNotifier(file)
    await n.send({ kind: 'on_clock', pickNo: 20, instruction: bijan, fallbacks: [chase] })
    n.close()
    const row = JSON.parse(lines()[0]) as { pickNo: number; instruction: Scored; fallbacks: Scored[] }
    expect(row.pickNo).toBe(20)
    expect(row.instruction.name).toBe('Bijan Robinson')
    expect(row.fallbacks[0].name).toBe("Ja'Marr Chase")
  })

  // D3: the bot is crash-safe -- killed mid-draft and restarted it re-derives
  // state from the feed and repeats no instruction. A log that truncated on
  // restart would discard the first half of the record at exactly the moment
  // something has gone wrong and the record matters most.
  it('a second notifier on the same path appends rather than truncates', async () => {
    const first = new JsonlNotifier(file)
    await first.send(SEQUENCE[0])
    await first.send(SEQUENCE[1])
    first.close()

    const second = new JsonlNotifier(file)
    await second.send(SEQUENCE[2])
    second.close()

    const all = lines()
    expect(all.length).toBe(3)
    expect((JSON.parse(all[0]) as DraftMessage).kind).toBe('loaded')
    expect((JSON.parse(all[2]) as DraftMessage).kind).toBe('on_clock')
  })

  it('creates the log directory if it does not exist', async () => {
    const nested = path.join(dir, 'logs', 'deep', 'run.jsonl')
    const n = new JsonlNotifier(nested)
    await n.send(SEQUENCE[0])
    n.close()
    expect(fs.existsSync(nested)).toBe(true)
  })
})

describe('MultiNotifier', () => {
  class Recorder implements Notifier {
    received: DraftMessage[] = []
    send(msg: DraftMessage): Promise<void> {
      this.received.push(msg)
      return Promise.resolve()
    }
  }
  class Exploding implements Notifier {
    calls = 0
    send(): Promise<void> {
      this.calls++
      return Promise.reject(new Error('disk full'))
    }
  }

  it('delivers every message to every notifier', async () => {
    const a = new Recorder()
    const b = new Recorder()
    const multi = new MultiNotifier([a, b])
    for (let i = 0; i < SEQUENCE.length; i++) await multi.send(SEQUENCE[i])
    expect(a.received.length).toBe(SEQUENCE.length)
    expect(b.received.length).toBe(SEQUENCE.length)
  })

  // A disk that fills mid-draft should cost the log, not the rehearsal.
  it('a notifier that throws does not stop its siblings', async () => {
    const before = new Recorder()
    const boom = new Exploding()
    const after = new Recorder()
    const multi = new MultiNotifier([before, boom, after], () => undefined)

    await expect(multi.send(SEQUENCE[0])).resolves.toBeUndefined()
    await expect(multi.send(SEQUENCE[1])).resolves.toBeUndefined()

    expect(before.received.length).toBe(2)
    expect(after.received.length).toBe(2)
    expect(boom.calls).toBe(2)
  })

  // A full disk fails on EVERY subsequent message. Reporting each one would
  // flood the console Andrew is reading on a 120-second clock, which is the
  // one channel the failure must not damage.
  it('reports a failing notifier once, not on every message', async () => {
    const reported: string[] = []
    const multi = new MultiNotifier([new Exploding()], (m) => reported.push(m))
    for (let i = 0; i < SEQUENCE.length; i++) await multi.send(SEQUENCE[i])
    expect(reported.length).toBe(1)
    expect(reported[0]).toContain('disk full')
  })
})
