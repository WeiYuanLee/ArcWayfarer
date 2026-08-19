import { useEffect, useState } from 'react'
import { Badge, Group, SegmentedControl, Slider, Stack, Text } from '@mantine/core'
import { getNavModeSpeeds, type NavMode } from '../../services/api'
import { useT } from '../../i18n'
import type { StringKey } from '../../i18n'

const MIN_KMH = 1
const MAX_KMH = 40

const MODE_ORDER: NavMode[] = ['walk', 'bike', 'drive']
const MODE_LABEL_KEYS: Record<NavMode, StringKey> = {
  walk: 'navmode.walk',
  bike: 'navmode.bike',
  drive: 'navmode.drive',
}

function clamp(kmh: number): number {
  return Math.min(Math.max(kmh, MIN_KMH), MAX_KMH)
}

function getSpeedZoneInfo(kmh: number) {
  if (kmh <= 8) return { label: 'Walk', color: 'green' }
  if (kmh <= 20) return { label: 'Cycle', color: 'cyan' }
  return { label: 'Drive', color: 'orange' }
}

type Props = {
  valueKmh: number
  navMode: NavMode
  onChange: (kmh: number) => void
  onNavModeChange: (mode: NavMode) => void
  disabled?: boolean
}

export function SpeedSlider({ valueKmh, navMode, onChange, onNavModeChange, disabled }: Props) {
  const t = useT()
  const [modeSpeeds, setModeSpeeds] = useState<Record<NavMode, number> | null>(null)

  useEffect(() => {
    let mounted = true
    getNavModeSpeeds()
      .then((data) => {
        if (mounted) setModeSpeeds(data)
      })
      .catch(() => {
        if (mounted) setModeSpeeds(null)
      })
    return () => {
      mounted = false
    }
  }, [])

  function handleModeSelect(mode: NavMode) {
    onNavModeChange(mode)
    if (modeSpeeds && modeSpeeds[mode]) {
      const speed = clamp(modeSpeeds[mode] * 3.6)
      onChange(speed)
    }
  }

  const speedZone = getSpeedZoneInfo(valueKmh)

  return (
    <Stack className="speed-slider-wrapper" gap="sm">
      <SegmentedControl
        fullWidth
        size="xs"
        value={navMode}
        onChange={(mode) => handleModeSelect(mode as NavMode)}
        disabled={disabled}
        data={MODE_ORDER.map((mode) => ({
          value: mode,
          label: t(MODE_LABEL_KEYS[mode]),
        }))}
      />
      <Group justify="space-between">
        <Badge color={speedZone.color} variant="light">{speedZone.label}</Badge>
        <Text size="sm" fw={600}>{valueKmh.toFixed(1)} <Text span size="xs" c="dimmed">km/h</Text></Text>
      </Group>
      <Slider min={MIN_KMH} max={MAX_KMH} step={0.5} value={valueKmh} disabled={disabled} color={speedZone.color} onChange={onChange} />
    </Stack>
  )
}
