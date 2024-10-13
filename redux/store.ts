import { combineReducers } from 'redux'
import { configureStore } from '@reduxjs/toolkit'
import { FLUSH, PAUSE, PERSIST, persistReducer, PURGE, REGISTER, REHYDRATE } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

import leagueDetailsReducer from './leagueDetailsSlice'
import nflStateReducer from './nflStateSlice'
import statusReducer from './statusSlice'

const appReducer = combineReducers({
  status: statusReducer,
  nflState: nflStateReducer,
  leagueDetails: leagueDetailsReducer,
})

const rootReducer = (state: any, action: any) => {
  if (action.type === 'auth/logOut') {
    state = undefined
  }
  return appReducer(state, action)
}

const persistConfig = {
  key: 'root',
  storage,
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof rootReducer>

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
})

export default store
