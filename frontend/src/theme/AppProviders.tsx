import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { arcWayfarerTheme, colorSchemeManager } from './theme'

type Props = { children: ReactNode }

export function AppProviders({ children }: Props) {
  return (
    <MantineProvider
      theme={arcWayfarerTheme}
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme="auto"
    >
      <ModalsProvider>
        <Notifications position="bottom-right" zIndex={2300} limit={4} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  )
}
