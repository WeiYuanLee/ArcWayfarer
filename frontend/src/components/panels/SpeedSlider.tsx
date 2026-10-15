import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Group, SegmentedControl, Slider, Stack, Text, Tooltip } from '@mantine/core'
import { IconRocket } from '@tabler/icons-react'
import { getNavModeSpeeds, type NavMode } from '../../services/api'
import { useT } from '../../i18n'
import type { StringKey } from '../../i18n'
import { notify } from '../common/Toast'

const NORMAL_MIN_KMH = 1
const NORMAL_MAX_KMH = 40
const TURBO_MIN_KMH = 100
const TURBO_MAX_KMH = 1000
const TURBO_NOTICE_KEY = 'arcwayfarer.speed-turbo-notice.v1'

const MODE_ORDER: NavMode[] = ['walk', 'bike', 'drive']
const MODE_LABEL_KEYS: Record<NavMode, StringKey> = {
  walk: 'navmode.walk',
  bike: 'navmode.bike',
  drive: 'navmode.drive',
}

function clamp(kmh: number): number {
  return Math.min(Math.max(kmh, NORMAL_MIN_KMH), NORMAL_MAX_KMH)
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
  allowTurbo?: boolean
}

export function SpeedSlider({ valueKmh, navMode, onChange, onNavModeChange, disabled, allowTurbo = false }: Props) {
  const t = useT()
  const [modeSpeeds, setModeSpeeds] = useState<Record<NavMode, number> | null>(null)
  const lastNormalSpeed = useRef(valueKmh <= NORMAL_MAX_KMH ? clamp(valueKmh) : 5)
  const lastTurboSpeed = useRef(valueKmh >= TURBO_MIN_KMH ? Math.min(valueKmh, TURBO_MAX_KMH) : TURBO_MIN_KMH)
  const isTurbo = allowTurbo && valueKmh >= TURBO_MIN_KMH

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

  useEffect(() => {
    if (isTurbo) lastTurboSpeed.current = Math.min(valueKmh, TURBO_MAX_KMH)
    else if (valueKmh <= NORMAL_MAX_KMH) lastNormalSpeed.current = clamp(valueKmh)
  }, [isTurbo, valueKmh])

  function handleModeSelect(mode: NavMode) {
    onNavModeChange(mode)
    if (modeSpeeds && modeSpeeds[mode]) {
      const speed = clamp(modeSpeeds[mode] * 3.6)
      lastNormalSpeed.current = speed
      if (!isTurbo) onChange(speed)
    }
  }

  function handleSpeedChange(kmh: number) {
    if (isTurbo) lastTurboSpeed.current = kmh
    else lastNormalSpeed.current = kmh
    onChange(kmh)
  }

  function handleTurboToggle() {
    if (isTurbo) {
      lastTurboSpeed.current = valueKmh
      onChange(lastNormalSpeed.current)
      return
    }

    lastNormalSpeed.current = clamp(valueKmh)
    onChange(lastTurboSpeed.current)
    try {
      if (!window.localStorage.getItem(TURBO_NOTICE_KEY)) {
        window.localStorage.setItem(TURBO_NOTICE_KEY, 'shown')
        notify.warning(t('speed.turbo_warning'), { id: 'speed:turbo-warning' })
      }
    } catch {
      notify.warning(t('speed.turbo_warning'), { id: 'speed:turbo-warning' })
    }
  }

  const speedZone = isTurbo ? { label: t('speed.turbo'), color: 'blue' } : getSpeedZoneInfo(valueKmh)
  const minKmh = isTurbo ? TURBO_MIN_KMH : NORMAL_MIN_KMH
  const maxKmh = isTurbo ? TURBO_MAX_KMH : NORMAL_MAX_KMH
  const stepKmh = isTurbo ? 10 : 0.5

  return (
    <Stack className="speed-slider-wrapper" gap="sm">
      <SegmentedControl
        fullWidth
        size="xs"
        value={navMode}
        onChange={(mode) => handleModeSelect(mode as NavMode)}
        disabled={disabled || isTurbo}
        data={MODE_ORDER.map((mode) => ({
          value: mode,
          label: t(MODE_LABEL_KEYS[mode]),
        }))}
      />
      <Group justify="space-between">
        <Badge color={speedZone.color} variant="light">{speedZone.label}</Badge>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={600}>{isTurbo ? valueKmh.toFixed(0) : valueKmh.toFixed(1)} <Text span size="xs" c="dimmed">km/h</Text></Text>
          {allowTurbo && (
            <Tooltip label={t(isTurbo ? 'speed.turbo_disable' : 'speed.turbo_enable')} withArrow>
              <ActionIcon
                size="sm"
                variant={isTurbo ? 'light' : 'subtle'}
                color={isTurbo ? 'blue' : 'gray'}
                disabled={disabled}
                aria-label={t(isTurbo ? 'speed.turbo_disable' : 'speed.turbo_enable')}
                aria-pressed={isTurbo}
                onClick={handleTurboToggle}
              >
                <IconRocket size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Slider min={minKmh} max={maxKmh} step={stepKmh} value={valueKmh} disabled={disabled} color={speedZone.color} onChange={handleSpeedChange} />
    </Stack>
  )
}
