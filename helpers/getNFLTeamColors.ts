import { nflTeamColors } from '../config/nflTeamColors'

export function getNFLTeamTextColor(team: string) {
  return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[1]
}

export function getNFLTeamBgColor(team: string) {
  return nflTeamColors.find((t) => t.shortName === team)?.colors.hex[0]
}

export function getPositionColor(position: any) {
  switch (position) {
    case 'QB':
      return 'red'
    case 'RB':
      return 'teal'
    case 'WR':
      return 'cyan'
    case 'TE':
      return 'orange'
  }
}
