import { memo, useState } from 'react'
import { ActionIcon, Badge, Group, Paper, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { useT } from '../../i18n'
import type { DeviceState } from '../panels/types'

type LatLng = { lat: number; lng: number }
type Props = { deviceState?: DeviceState; livePosition: LatLng | null; liveSpeedMps: number | null; lat: number | null; lng: number | null }

export const StatusBar = memo(function StatusBar({ deviceState = 'idle', livePosition, liveSpeedMps, lat, lng }: Props) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const shownLat = livePosition ? livePosition.lat : lat
  const shownLng = livePosition ? livePosition.lng : lng
  const isRunning = ['navigating', 'looping', 'random_walk', 'joystick'].includes(deviceState)
  const isPaused = deviceState === 'paused'
  const speedKmh = liveSpeedMps !== null ? liveSpeedMps * 3.6 : null

  function copyCoordinates() {
    if (shownLat === null || shownLng === null) return
    navigator.clipboard.writeText(`${shownLat.toFixed(6)}, ${shownLng.toFixed(6)}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000) })
  }

  return <Paper className="status-bar" withBorder px="sm" py={6} shadow="xs"><Group gap="sm" wrap="nowrap">
    <Badge color={isRunning ? 'green' : isPaused ? 'yellow' : 'gray'} variant="light">{isRunning ? t('navigate.status.running') : isPaused ? t('panel.paused') : 'Standby'}</Badge>
    <Text size="xs" ff="monospace">{t('statusbar.lat')} {shownLat?.toFixed(5) ?? '--'} · {t('statusbar.lng')} {shownLng?.toFixed(5) ?? '--'}</Text>
    <Tooltip label={t('statusbar.copied')}><ActionIcon size="sm" variant="subtle" onClick={copyCoordinates} aria-label={t('statusbar.copied')}>{copied ? <IconCheck size={15} /> : <IconCopy size={15} />}</ActionIcon></Tooltip>
    {speedKmh !== null && <Text size="xs" c="dimmed">{speedKmh.toFixed(1)} km/h</Text>}
  </Group></Paper>
})
