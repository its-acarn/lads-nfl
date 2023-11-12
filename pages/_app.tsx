import type { AppProps } from 'next/app'
import { Provider } from 'react-redux'
import { ChakraProvider } from '@chakra-ui/react'
import { Inter } from 'next/font/google'

import '../styles/globals.css'
import store from '../redux/store'
import Layout from '../components/Layout'
import { theme } from '../styles/theme'

const inter = Inter({ subsets: ['latin'] })

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={theme}>
      <Provider store={store}>
        <Layout className={inter.className}>
          <Component {...pageProps} />
        </Layout>
      </Provider>
    </ChakraProvider>
  )
}

export default MyApp
