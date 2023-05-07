import { extendTheme } from '@chakra-ui/react'

export const theme = extendTheme({
  colors: {
    primary: '#FAFBF6',
    secondary: '#FAFBF6',
    tertiary: '#85A993',
    quaternary: '#52685C',
    quinary: '#224125',
  },
  fonts: {
    body: "system-ui, sans-serif",
    heading: "Georgia, serif",
    mono: "Menlo, monospace",
  },
  components: {
    Text: {
      baseStyle: {
        color: 'quinary',
      }
    }
  }
});