export type NFLState = {
  week: number
  leg: number
  season: string // Year as string
  season_type: 'pre' | 'post' | 'regular'
  league_season: string // Year as string
  previous_season: string // Year as string
  season_start_date: string // ISO 8601 date string
  display_week: number
  league_create_season: string // Year as string
  season_has_scores: boolean
}
