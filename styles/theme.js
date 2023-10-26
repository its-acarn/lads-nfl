import { extendTheme } from '@chakra-ui/react'

export const theme = extendTheme({
  colors: {
    primary: '#000000',
    secondary: '#888888',
    tertiary: '#D9D9D9',
    quaternary: '#52685C',
    quinary: '#FFF',
  },
  fonts: {
    body: 'system-ui, sans-serif',
    heading: 'system-ui, sans-serif',
    mono: 'Menlo, monospace',
  },
  components: {
    Heading: {
      baseStyle: {
        color: 'quinary',
      },
    },
    Text: {
      baseStyle: {
        color: 'secondary',
      },
    },
  },
})
