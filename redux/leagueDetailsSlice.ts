import { LeagueDetails } from './../types/LeagueDetail'
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { RootState } from './store'

interface ILeagueDetailsSlice {
  rosters: any[]
  leagueDetails: LeagueDetails[]
}

const initialState: ILeagueDetailsSlice = {
  rosters: [],
  leagueDetails: [],
}

export const leagueDetailsSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    addRosters: (state: ILeagueDetailsSlice, action: PayloadAction<any[]>) => {
      state.rosters = action.payload
    },
    addLeagueDetails: (state: ILeagueDetailsSlice, action: PayloadAction<LeagueDetails[]>) => {
      state.leagueDetails = action.payload
    },
  },
})

export const { addRosters, addLeagueDetails } = leagueDetailsSlice.actions

export const selectCurrentLeagueId = (state: RootState) => state.leagueDetails.leagueDetails[0]?.leagueId
export const selectLeagueDetails = (state: RootState) => state.leagueDetails.leagueDetails
export const selectLeagueName = (state: RootState) => state.leagueDetails.leagueDetails[0]?.name
export const selectLeagueSeason = (state: RootState) => state.leagueDetails.leagueDetails[0]?.season
export const selectRosters = (state: RootState) => state.leagueDetails.rosters

export default leagueDetailsSlice.reducer
