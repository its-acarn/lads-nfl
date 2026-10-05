// Test helper: load the committed waiver-scout snapshot from
// fixtures/waivers/<season>/ as the same WaiverInputs the page fetches live.
// Refresh with `npm run waivers:fixtures`, then run `npm test`.

import * as fs from 'fs'
import * as path from 'path'
import { WaiverInputs } from './types'

export const WAIVER_FIXTURE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'waivers', '2026')

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(WAIVER_FIXTURE_DIR, file), 'utf8')) as T
}

export function loadWaiverFixture(league: 'lads' | 'flexi'): WaiverInputs {
  const state = readJson<{ week: number }>('state.json')
  const statsByWeek: WaiverInputs['statsByWeek'] = {}
  for (let w = 1; w <= state.week; w++) statsByWeek[w] = readJson(`stats.week${w}.json`)
  return {
    week: state.week,
    schedule: readJson('schedule.json'),
    statsByWeek,
    players: readJson('players.json'),
    trending: readJson('trending.json'),
    league: readJson(`${league}/league.json`),
    rosters: readJson(`${league}/rosters.json`),
    users: readJson(`${league}/users.json`),
  }
}
