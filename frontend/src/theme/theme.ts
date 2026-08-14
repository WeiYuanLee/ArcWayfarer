import { createTheme, localStorageColorSchemeManager } from '@mantine/core'

export const COLOR_SCHEME_STORAGE_KEY = 'arcwayfarer-color-scheme'

export const colorSchemeManager = localStorageColorSchemeManager({
  key: COLOR_SCHEME_STORAGE_KEY,
})

export const arcWayfarerTheme = createTheme({
  primaryColor: 'arcBlue',
  primaryShade: { light: 6, dark: 7 },
  colors: {
    arcBlue: [
      '#edf4ff', '#d9e6ff', '#b3ccff', '#85adf5', '#5d8ee5',
      '#3f75d1', '#2f61b8', '#254f99', '#1e417d', '#193664',
    ],
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  defaultRadius: 'sm',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,
  components: {
    Button: { defaultProps: { radius: 'sm' } },
    ActionIcon: { defaultProps: { radius: 'sm', variant: 'default' } },
    Modal: { defaultProps: { radius: 'md', zIndex: 2200 } },
    Drawer: { defaultProps: { zIndex: 2200 } },
    Menu: { defaultProps: { zIndex: 2100, shadow: 'md' } },
    Tooltip: { defaultProps: { zIndex: 2100, withArrow: true } },
  },
})
