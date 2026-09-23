import { ActionIcon, Button, Group, Menu, Paper, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { IconDots, IconHelpCircle, IconTrash, IconWifi } from '@tabler/icons-react'
import type { QuickReconnectRecord } from '../../../services/api'
import type { DirectConnectRequest } from './types'

type Props = {
  records: QuickReconnectRecord[]
  onConnect: (request: DirectConnectRequest) => void
  onClear: () => void
}

export function QuickReconnectList({ records, onConnect, onClear }: Props) {
  if (records.length === 0) return null
  return (
    <Stack gap="xs" mt="xs" data-testid="quick-reconnect-list">
      <Group justify="space-between" align="center">
        <Group gap={4}>
          <Text fw={600} size="sm">Wireless Direct - 快速復連</Text>
          <Tooltip label="歷史已配對的端點，無需接線即可一鍵恢復無線定位連線。" withArrow>
            <ActionIcon variant="transparent" size="xs" color="gray"><IconHelpCircle size={14} /></ActionIcon>
          </Tooltip>
        </Group>
        <Menu shadow="md" width={140} position="bottom-end">
          <Menu.Target><ActionIcon variant="subtle" color="gray" size="sm"><IconDots size={16} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onClear}>清除連線紀錄</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {records.slice(0, 2).map((record) => (
        <Paper key={record.udid || record.endpoint} withBorder p="sm" radius="md" className="device-manager-secondary-card">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="arcBlue" size="md" radius="md"><IconWifi size={18} stroke={1.8} /></ThemeIcon>
              <div>
                <Text fw={600} size="sm">{record.endpoint}</Text>
                <Text size="xs" c="dimmed">歷史連線紀錄： {record.name} 於 {record.timestamp}</Text>
              </div>
            </Group>
            <Button size="xs" variant="light" color="arcBlue" leftSection={<IconWifi size={14} />}
              onClick={() => onConnect({ targetUdid: record.udid || '', targetIp: record.ip, targetName: record.name, fallbackBonjour: true, port: record.port ?? 49152 })}>
              點擊連線
            </Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
