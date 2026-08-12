import { useEffect, useState } from 'react'
import { pauseRouteLoop, pushHistory, resumeRouteLoop, setLocation, startRouteLoop, stopRouteLoop, type NavMode } from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePoint, pointsOnCircle } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { SwitchBar } from '../common/SwitchBar'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

import { useWaypointList } from '../../hooks/useWaypointList'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type SubMode = 'manual' | 'circle'

const WAYPOINT_COLOR = '#4a9af0'

export function RouteLoopPanel({ deviceId, device, deviceState, livePosition, liveStopIndex, liveEtaSeconds, connected, requestPoint, setOverlay }: PanelProps) {
  const t = useT()
  const [subMode, setSubMode] = useState<SubMode>('manual')
  const {
    items,
    validWaypoints,
    updateWaypoint,
    handleTextChange,
    addWaypoint,
    removeWaypoint,
    moveWaypoint,
    setAllWaypoints,
    reverseWaypoints,
    setAsStart,
  } = useWaypointList(2)
  
  // Circle sub-mode states
  const [circleCenter, setCircleCenter] = useState<LatLng | null>(null)
  const [circleCenterText, setCircleCenterText] = useState('')
  const [circleRadiusKm, setCircleRadiusKm] = useState(1)
  const [circleCount, setCircleCount] = useState(8)

  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [speedKmh, setSpeedKmh] = useState(5)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'looping'
  const isPaused = deviceState === 'paused:looping'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy

  const effectivePath = isActive
    ? (routePath.length >= 2 ? routePath : (validWaypoints.length >= 2 ? [...validWaypoints, validWaypoints[0]] : []))
    : (validWaypoints.length >= 2 ? [...validWaypoints, validWaypoints[0]] : [])

  const isLocked = isActive || isBusy
  const activePath = isRunning && validWaypoints.length >= 2
    ? (() => {
        const startIndex = Math.max(0, Math.min((liveStopIndex ?? 1) - 1, validWaypoints.length - 1))
        return [validWaypoints[startIndex], validWaypoints[(startIndex + 1) % validWaypoints.length]]
      })()
    : null

  // Clean up overlay on unmount only
  useEffect(() => {
    return () => setOverlay(EMPTY_OVERLAY)
  }, [setOverlay])

  // Auto fill circle center with live position if empty
  useEffect(() => {
    if (!circleCenter && livePosition && !circleCenterText) {
      setCircleCenter(livePosition)
      setCircleCenterText(formatPoint(livePosition))
    }
  }, [livePosition, circleCenter, circleCenterText])

  // Recalculate circle waypoints when circle options change in circle mode
  useEffect(() => {
    if (subMode === 'circle' && circleCenter) {
      const radiusM = Math.max(0, circleRadiusKm * 1000)
      const count = Math.max(4, Math.min(36, circleCount || 8))
      const generated = pointsOnCircle(circleCenter, radiusM, count)
      setAllWaypoints(generated)
    }
  }, [subMode, circleCenter, circleRadiusKm, circleCount, setAllWaypoints])

  useEffect(() => {
    setOverlay({
      markers: items
        .map((item, idx) =>
          item.point
            ? {
                id: `loop-${idx}`,
                lat: item.point.lat,
                lng: item.point.lng,
                color: WAYPOINT_COLOR,
                label: String(idx + 1),
                title: `Stop #${idx + 1} (${item.point.lat.toFixed(5)}, ${item.point.lng.toFixed(5)})`,
                draggable: !isLocked && subMode === 'manual',
                pathIndex: idx,
                onDragEnd: (lat: number, lng: number) => {
                  if (isLocked || subMode === 'circle') return
                  updateWaypoint(idx, { lat, lng })
                },
                onContextMenu: ({ clientX, clientY }: { clientX: number; clientY: number }) => {
                  setContextMenu({
                    x: clientX,
                    y: clientY,
                    title: `Stop #${idx + 1}`,
                    items: [
                      {
                        id: 'teleport',
                        label: t('contextmenu.teleport'),
                        disabled: deviceState !== 'idle' || !deviceId,
                        onClick: async () => {
                          if (!deviceId || !item.point) return
                          try {
                            await setLocation(deviceId, item.point.lat, item.point.lng)
                          } catch (e) {
                            setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Teleport failed' })
                          }
                        },
                      },
                      {
                        id: 'set-start',
                        label: t('contextmenu.set_start'),
                        disabled: isLocked || idx === 0,
                        onClick: () => setAsStart(idx),
                      },
                      {
                        id: 'copy-coords',
                        label: t('contextmenu.copy_coords'),
                        onClick: () => {
                          if (!item.point) return
                          navigator.clipboard.writeText(`${item.point.lat.toFixed(6)}, ${item.point.lng.toFixed(6)}`)
                          showToast(t('toast.copied_coords'))
                        },
                      },
                      {
                        id: 'delete',
                        label: t('contextmenu.delete_waypoint'),
                        danger: true,
                        disabled: isLocked || items.length <= 2 || subMode === 'circle',
                        onClick: () => removeWaypoint(idx),
                      },
                    ],
                  })
                },
              }
            : null
        )
        .filter((m): m is NonNullable<typeof m> => m !== null),
      path: effectivePath,
      activePath,
      circle: subMode === 'circle' && circleCenter && circleRadiusKm > 0
        ? { lat: circleCenter.lat, lng: circleCenter.lng, radiusMeters: circleRadiusKm * 1000 }
        : null,
      onPathClick: (lat, lng) => {
        if (isLocked || subMode === 'circle') return
        addWaypoint({ lat, lng })
      },
      onMapContextMenu: ({ lat, lng, clientX, clientY }) => {
        setContextMenu({
          x: clientX,
          y: clientY,
          title: `地圖位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          items: [
            {
              id: 'add-wp-here',
              label: t('contextmenu.add_wp_here'),
              disabled: isLocked || subMode === 'circle',
              onClick: () => addWaypoint({ lat, lng }),
            },
            {
              id: 'select-circle-center',
              label: t('contextmenu.select_circle_center'),
              disabled: isLocked,
              onClick: () => {
                const pt = { lat, lng }
                setCircleCenter(pt)
                setCircleCenterText(formatPoint(pt))
                if (subMode !== 'circle') {
                  setSubMode('circle')
                }
              },
            },
            {
              id: 'teleport-here',
              label: t('contextmenu.teleport_here'),
              disabled: deviceState !== 'idle' || !deviceId,
              onClick: async () => {
                if (!deviceId) return
                try {
                  await setLocation(deviceId, lat, lng)
                } catch (e) {
                  setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Teleport failed' })
                }
              },
            },
            {
              id: 'copy-map-coords',
              label: t('contextmenu.copy_coords_short'),
              onClick: () => {
                navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
                showToast(t('toast.copied_coords'))
              },
            },
          ],
        })
      },
    })
  }, [items, effectivePath, activePath, isLocked, deviceState, deviceId, setOverlay, subMode, circleCenter, circleRadiusKm, updateWaypoint, setAsStart, removeWaypoint, addWaypoint, t])

  function handlePickCircleCenter() {
    requestPoint((lat, lng) => {
      const pt = { lat, lng }
      setCircleCenter(pt)
      setCircleCenterText(formatPoint(pt))
    })
  }

  function handleCircleCenterTextChange(value: string) {
    setCircleCenterText(value)
    const parsed = parsePoint(value)
    if (parsed) setCircleCenter(parsed)
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startRouteLoop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        speedKmh,
        straightLine
      )
      setRoutePath(result.route)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'route_loop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopRouteLoop(deviceId)
      setRoutePath([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeRouteLoop(deviceId)
      } else {
        await pauseRouteLoop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('routeloop.status.failed_update') })
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>{t('routeloop.title')}</h2>
        <ModeInfoTooltip description={t('routeloop.description')} />
      </div>

      {isActive ? (
        <ActiveFlightHUD
          modeName={t('routeloop.title')}
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          currentIndex={liveStopIndex ?? 1}
          totalPoints={validWaypoints.length || 2}
          liveEtaSeconds={liveEtaSeconds}
          livePosition={livePosition}
          routePath={effectivePath}
          waypoints={items.map((i) => i.point)}
          isLoop={true}
          connected={connected}
          onPauseResume={handlePauseResume}
          onStop={handleStop}
        />
      ) : (
        <>
          <div className="panel-scroll-body">
            {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
            {deviceId && !deviceReady && (
              <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
            )}
            {deviceState === 'teleporting' && (
              <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
            )}

            <div className="panel-sub-tabs">
              <button
                className={`sub-tab ${subMode === 'manual' ? 'active' : ''}`}
                onClick={() => setSubMode('manual')}
                disabled={isActive}
              >
                {t('routeloop.mode.manual')}
              </button>
              <button
                className={`sub-tab ${subMode === 'circle' ? 'active' : ''}`}
                onClick={() => {
                  setSubMode('circle')
                  if (circleCenter) {
                    const generated = pointsOnCircle(circleCenter, circleRadiusKm * 1000, circleCount)
                    setAllWaypoints(generated)
                  }
                }}
                disabled={isActive}
              >
                {t('routeloop.mode.circle')}
              </button>
            </div>

            {subMode === 'manual' ? (
              <>
                <div className="waypoint-list">
                  {items.map((item, idx) => (
                    <div className="coord-row" key={item.id}>
                      <span>{idx + 1}</span>
                      <input
                        type="text"
                        placeholder="lat, lng or URL"
                        value={item.rawText}
                        onFocus={() => requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))}
                        onChange={(e) => handleTextChange(idx, e.target.value)}
                      />
                      <div className="waypoint-row-actions">
                        <button disabled={idx === 0} onClick={() => moveWaypoint(idx, 'up')} title="Move Up">↑</button>
                        <button disabled={idx === items.length - 1} onClick={() => moveWaypoint(idx, 'down')} title="Move Down">↓</button>
                        <button
                          className="waypoint-remove"
                          disabled={isLocked || items.length <= 2}
                          onClick={() => removeWaypoint(idx)}
                          title={t('panel.remove_waypoint')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="panel-quick-actions">
                  <button className="swap-button" onClick={() => addWaypoint()}>
                    {t('panel.add_waypoint')}
                  </button>
                  <button className="swap-button" onClick={reverseWaypoints} title={t('routeloop.action.reverse')}>
                    {t('routeloop.action.reverse')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="coord-row">
                  <span>C</span>
                  <input
                    type="text"
                    placeholder="Center (lat, lng or URL)"
                    value={circleCenterText}
                    onFocus={handlePickCircleCenter}
                    onChange={(e) => handleCircleCenterTextChange(e.target.value)}
                    disabled={isActive}
                  />
                </div>

                {livePosition && (
                  <div className="panel-quick-actions" style={{ marginTop: 4 }}>
                    <button
                      className="swap-button"
                      onClick={() => {
                        setCircleCenter(livePosition)
                        setCircleCenterText(formatPoint(livePosition))
                      }}
                      disabled={isActive}
                    >
                      {t('routeloop.circle.use_current_location')}
                    </button>
                  </div>
                )}

                <div className="coord-row" style={{ marginTop: 10 }}>
                  <span>{t('routeloop.circle.radius')}</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={circleRadiusKm}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setCircleRadiusKm(Math.max(0.01, Number(e.target.value)))}
                  />
                </div>

                <div className="panel-quick-actions">
                  {[0.5, 1, 2, 5].map((r) => (
                    <button
                      key={r}
                      className={`swap-button ${circleRadiusKm === r ? 'active' : ''}`}
                      onClick={() => setCircleRadiusKm(r)}
                      disabled={isActive}
                    >
                      {`${r}km`}
                    </button>
                  ))}
                </div>

                <div className="coord-row" style={{ marginTop: 10 }}>
                  <span>{t('routeloop.circle.count')}</span>
                  <input
                    type="number"
                    min={4}
                    max={36}
                    value={circleCount}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = Math.max(4, Math.min(36, Number(e.target.value) || 4))
                      setCircleCount(val)
                    }}
                  />
                </div>
              </>
            )}

            <SwitchBar
              label={t('multistop.straight_line')}
              checked={straightLine}
              onChange={setStraightLine}
              disabled={isActive}
            />

            <SwitchBar
              label={t('panel.pause_toggle')}
              checked={pauseEnabled}
              onChange={setPauseEnabled}
              disabled={isActive}
            />
            {pauseEnabled && (
              <div className="coord-row">
                <span>{t('panel.sec_label')}</span>
                <input
                  type="number"
                  min={0}
                  value={pauseMin}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPauseMin(Number(e.target.value))}
                />
                <span>–</span>
                <input
                  type="number"
                  min={0}
                  value={pauseMax}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPauseMax(Number(e.target.value))}
                />
              </div>
            )}

            <SpeedSlider
              valueKmh={speedKmh}
              navMode={navMode}
              onChange={setSpeedKmh}
              onNavModeChange={setNavMode}
              disabled={isActive}
            />
          </div>

          <PlaybackControls
            canStart={canStart}
            isActive={isActive}
            isPaused={isPaused}
            isBusy={isBusy}
            onStart={handleStart}
            onPauseResume={handlePauseResume}
            onStop={handleStop}
          />
        </>
      )}

      {status.kind === 'busy' && <p className="panel-status">{t('generic.working')}</p>}
      {status.kind === 'error' && <p className="panel-status error">{status.message}</p>}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
