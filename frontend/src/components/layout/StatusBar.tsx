import { memo, useEffect, useMemo, useState } from 'react'
import { ActionIcon, Group, Paper, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { useI18n } from '../../i18n'
import { coordinateLocalTime } from '../../utils/coordinateLocalTime'

type LatLng = { lat: number; lng: number }
type Props = { livePosition: LatLng | null; liveSpeedMps: number | null; lat: number | null; lng: number | null }

export const StatusBar = memo(function StatusBar({ livePosition, liveSpeedMps, lat, lng }: Props) {
  const { lang, t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const shownLat = livePosition ? livePosition.lat : lat
  const shownLng = livePosition ? livePosition.lng : lng
  const speedKmh = liveSpeedMps !== null ? liveSpeedMps * 3.6 : null
  const localTime = useMemo(
    () => coordinateLocalTime(now, shownLat, shownLng, lang === 'zh' ? 'zh-TW' : 'en-US'),
    [now, shownLat, shownLng, lang],
  )

  useEffect(() => {
    // Keep an idle map's local time current even when no position telemetry is
    // arriving. Seconds are omitted, so a 30-second tick is sufficient.
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function copyCoordinates() {
    if (shownLat === null || shownLng === null) return
    navigator.clipboard.writeText(`${shownLat.toFixed(6)}, ${shownLng.toFixed(6)}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000) })
  }

  return <Paper className="status-bar" withBorder px="sm" py={6} shadow="xs"><Group gap="sm" wrap="nowrap">
    <Text size="xs" ff="monospace">{t('statusbar.lat')} {shownLat?.toFixed(5) ?? '--'} · {t('statusbar.lng')} {shownLng?.toFixed(5) ?? '--'}</Text>
    <Tooltip label={t('statusbar.copied')}><ActionIcon size="sm" variant="subtle" onClick={copyCoordinates} aria-label={t('statusbar.copied')}>{copied ? <IconCheck size={15} /> : <IconCopy size={15} />}</ActionIcon></Tooltip>
    <Tooltip label={localTime?.timeZone ?? t('statusbar.timezone_unavailable')}>
      <Text size="xs" c="dimmed" className="status-bar-local-time">{localTime?.display ?? '--'}</Text>
    </Tooltip>
    {speedKmh !== null && <Text size="xs" c="dimmed">{speedKmh.toFixed(1)} km/h</Text>}
  </Group></Paper>
})
