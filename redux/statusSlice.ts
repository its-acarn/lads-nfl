import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { RootState } from './store'

interface IStatusSlice {
  lastFetchedWeek: number
}

const initialState: IStatusSlice = {
  lastFetchedWeek: 0,
}

export const statusSlice = createSlice({
  name: 'status',
  initialState,
  reducers: {
    addLastFetchedWeek: (state: IStatusSlice, action: PayloadAction<any>) =>
      void (state.lastFetchedWeek = action.payload),
  },
})

export const { addLastFetchedWeek } = statusSlice.actions

export const selectState = (state: RootState) => state.status
export const selectLastFetchedWeek = (state: RootState) => state.status.lastFetchedWeek

export default statusSlice.reducer
