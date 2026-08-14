// Test/replay helper: load committed fixture snapshots from disk.
// (Named *.testutil.ts, not *.test.ts, so vitest doesn't treat it as a spec;
// it is still excluded from the Next build via its importers only being
// tests/scripts... it holds no vitest imports, so app type-checking is safe.)

import * as fs from 'fs'
import * as path from 'path'
import { PlayerMap, SleeperDraft, SleeperLeague, SleeperPick, SleeperTradedPick } from './types'

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures')

export interface FixtureDraft {
  name: string
  season: string
  league: SleeperLeague
  draft: SleeperDraft
  picks: SleeperPick[]
  tradedPicks: SleeperTradedPick[]
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function loadFixture(name: string, season: string): FixtureDraft {
  const dir = path.join(FIXTURES_DIR, name, season)
  return {
    name,
    season,
    league: readJson<SleeperLeague>(path.join(dir, 'league.json')),
    draft: readJson<SleeperDraft>(path.join(dir, 'draft.json')),
    picks: readJson<SleeperPick[]>(path.join(dir, 'picks.json')),
    tradedPicks: readJson<SleeperTradedPick[]>(path.join(dir, 'traded_picks.json')),
  }
}

const DRAFT_FIXTURE_FILES = ['league.json', 'draft.json', 'picks.json', 'traded_picks.json']

// A draft fixture is identified by what a directory CONTAINS, not by where it
// sits. fixtures/ also holds directories that are not league/season pairs --
// backtest2025/ among them -- and treating every child as a league made the
// loader throw the moment one appeared.
function isDraftFixture(dir: string): boolean {
  for (let i = 0; i < DRAFT_FIXTURE_FILES.length; i++) {
    if (!fs.existsSync(path.join(dir, DRAFT_FIXTURE_FILES[i]))) return false
  }
  return true
}

export function loadAllFixtures(): FixtureDraft[] {
  const out: FixtureDraft[] = []
  const names = fs.readdirSync(FIXTURES_DIR).filter((n) => fs.statSync(path.join(FIXTURES_DIR, n)).isDirectory())
  for (let i = 0; i < names.length; i++) {
    const leagueDir = path.join(FIXTURES_DIR, names[i])
    const seasons = fs.readdirSync(leagueDir).filter((s) => fs.statSync(path.join(leagueDir, s)).isDirectory())
    for (let j = 0; j < seasons.length; j++) {
      if (!isDraftFixture(path.join(leagueDir, seasons[j]))) continue
      out.push(loadFixture(names[i], seasons[j]))
    }
  }
  return out.sort((a, b) => (a.name + a.season < b.name + b.season ? -1 : 1))
}

export function loadTrimmedPlayers(): PlayerMap {
  return readJson<PlayerMap>(path.join(FIXTURES_DIR, 'players.trim.json'))
}
