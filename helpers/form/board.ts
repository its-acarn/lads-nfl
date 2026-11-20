// Everything the /form page renders, from one set of inputs. Pure: the page
// feeds it live Sleeper data, the tests feed it fixtures/waivers/.

import { FormConfig } from '../../config/form'
import { completedWeeks, upcomingWeek } from '../waivers/weeks'
import { WaiverInputs } from '../waivers/types'
import { playerGames } from './games'
import { ownerMap } from './owners'
import { buildPlayerForm } from './playerForm'
import { buildPointsAllowed } from './pointsAllowed'
import { buildTeamForm } from './teamForm'
import { FormBoard, FormWindow } from './types'

export interface FormOptions {
  playerWindow: FormWindow
  allowedWindow: FormWindow
  ownerId?: string
}

export function buildFormBoard(inputs: WaiverInputs, opts: FormOptions, config: FormConfig): FormBoard {
  const weeks = completedWeeks(inputs.schedule, inputs.week)
  const games = playerGames(inputs)
  const owners = ownerMap(inputs.rosters, inputs.users, opts.ownerId)
  const allowed = buildPointsAllowed(games, inputs.players, inputs.statsByWeek, weeks, opts.allowedWindow)
  return {
    throughWeek: weeks.length ? weeks[weeks.length - 1] : 0,
    upcomingWeek: upcomingWeek(inputs.schedule),
    players: buildPlayerForm(inputs, games, opts.playerWindow, allowed, owners, config),
    allowed,
    teams: buildTeamForm(
      inputs.rosters,
      inputs.players,
      games,
      opts.playerWindow,
      inputs.league.roster_positions,
      owners
    ),
  }
}
