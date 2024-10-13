import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { NFLState } from '../types/NFLState'

import { RootState } from './store'

const initialState: NFLState = {
  week: 0,
  season_type: 'pre',
  season_start_date: '',
  season: '',
  previous_season: '',
  leg: 0,
  league_season: '',
  league_create_season: '',
  display_week: 0,
  season_has_scores: false,
}

export const nflStateSlice = createSlice({
  name: 'nflState',
  initialState,
  reducers: {
    addState: (state, action: PayloadAction<any>) => {
      state = action.payload
    },
  },
})

export const { addState } = nflStateSlice.actions

export const selectState = (state: RootState) => state.nflState
export const selectCurrentWeek = (state: RootState) => state.nflState.week

export default nflStateSlice.reducer
