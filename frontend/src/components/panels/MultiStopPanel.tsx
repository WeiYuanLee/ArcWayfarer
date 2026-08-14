import { useEffect, useState } from 'react'
import { ActionIcon, Button, FileButton, Group, NumberInput, SegmentedControl, TextInput } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { parseGpx } from './gpx'
import {
  pauseMultiStop,
  pushHistory,
  resumeMultiStop,
  setLocation,
  startMultiStop,
  stopMultiStop,
  type NavMode,
} from '../../services/api'
import type { LatLng, PanelProps } from './types'
import { EMPTY_OVERLAY } from './types'
import { formatPoint, parsePastedPoints, parsePoint } from './coords'
import { SpeedSlider } from './SpeedSlider'
import { PlaybackControls } from './PlaybackControls'
import { ActiveFlightHUD } from './ActiveFlightHUD'
import { SwitchBar } from '../common/SwitchBar'
import { ModeInfoTooltip } from '../common/ModeInfoTooltip'
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu'
import { ConfirmModal } from '../common/ConfirmModal'
import { PasteCoordinatesModal } from '../common/PasteCoordinatesModal'
import { showToast } from '../common/Toast'
import { useT } from '../../i18n'

import { useWaypointList } from '../../hooks/useWaypointList'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }
type ImportMessage = { kind: 'ok' | 'error'; text: string }

const WAYPOINT_COLOR = '#4a9af0'

export function MultiStopPanel({
  deviceId,
  device,
  deviceState,
  livePosition,
  liveEtaSeconds,
  liveStopIndex,
  connected,
  requestPoint,
  requestFlyTo,
  setOverlay,
}: PanelProps) {
  const t = useT()
  const {
    items,
    validWaypoints,
    updateWaypoint,
    handleTextChange,
    addWaypoint,
    insertWaypointAfter,
    removeWaypoint,
    moveWaypoint,
    clearAllWaypoints,
    setAllWaypoints,
  } = useWaypointList(2)
  const [navMode, setNavMode] = useState<NavMode>('walk')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [pauseEnabled, setPauseEnabled] = useState(false)
  const [pauseMin, setPauseMin] = useState(5)
  const [pauseMax, setPauseMax] = useState(20)
  const [straightLine, setStraightLine] = useState(true)
  const [speedKmh, setSpeedKmh] = useState(5)
  const [jumpMode, setJumpMode] = useState(false)
  const [jumpPreDelay, setJumpPreDelay] = useState(0)
  const [jumpPostDelay, setJumpPostDelay] = useState(2)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importMessage, setImportMessage] = useState<ImportMessage | null>(null)
  const [gpxFileName, setGpxFileName] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  })

  const deviceReady = device?.status === 'ready'
  const isRunning = deviceState === 'navigating'
  const isPaused = deviceState === 'paused' || deviceState === 'paused:navigating'
  const isActive = isRunning || isPaused
  const isBusy = status.kind === 'busy'
  const canStart = deviceReady && !isActive && validWaypoints.length >= 2 && !isBusy

  // Auto fill waypoint 1 with live position if empty
  useEffect(() => {
    if (!items[0]?.point && livePosition && !items[0]?.rawText) {
      updateWaypoint(0, livePosition)
    }
  }, [livePosition, items, updateWaypoint])

  // Automatically update route path preview when not active
  useEffect(() => {
    if (!isActive) {
      if (validWaypoints.length >= 2) {
        setRoutePath(validWaypoints)
      } else {
        setRoutePath([])
      }
    }
  }, [validWaypoints, isActive])

  const isLocked = isActive || isBusy
  const activePath = isRunning && validWaypoints.length >= 2
    ? (() => {
        const startIndex = Math.max(0, Math.min((liveStopIndex ?? 1) - 1, validWaypoints.length - 1))
        const endIndex = startIndex + 1
        return endIndex < validWaypoints.length ? [validWaypoints[startIndex], validWaypoints[endIndex]] : null
      })()
    : null

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    title?: string
    items: ContextMenuItem[]
  } | null>(null)

  // Clean up overlay on unmount only
  useEffect(() => {
    return () => setOverlay(EMPTY_OVERLAY)
  }, [setOverlay])

  useEffect(() => {
    setOverlay({
      markers: items
        .map((item, idx) =>
          item.point
            ? {
                id: `multistop-${idx}`,
                lat: item.point.lat,
                lng: item.point.lng,
                color: WAYPOINT_COLOR,
                label: String(idx + 1),
                title: `Stop #${idx + 1} (${item.point.lat.toFixed(5)}, ${item.point.lng.toFixed(5)})`,
                draggable: !isLocked,
                pathIndex: idx,
                onDragEnd: (lat: number, lng: number) => {
                  if (isLocked) return
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
                        disabled: isLocked || items.length <= 2,
                        onClick: () => removeWaypoint(idx),
                      },
                    ],
                  })
                },
              }
            : null
        )
        .filter((m): m is NonNullable<typeof m> => m !== null),
      path: routePath,
      activePath,
      onPathClick: (lat, lng) => {
        if (isLocked) return
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
              disabled: isLocked,
              onClick: () => addWaypoint({ lat, lng }),
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
  }, [items, routePath, activePath, isLocked, deviceState, deviceId, setOverlay, updateWaypoint, removeWaypoint, addWaypoint, t])

  function handleClearAllWaypoints() {
    setConfirmModal({
      isOpen: true,
      title: t('confirm.clear_all_title'),
      description: t('confirm.clear_all_desc'),
      onConfirm: () => {
        clearAllWaypoints()
        setGpxFileName(null)
        setImportMessage(null)
      },
    })
  }

  async function processUnifiedImportFile(file: File) {
    setImportMessage(null)
    const isJson = file.name.toLowerCase().endsWith('.json')
    try {
      const text = await file.text()
      if (isJson) {
        try {
          const data = JSON.parse(text)
          if (Array.isArray(data.waypoints) && data.waypoints.length > 0) {
            setAllWaypoints(data.waypoints)
            if (typeof data.speedKmh === 'number') setSpeedKmh(data.speedKmh)
            if (data.navMode) setNavMode(data.navMode)
            if (typeof data.straightLine === 'boolean') setStraightLine(data.straightLine)
            if (typeof data.jumpMode === 'boolean') setJumpMode(data.jumpMode)
            if (typeof data.jumpPreDelay === 'number') setJumpPreDelay(data.jumpPreDelay)
            if (typeof data.jumpPostDelay === 'number') setJumpPostDelay(data.jumpPostDelay)
            if (typeof data.pauseEnabled === 'boolean') setPauseEnabled(data.pauseEnabled)
            if (typeof data.pauseMin === 'number') setPauseMin(data.pauseMin)
            if (typeof data.pauseMax === 'number') setPauseMax(data.pauseMax)
            requestFlyTo(data.waypoints[0].lat, data.waypoints[0].lng)
            setImportMessage({ kind: 'ok', text: t('multistop.import_template_success') })
            return
          }
        } catch {
          // fall through to GPX parsing
        }
      }

      // Try GPX parsing
      const points = parseGpx(text)
      if (points.length > 0) {
        setAllWaypoints(points)
        setGpxFileName(file.name)
        requestFlyTo(points[0].lat, points[0].lng)
        setImportMessage({ kind: 'ok', text: t('multistop.import_gpx_success') })
        return
      }

      setImportMessage({ kind: 'error', text: t('multistop.import_unrecognized_file') })
    } catch {
      setImportMessage({ kind: 'error', text: t('multistop.import_file_failed') })
    }
  }

  async function handleUnifiedImportFile(file: File) {
    if (validWaypoints.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('confirm.gpx_overwrite_title'),
        description: t('confirm.gpx_overwrite_desc'),
        onConfirm: () => processUnifiedImportFile(file),
      })
    } else {
      processUnifiedImportFile(file)
    }
  }

  function processPasteSubmit() {
    const { points, invalidCount } = parsePastedPoints(pasteText)
    if (points.length === 0) {
      setImportMessage({ kind: 'error', text: t('multistop.paste_empty') })
      return
    }
    setAllWaypoints(points)
    requestFlyTo(points[0].lat, points[0].lng)
    setImportMessage(invalidCount > 0 ? { kind: 'ok', text: t('multistop.import_partial') } : null)
    setPasteOpen(false)
    setPasteText('')
  }

  function handlePasteSubmit() {
    if (validWaypoints.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('confirm.paste_overwrite_title'),
        description: t('confirm.paste_overwrite_desc'),
        onConfirm: () => processPasteSubmit(),
      })
    } else {
      processPasteSubmit()
    }
  }

  function handleExportTemplate() {
    if (validWaypoints.length === 0) return
    const template = {
      version: '1.0',
      kind: 'multi_stop',
      name: `MultiStop_Route_${new Date().toISOString().slice(0, 10)}`,
      speedKmh,
      navMode,
      straightLine,
      jumpMode,
      jumpPreDelay,
      jumpPostDelay,
      pauseEnabled,
      pauseMin,
      pauseMax,
      waypoints: validWaypoints,
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `multistop-route-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleStart() {
    if (!deviceId || validWaypoints.length < 2) return
    setStatus({ kind: 'busy' })
    try {
      const result = await startMultiStop(
        deviceId,
        navMode,
        validWaypoints,
        { enabled: pauseEnabled, min: pauseMin, max: pauseMax },
        { straightLine, jumpMode, jumpPreDelay, jumpPostDelay, customSpeedKmh: speedKmh }
      )
      setRoutePath(result.route)
      pushHistory({ lat: validWaypoints[0].lat, lng: validWaypoints[0].lng, kind: 'multi_stop' }).catch(() => {})
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_start') })
    }
  }

  async function handleStop() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      await stopMultiStop(deviceId)
      setRoutePath([])
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_stop') })
    }
  }

  async function handlePauseResume() {
    if (!deviceId) return
    setStatus({ kind: 'busy' })
    try {
      if (isPaused) {
        await resumeMultiStop(deviceId)
      } else {
        await pauseMultiStop(deviceId)
      }
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('multistop.status.failed_update') })
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2>{t('multistop.title')}</h2>
        <ModeInfoTooltip description={t('multistop.description')} />
      </div>

      {isActive ? (
        <ActiveFlightHUD
          modeName={t('multistop.title')}
          isRunning={isRunning}
          isPaused={isPaused}
          isBusy={isBusy}
          currentIndex={liveStopIndex ?? 1}
          totalPoints={validWaypoints.length || 2}
          liveEtaSeconds={liveEtaSeconds}
          livePosition={livePosition}
          routePath={routePath}
          waypoints={items.map((i) => i.point)}
          isLoop={false}
          connected={connected}
          onPauseResume={handlePauseResume}
          onStop={handleStop}
        />
      ) : (
        <div className="panel-scroll-body multistop-panel-scroll">
          {!deviceId && <p className="panel-hint">{t('panel.hint.select_device')}</p>}
          {deviceId && !deviceReady && (
            <p className="panel-hint warning">{device?.detail ?? t('panel.hint.device_not_ready')}</p>
          )}
          {deviceState === 'teleporting' && (
            <p className="panel-hint warning">{t('panel.hint.teleporting')}</p>
          )}

          <section className="multistop-section">
            {gpxFileName && (
              <div className="route-preflight-badge">
                <span>GPX: {gpxFileName}</span>
                <span>·</span>
                <span>{validWaypoints.length} Points</span>
              </div>
            )}

            <div className="waypoint-list">
              {items.map((item, idx) => (
                <div className="coord-row" key={item.id}>
                  <span>{idx + 1}</span>
                  <TextInput size="xs"
                    placeholder="lat, lng or URL"
                    value={item.rawText}
                    onFocus={() => requestPoint((lat, lng) => updateWaypoint(idx, { lat, lng }))}
                    onChange={(e) => handleTextChange(idx, e.target.value)}
                  />
                  <div className="waypoint-row-actions">
                    <ActionIcon variant="subtle" disabled={idx === 0} onClick={() => moveWaypoint(idx, 'up')} aria-label="Move Up"><IconArrowUp size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" disabled={idx === items.length - 1} onClick={() => moveWaypoint(idx, 'down')} aria-label="Move Down"><IconArrowDown size={16} /></ActionIcon>
                    <ActionIcon color="red" variant="subtle"
                      disabled={isLocked || items.length <= 2}
                      onClick={() => removeWaypoint(idx)}
                      title={t('panel.remove_waypoint')}
                    aria-label={t('panel.remove_waypoint')}><IconTrash size={16} /></ActionIcon>
                  </div>
                </div>
              ))}
            </div>

            <Group gap="xs"><Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => addWaypoint()}>{t('panel.add_waypoint')}</Button><Button size="xs" color="red" variant="default" onClick={handleClearAllWaypoints}>{t('multistop.action.clear_all')}</Button></Group>
          </section>

          <section className="multistop-section">
            <Group gap="xs">
            <FileButton accept=".gpx,.json,application/gpx+xml,application/json"
              onChange={async (file) => {
                if (file) await handleUnifiedImportFile(file)
              }}>
              {(props) => <Button {...props} size="xs" variant="default">{t('multistop.import_file')}</Button>}
            </FileButton>
            {/* native input retained only for browser file selection behavior */}
            {false && <input type="file"
                accept=".gpx,.json,application/gpx+xml,application/json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await handleUnifiedImportFile(file)
                  e.target.value = ''
                }}
              />}
            <Button size="xs" variant="default" onClick={handleExportTemplate} disabled={validWaypoints.length === 0}>{t('multistop.export_template')}</Button>
            <Button size="xs" variant="default" onClick={() => setPasteOpen(true)}>{t('multistop.paste_coords')}</Button>
            </Group>

            {importMessage && (
              <p className={`panel-status ${importMessage.kind === 'error' ? 'error' : 'ok'}`}>{importMessage.text}</p>
            )}
          </section>

          <section className="multistop-section">
            <SegmentedControl fullWidth size="xs" disabled={isActive} value={jumpMode ? 'jump' : 'line'} onChange={(value) => { setJumpMode(value === 'jump'); if (value === 'line') setStraightLine(true) }} data={[{ label: t('multistop.jump_mode'), value: 'jump' }, { label: t('multistop.straight_line'), value: 'line' }]} />

            {jumpMode ? (
            <>
              <NumberInput label={t('multistop.jump_pre_delay')}
                  min={0}
                  value={jumpPreDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(value) => setJumpPreDelay(Number(value) || 0)} />
              <NumberInput label={t('multistop.jump_post_delay')}
                  min={0}
                  value={jumpPostDelay}
                  disabled={isActive}
                  onFocus={(e) => e.target.select()}
                  onChange={(value) => setJumpPostDelay(Number(value) || 0)} />
            </>
            ) : (
            <>
              <SwitchBar
                label={t('panel.pause_toggle')}
                checked={pauseEnabled}
                onChange={setPauseEnabled}
                disabled={isActive}
              />
              {pauseEnabled && (
                <Group grow align="end"><NumberInput label={t('panel.sec_label')}
                    min={0}
                    value={pauseMin}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(value) => setPauseMin(Number(value) || 0)}
                  />
                  <NumberInput label="–"
                    min={0}
                    value={pauseMax}
                    disabled={isActive}
                    onFocus={(e) => e.target.select()}
                    onChange={(value) => setPauseMax(Number(value) || 0)}
                  />
                </Group>
              )}

              <SpeedSlider
                valueKmh={speedKmh}
                navMode={navMode}
                onChange={setSpeedKmh}
                onNavModeChange={setNavMode}
                disabled={isActive}
              />
            </>
            )}
          </section>

          <PlaybackControls
            canStart={canStart}
            isActive={isActive}
            isPaused={isPaused}
            isBusy={isBusy}
            onStart={handleStart}
            onPauseResume={handlePauseResume}
            onStop={handleStop}
          />
        </div>
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

      <PasteCoordinatesModal
        isOpen={pasteOpen}
        value={pasteText}
        onChange={setPasteText}
        onSubmit={handlePasteSubmit}
        onClose={() => setPasteOpen(false)}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
