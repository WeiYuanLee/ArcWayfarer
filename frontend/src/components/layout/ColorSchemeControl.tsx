import { ActionIcon, Menu, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'

export function ColorSchemeControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('light')
  const Icon = computedColorScheme === 'dark' ? IconMoon : IconSun

  return (
    <Menu shadow="md" width={180} position="bottom-start">
      <Menu.Target>
        <Tooltip label="Appearance" openDelay={500}>
          <ActionIcon aria-label="Change color scheme" size="md">
            <Icon size={17} stroke={1.7} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Appearance</Menu.Label>
        <Menu.Item leftSection={<IconSun size={16} />} onClick={() => setColorScheme('light')} rightSection={colorScheme === 'light' ? '✓' : undefined}>
          Light
        </Menu.Item>
        <Menu.Item leftSection={<IconMoon size={16} />} onClick={() => setColorScheme('dark')} rightSection={colorScheme === 'dark' ? '✓' : undefined}>
          Dark
        </Menu.Item>
        <Menu.Item leftSection={<IconDeviceDesktop size={16} />} onClick={() => setColorScheme('auto')} rightSection={colorScheme === 'auto' ? '✓' : undefined}>
          Follow system
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
