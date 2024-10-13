import type { AppProps } from 'next/app'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { persistStore } from 'redux-persist'
import { ChakraProvider } from '@chakra-ui/react'
import { Inter, Bungee_Shade } from 'next/font/google'

import '../styles/globals.css'
import store from '../redux/store'
import Layout from '../components/Layout'
import { theme } from '../styles/theme'

const persistor = persistStore(store)

export const inter = Inter({ subsets: ['latin'] })
export const bungeeShade = Bungee_Shade({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
})

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={theme}>
      <Provider store={store}>
        <PersistGate persistor={persistor}>
          <Layout className={`${inter.className} ${bungeeShade.className}`}>
            <Component {...pageProps} />
          </Layout>
        </PersistGate>
      </Provider>
    </ChakraProvider>
  )
}

export default MyApp
