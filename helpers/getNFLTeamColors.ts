import { nflTeamColors } from '../config/nflTeamColors'
import { Position } from '../types/Position'

export function getNFLTeamTextColor(team: string) {
  return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[1]
}

export function getNFLTeamBgColor(team: string) {
  return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[0]
}

export function getPositionColor(position: Position) {
  switch (position) {
    case Position.QB:
      return 'red'
    case Position.RB:
      return 'teal'
    case Position.WR:
      return 'cyan'
    case Position.TE:
      return 'orange'
  }
}
