// Disk loaders for the committed backtest fixtures.
//
// Kept apart from the pure modules so that universe.ts, visibility.ts and
// swap.ts stay filesystem-free and directly testable. Used by both the specs
// and the M6 runner. Holds no vitest imports, so the Next build's type-check
// is unaffected -- same arrangement as helpers/draft/fixtures.testutil.ts.

import * as fs from 'fs'
import * as path from 'path'
import { PlayerMap, ResolvedBoard, SleeperDraft, SleeperLeague, SleeperPick, SleeperTradedPick } from '../types'
import { BacktestLeague, FfcSnapshot, JimmygPick, SheetAdpEntry } from './types'

const ROOT = path.join(__dirname, '..', '..', '..')
const BACKTEST_DIR = path.join(ROOT, 'fixtures', 'backtest2025')
const LADS_2025_DIR = path.join(ROOT, 'fixtures', 'lads', '2025')

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

export function loadSheetAdp(): SheetAdpEntry[] {
  return readJson<SheetAdpEntry[]>(path.join(BACKTEST_DIR, 'adp.sheet.json'))
}

export function loadJimmygPicks(): JimmygPick[] {
  return readJson<JimmygPick[]>(path.join(BACKTEST_DIR, 'adp.jimmyg.json'))
}

export function loadFfc(): FfcSnapshot {
  return readJson<FfcSnapshot>(path.join(BACKTEST_DIR, 'adp.ffc.json'))
}

export function loadBacktestLeague(): BacktestLeague {
  return readJson<BacktestLeague>(path.join(BACKTEST_DIR, 'league.2025.json'))
}

export function loadBoard2025(): ResolvedBoard {
  return readJson<ResolvedBoard>(path.join(ROOT, 'config', 'board.2025.json'))
}

export function loadLads2025Picks(): SleeperPick[] {
  return readJson<SleeperPick[]>(path.join(LADS_2025_DIR, 'picks.json')).sort((a, b) => a.pick_no - b.pick_no)
}

export function loadLads2025Draft(): SleeperDraft {
  return readJson<SleeperDraft>(path.join(LADS_2025_DIR, 'draft.json'))
}

export function loadLads2025League(): SleeperLeague {
  return readJson<SleeperLeague>(path.join(LADS_2025_DIR, 'league.json'))
}

export function loadLads2025TradedPicks(): SleeperTradedPick[] {
  return readJson<SleeperTradedPick[]>(path.join(LADS_2025_DIR, 'traded_picks.json'))
}

// The 2026 player map. Available ONLY so a test can assert that the universe
// does not depend on it; no backtest code path may read it for attributes.
export function loadTrim2026(): PlayerMap {
  return readJson<PlayerMap>(path.join(ROOT, 'fixtures', 'players.trim.json'))
}
