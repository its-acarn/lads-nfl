import { combineReducers } from 'redux'
import { configureStore } from '@reduxjs/toolkit'

import leagueDetailsReducer from './leagueDetailsSlice'


const appReducer = combineReducers({
  leagueDetails: leagueDetailsReducer,
})

const rootReducer = (state: any, action: any) => {
  if (action.type === 'auth/logOut') {
    state = undefined;
  }
  return appReducer(state, action);
};

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof rootReducer>;

const store = configureStore({
  reducer: rootReducer,
  devTools: process.env.NODE_ENV !== 'production',
})

export default store
