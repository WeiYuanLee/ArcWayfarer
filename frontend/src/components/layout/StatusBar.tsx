import { useT } from '../../i18n'

type LatLng = { lat: number; lng: number }

type Props = {
  navigating: boolean
  livePosition: LatLng | null
  liveSpeedMps: number | null
  lat: number | null
  lng: number | null
}

export function StatusBar({ navigating, livePosition, liveSpeedMps, lat, lng }: Props) {
  const t = useT()
  const shownLat = navigating && livePosition ? livePosition.lat : lat
  const shownLng = navigating && livePosition ? livePosition.lng : lng
  const speedKmh = navigating && liveSpeedMps !== null ? liveSpeedMps * 3.6 : null

  return (
    <div className="status-bar">
      <span>
        {t('statusbar.lat')}: {shownLat !== null ? shownLat.toFixed(4) : '--'}
      </span>
      <span>
        {t('statusbar.lng')}: {shownLng !== null ? shownLng.toFixed(4) : '--'}
      </span>
      <span>
        {t('statusbar.speed')}: {speedKmh !== null ? `${speedKmh.toFixed(1)} km/h` : '--'}
      </span>
    </div>
  )
}
