import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { RootState } from './store';

interface ILeagueDetailsSlice {
  id: string
  name: string
  rosters: any[]
}

const initialState: ILeagueDetailsSlice = {
  id: '',
  name: '',
  rosters: []
}

export const leagueDetailsSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    addLeagueId: (state: ILeagueDetailsSlice, action: PayloadAction<string>) => {
      state.id = action.payload
    },
    addLeagueName: (state: ILeagueDetailsSlice, action: PayloadAction<string>) => {
      state.name = action.payload
    },
    addRosters: (state: ILeagueDetailsSlice, action: PayloadAction<any[]>) => {
      state.rosters = action.payload
    },
  },
})

export const { addLeagueId, addLeagueName, addRosters } = leagueDetailsSlice.actions

export const selectLeagueId = (state: RootState) => state.leagueDetails.id
export const selectLeagueName = (state: RootState) => state.leagueDetails.name
export const selectRosters = (state: RootState) => state.leagueDetails.rosters

export default leagueDetailsSlice.reducer
