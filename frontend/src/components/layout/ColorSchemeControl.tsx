import { ActionIcon, Tooltip, useMantineColorScheme } from '@mantine/core'
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useT, type StringKey } from '../../i18n'

const NEXT_SCHEME_LABEL_KEYS: Record<'light' | 'dark' | 'auto', StringKey> = {
  light: 'appearance.switch_light',
  dark: 'appearance.switch_dark',
  auto: 'appearance.use_system',
}

export function ColorSchemeControl() {
  const t = useT()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const Icon = colorScheme === 'auto' ? IconDeviceDesktop : colorScheme === 'dark' ? IconMoon : IconSun
  const nextScheme = colorScheme === 'light' ? 'dark' : colorScheme === 'dark' ? 'auto' : 'light'
  const actionLabel = t(NEXT_SCHEME_LABEL_KEYS[nextScheme])

  return (
    <Tooltip label={actionLabel} openDelay={450}>
      <ActionIcon aria-label={actionLabel} size="md" variant="default" onClick={() => setColorScheme(nextScheme)}>
        <Icon size={17} stroke={1.7} />
      </ActionIcon>
    </Tooltip>
  )
}
