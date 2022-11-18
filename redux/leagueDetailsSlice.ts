import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { RootState } from './store';

interface ILeagueDetailsSlice {
  id: string
  name: string
}

const initialState: ILeagueDetailsSlice = {
  id: '',
  name: ''
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
  },
})

export const { addLeagueId, addLeagueName } = leagueDetailsSlice.actions

export const selectLeagueId = (state: RootState) => state.leagueDetails.id
export const selectLeagueName = (state: RootState) => state.leagueDetails.name

export default leagueDetailsSlice.reducer
