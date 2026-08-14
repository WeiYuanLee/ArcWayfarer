import { ActionIcon, Tooltip, useMantineColorScheme } from '@mantine/core'
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'

export function ColorSchemeControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const Icon = colorScheme === 'auto' ? IconDeviceDesktop : colorScheme === 'dark' ? IconMoon : IconSun
  const nextScheme = colorScheme === 'light' ? 'dark' : colorScheme === 'dark' ? 'auto' : 'light'
  const labels = { light: 'Light', dark: 'Dark', auto: 'Follow system' }

  return (
    <Tooltip label={`Appearance: ${labels[colorScheme]} → ${labels[nextScheme]}`} openDelay={450}>
      <ActionIcon aria-label={`Change appearance to ${labels[nextScheme]}`} size="md" variant="default" onClick={() => setColorScheme(nextScheme)}>
        <Icon size={17} stroke={1.7} />
      </ActionIcon>
    </Tooltip>
  )
}
