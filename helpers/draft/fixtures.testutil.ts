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

export function loadAllFixtures(): FixtureDraft[] {
  const out: FixtureDraft[] = []
  const names = fs.readdirSync(FIXTURES_DIR).filter((n) => fs.statSync(path.join(FIXTURES_DIR, n)).isDirectory())
  for (let i = 0; i < names.length; i++) {
    const seasons = fs.readdirSync(path.join(FIXTURES_DIR, names[i]))
    for (let j = 0; j < seasons.length; j++) {
      out.push(loadFixture(names[i], seasons[j]))
    }
  }
  return out.sort((a, b) => (a.name + a.season < b.name + b.season ? -1 : 1))
}

export function loadTrimmedPlayers(): PlayerMap {
  return readJson<PlayerMap>(path.join(FIXTURES_DIR, 'players.trim.json'))
}
