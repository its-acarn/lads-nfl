import { Provider } from 'react-redux'
import store from '../redux/store'
import '../styles/globals.css'
import 'antd/dist/antd.css'
import type { AppProps } from 'next/app'
import Layout from '../components/Layout'
import { ChakraProvider } from '@chakra-ui/react'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider>
      <Provider store={store}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </Provider>
    </ChakraProvider>
  )
}

export default MyApp
