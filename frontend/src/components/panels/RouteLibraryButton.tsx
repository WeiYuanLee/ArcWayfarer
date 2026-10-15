import { useMemo, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Group, Modal, SegmentedControl, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconBookmark, IconFlower, IconPlus, IconRepeat, IconRoute2, IconTrash } from '@tabler/icons-react'
import {
  createSavedRoute,
  deleteSavedRoute,
  listSavedRoutes,
  type SavedRoute,
  type SavedRouteMode,
  type SavedRouteRuntimeConfig,
} from '../../services/api'
import { useT } from '../../i18n'
import type { LatLng } from './types'
import { createGpxPresetRoutes } from './gpxPresetRoutes'
import { PRESET_ROUTE_MOTION } from './presetRouteDefaults'
import { notify } from '../common/Toast'
import './RouteLibraryButton.css'

type Props = {
  deviceId: string | null
  currentMode: SavedRouteMode
  waypoints: LatLng[]
  runtimeConfig: SavedRouteRuntimeConfig
  anchor: LatLng | null
  disabled?: boolean
  onLoad: (route: SavedRoute, targetMode: SavedRouteMode) => void
}

type View = 'list' | 'actions' | 'confirm' | 'save' | 'delete'

const MODE_ORDER: SavedRouteMode[] = ['route_loop', 'multi_stop', 'flower']
type GpxPresetTranslate = Parameters<typeof createGpxPresetRoutes>[0]

const PARK_FOREST_POT_POINTS: LatLng[] = [
  { lat: 39.272962, lng: 9.067519 },
  { lat: 39.275836, lng: 9.071853 },
  { lat: 39.274740, lng: 9.073130 },
  { lat: 39.274740, lng: 9.073130 },
  { lat: 39.271617, lng: 9.076810 },
  { lat: 39.272497, lng: 9.066982 },
  { lat: 39.272796, lng: 9.068141 },
  { lat: 39.275122, lng: 9.071918 },
  { lat: 39.272115, lng: 9.075544 },
  { lat: 39.272510, lng: 9.072105 },
  { lat: 39.272614, lng: 9.068656 },
  { lat: 39.274540, lng: 9.071875 },
  { lat: 39.273199, lng: 9.073232 },
  { lat: 39.272497, lng: 9.074385 },
  { lat: 39.272863, lng: 9.069750 },
  { lat: 39.274021, lng: 9.071875 },
  { lat: 39.272738, lng: 9.073581 },
  { lat: 39.272929, lng: 9.072116 },
  { lat: 39.273012, lng: 9.070351 },
  { lat: 39.273710, lng: 9.071767 },
  { lat: 39.273428, lng: 9.072341 },
  { lat: 39.272979, lng: 9.073028 },
  { lat: 39.273133, lng: 9.070920 },
  { lat: 39.273270, lng: 9.071268 },
  { lat: 39.273274, lng: 9.071563 },
  { lat: 39.273266, lng: 9.072170 },
  { lat: 39.273967, lng: 9.072148 },
  { lat: 39.274304, lng: 9.071853 },
  { lat: 39.273743, lng: 9.070904 },
  { lat: 39.272975, lng: 9.069552 },
  { lat: 39.272854, lng: 9.068581 },
  { lat: 39.273639, lng: 9.070035 },
  { lat: 39.274109, lng: 9.070571 },
  { lat: 39.274208, lng: 9.069847 },
  { lat: 39.274499, lng: 9.069171 },
  { lat: 39.272830, lng: 9.066274 },
  { lat: 39.272639, lng: 9.065437 },
  { lat: 39.271982, lng: 9.065287 },
  { lat: 39.271895, lng: 9.065936 },
  { lat: 39.271168, lng: 9.066789 },
  { lat: 39.271056, lng: 9.068457 },
  { lat: 39.271754, lng: 9.071065 },
  { lat: 39.271688, lng: 9.072835 },
  { lat: 39.272128, lng: 9.068769 },
  { lat: 39.272360, lng: 9.066832 },
  { lat: 39.272713, lng: 9.066317 },
  { lat: 39.272576, lng: 9.065550 },
  { lat: 39.272049, lng: 9.065427 },
  { lat: 39.271966, lng: 9.066027 },
  { lat: 39.271297, lng: 9.066886 },
  { lat: 39.271218, lng: 9.068452 },
  { lat: 39.271783, lng: 9.070839 },
  { lat: 39.272232, lng: 9.066859 },
  { lat: 39.272576, lng: 9.066269 },
  { lat: 39.272448, lng: 9.065689 },
  { lat: 39.272115, lng: 9.065614 },
  { lat: 39.272057, lng: 9.066097 },
  { lat: 39.271472, lng: 9.066988 },
  { lat: 39.271389, lng: 9.068452 },
  { lat: 39.271729, lng: 9.070276 },
  { lat: 39.272070, lng: 9.066784 },
  { lat: 39.272443, lng: 9.066097 },
  { lat: 39.272348, lng: 9.065834 },
  { lat: 39.272173, lng: 9.065824 },
  { lat: 39.272132, lng: 9.066156 },
  { lat: 39.271613, lng: 9.067004 },
  { lat: 39.271513, lng: 9.068361 },
  { lat: 39.271688, lng: 9.069638 },
  { lat: 39.271920, lng: 9.066923 },
  { lat: 39.272248, lng: 9.066119 },
  { lat: 39.271737, lng: 9.067068 },
  { lat: 39.271667, lng: 9.068806 },
  { lat: 39.272817, lng: 9.067819 },
  { lat: 39.272551, lng: 9.066762 },
  { lat: 39.272784, lng: 9.066489 },
  { lat: 39.274250, lng: 9.069139 },
  { lat: 39.273913, lng: 9.069616 },
  { lat: 39.272979, lng: 9.068002 },
  { lat: 39.272767, lng: 9.066789 },
  { lat: 39.274786, lng: 9.069273 },
  { lat: 39.276202, lng: 9.071762 },
  { lat: 39.276044, lng: 9.071977 },
  { lat: 39.275894, lng: 9.071563 },
  { lat: 39.274528, lng: 9.069573 },
  { lat: 39.274320, lng: 9.070233 },
  { lat: 39.275408, lng: 9.071971 },
  { lat: 39.275674, lng: 9.072352 },
  { lat: 39.275857, lng: 9.072148 },
  { lat: 39.274615, lng: 9.070297 },
  { lat: 39.274179, lng: 9.070871 },
  { lat: 39.274835, lng: 9.071977 },
  { lat: 39.273523, lng: 9.073285 },
  { lat: 39.272335, lng: 9.074884 },
  { lat: 39.271879, lng: 9.075329 },
  { lat: 39.272240, lng: 9.071531 },
  { lat: 39.272543, lng: 9.067712 },
  { lat: 39.272917, lng: 9.067175 },
]

const FOREST_POT_POINTS: LatLng[] = [
  { lat: 24.943470, lng: 121.426211 },
  { lat: 24.949177, lng: 121.426137 },
  { lat: 24.949283, lng: 121.425155 },
  { lat: 24.943934, lng: 121.425153 },
  { lat: 24.944232, lng: 121.423778 },
  { lat: 24.949309, lng: 121.423605 },
  { lat: 24.949477, lng: 121.421862 },
  { lat: 24.944598, lng: 121.422081 },
  { lat: 24.944797, lng: 121.420453 },
  { lat: 24.949613, lng: 121.420118 },
  { lat: 24.949659, lng: 121.418951 },
  { lat: 24.944729, lng: 121.419235 },
  { lat: 24.944815, lng: 121.417576 },
  { lat: 24.949672, lng: 121.417512 },
  { lat: 24.949524, lng: 121.416075 },
  { lat: 24.944856, lng: 121.415857 },
  { lat: 24.945433, lng: 121.414711 },
  { lat: 24.948683, lng: 121.414756 },
  { lat: 24.948509, lng: 121.426081 },
  { lat: 24.947338, lng: 121.426217 },
  { lat: 24.947412, lng: 121.414947 },
  { lat: 24.946522, lng: 121.414628 },
  { lat: 24.946233, lng: 121.426181 },
  { lat: 24.945021, lng: 121.426435 },
  { lat: 24.945461, lng: 121.414522 },
  { lat: 24.944793, lng: 121.414799 },
]

const PARK_FOREST_HILL_POINTS: LatLng[] = [
  { lat: 35.21799629370032, lng: 128.69858980178833 },
  { lat: 35.217961233409895, lng: 128.6983162164688 },
  { lat: 35.21820665512493, lng: 128.69852006435394 },
  { lat: 35.21848713617636, lng: 128.69824647903442 },
  { lat: 35.21821980269588, lng: 128.69814455509186 },
  { lat: 35.217978763557, lng: 128.697988986969 },
  { lat: 35.218180359976685, lng: 128.69780659675598 },
  { lat: 35.218026971442036, lng: 128.6976456642151 },
  { lat: 35.21791740802553, lng: 128.69739890098572 },
  { lat: 35.21759748200292, lng: 128.69737207889557 },
  { lat: 35.217330145592285, lng: 128.69704484939575 },
  { lat: 35.21668152244453, lng: 128.69677662849426 },
  { lat: 35.216436096118066, lng: 128.69563937187195 },
  { lat: 35.214910930170184, lng: 128.69718432426453 },
  { lat: 35.215147595730045, lng: 128.70100378990173 },
  { lat: 35.21655880937404, lng: 128.70136857032776 },
  { lat: 35.21636597417423, lng: 128.7024736404419 },
  { lat: 35.21758433433119, lng: 128.70039224624634 },
  { lat: 35.21781222700657, lng: 128.6980426311493 },
  { lat: 35.21729070244076, lng: 128.69742572307587 },
  { lat: 35.21658510504762, lng: 128.69713068008423 },
  { lat: 35.216330913179604, lng: 128.69609534740448 },
  { lat: 35.215156361107894, lng: 128.69734525680542 },
  { lat: 35.215327285786906, lng: 128.70076775550842 },
  { lat: 35.216712200683155, lng: 128.70112717151642 },
  { lat: 35.21651936584773, lng: 128.70197474956512 },
  { lat: 35.217356441015994, lng: 128.70030641555786 },
  { lat: 35.21755803898132, lng: 128.6982250213623 },
  { lat: 35.217154842549945, lng: 128.6977207660675 },
  { lat: 35.21633529580475, lng: 128.69739890098572 },
  { lat: 35.2160635725975, lng: 128.69676053524017 },
  { lat: 35.21536672989249, lng: 128.69753301143646 },
  { lat: 35.215546419464296, lng: 128.70059609413147 },
  { lat: 35.21686120910585, lng: 128.70095551013947 },
  { lat: 35.217189903188704, lng: 128.69994163513184 },
  { lat: 35.21732576302085, lng: 128.69836449623108 },
  { lat: 35.21693571321462, lng: 128.69796216487885 },
  { lat: 35.216199434314824, lng: 128.69753301143646 },
  { lat: 35.21596277182157, lng: 128.69718432426453 },
  { lat: 35.215585863463396, lng: 128.69769394397736 },
  { lat: 35.21572172598025, lng: 128.70047271251678 },
  { lat: 35.21672534849615, lng: 128.70072484016418 },
  { lat: 35.216988304309055, lng: 128.69981288909912 },
  { lat: 35.217128547060945, lng: 128.69846642017365 },
  { lat: 35.216720965892044, lng: 128.6980640888214 },
  { lat: 35.21607672051556, lng: 128.69773149490356 },
  { lat: 35.215940858592845, lng: 128.69756519794464 },
  { lat: 35.21578308317142, lng: 128.69787096977234 },
  { lat: 35.21589703211765, lng: 128.7003493309021 },
  { lat: 35.21662454854203, lng: 128.70052099227905 },
  { lat: 35.21677793972689, lng: 128.69974315166473 },
  { lat: 35.21690503506047, lng: 128.69857370853424 },
  { lat: 35.21653251369197, lng: 128.69813919067383 },
  { lat: 35.21592771065278, lng: 128.6979353427887 },
  { lat: 35.21609425106968, lng: 128.70022594928741 },
  { lat: 35.216444861356806, lng: 128.70029032230377 },
  { lat: 35.21663331376039, lng: 128.69961977005005 },
  { lat: 35.21676040932043, lng: 128.6986219882965 },
  { lat: 35.216501835385436, lng: 128.6983323097229 },
  { lat: 35.21610739898277, lng: 128.69823575019836 },
  { lat: 35.21624326062674, lng: 128.70015621185303 },
  { lat: 35.21640103515372, lng: 128.69970560073853 },
  { lat: 35.21653251369197, lng: 128.6987668275833 },
  { lat: 35.21628270428725, lng: 128.69850933551788 },
  { lat: 35.2163133826766, lng: 128.69921743869781 },
  { lat: 35.217869200075405, lng: 128.69877755641937 },
]

const PARK_POINT_LOOP_18_POINTS: LatLng[] = [
  { lat: 24.980714, lng: 121.527661 },
  { lat: 24.979811, lng: 121.529093 },
  { lat: 24.979704, lng: 121.529002 },
  { lat: 24.980570, lng: 121.527650 },
  { lat: 24.980439, lng: 121.527570 },
  { lat: 24.979640, lng: 121.528932 },
  { lat: 24.979545, lng: 121.528849 },
  { lat: 24.980337, lng: 121.527481 },
  { lat: 24.980225, lng: 121.527387 },
  { lat: 24.979433, lng: 121.528753 },
  { lat: 24.979311, lng: 121.528651 },
  { lat: 24.980136, lng: 121.527307 },
  { lat: 24.980050, lng: 121.527205 },
  { lat: 24.979209, lng: 121.528554 },
  { lat: 24.979107, lng: 121.528474 },
  { lat: 24.979960, lng: 121.527119 },
  { lat: 24.979880, lng: 121.527041 },
  { lat: 24.979024, lng: 121.528393 },
  { lat: 24.978925, lng: 121.528324 },
  { lat: 24.979864, lng: 121.526905 },
]

const GANNONG_BRIDGE_ROADSIDE_POT_POINTS: LatLng[] = [
  { lat: 25.061062990864123, lng: 121.4405788592285 },
  { lat: 25.061079743069133, lng: 121.4406111320732 },
  { lat: 25.060961595596293, lng: 121.44066359418805 },
  { lat: 25.06084056446335, lng: 121.44073208595805 },
  { lat: 25.06066455379533, lng: 121.4408537113961 },
  { lat: 25.060696525182752, lng: 121.44085228063808 },
  { lat: 25.060840402688942, lng: 121.44075892082674 },
]

function offsetPoint(center: LatLng, northM: number, eastM: number): LatLng {
  const lat = center.lat + northM / 111_320
  const longitudeScale = Math.max(0.2, Math.cos(center.lat * Math.PI / 180))
  return { lat, lng: center.lng + eastM / (111_320 * longitudeScale) }
}

export function buildPresetRoutes(center: LatLng | null, translate: GpxPresetTranslate): SavedRoute[] {
  const now = 0
  const fixedRoutes: SavedRoute[] = [
    {
      id: 'preset-park-forest-pots',
      name: translate('route_library.preset.park_forest_pots'),
      source_mode: 'route_loop',
      waypoints: PARK_FOREST_POT_POINTS,
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-forest-pot',
      name: translate('route_library.preset.forest_pot'),
      source_mode: 'route_loop',
      waypoints: FOREST_POT_POINTS,
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-park-forest-hill-points',
      name: translate('route_library.preset.park_forest_hill'),
      source_mode: 'route_loop',
      waypoints: PARK_FOREST_HILL_POINTS,
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-park-points-18',
      name: translate('route_library.preset.park_points_18'),
      source_mode: 'route_loop',
      waypoints: PARK_POINT_LOOP_18_POINTS,
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-gannong-bridge-roadside-pot',
      name: translate('route_library.preset.gannong_bridge_roadside_pot'),
      source_mode: 'route_loop',
      waypoints: GANNONG_BRIDGE_ROADSIDE_POT_POINTS,
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    ...createGpxPresetRoutes(translate),
  ]
  if (!center) return fixedRoutes
  return [
    ...fixedRoutes,
    {
      id: 'preset-nearby-loop',
      name: translate('route_library.preset.loop'),
      source_mode: 'route_loop',
      waypoints: [
        offsetPoint(center, 100, -100),
        offsetPoint(center, 100, 100),
        offsetPoint(center, -100, 100),
        offsetPoint(center, -100, -100),
      ],
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: false },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-nearby-patrol',
      name: translate('route_library.preset.patrol'),
      source_mode: 'multi_stop',
      waypoints: [
        offsetPoint(center, 0, 0), offsetPoint(center, 80, 45), offsetPoint(center, 40, 130),
        offsetPoint(center, -55, 120), offsetPoint(center, -95, 25), offsetPoint(center, -35, -65),
      ],
      runtime_config: { ...PRESET_ROUTE_MOTION, straight_line: true, pause_enabled: true, pause_min: 5, pause_max: 15 },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-nearby-flowers',
      name: translate('route_library.preset.flowers'),
      source_mode: 'flower',
      waypoints: [
        offsetPoint(center, 60, -60), offsetPoint(center, 60, 60),
        offsetPoint(center, -60, 60), offsetPoint(center, -60, -60),
      ],
      runtime_config: {
        ...PRESET_ROUTE_MOTION, straight_line: true,
        flower_radius: 30, flower_circles: 1, flower_segments: 16,
        flower_path_strategy: 'center_spiral', flower_pre_wait: 0,
        flower_post_wait: 2, flower_route_type: 'stop_at_end', flower_rounds: 1,
      },
      created_at: now,
      updated_at: now,
    },
  ]
}

function pathDistanceKm(points: SavedRoute['waypoints']): number {
  let meters = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const meanLat = (previous.lat + current.lat) * Math.PI / 360
    const north = (current.lat - previous.lat) * 111_320
    const east = (current.lng - previous.lng) * 111_320 * Math.cos(meanLat)
    meters += Math.hypot(north, east)
  }
  return meters / 1000
}

function MiniPath({ points }: { points: SavedRoute['waypoints'] }) {
  const polyline = useMemo(() => {
    if (!points.length) return ''
    const lats = points.map((point) => point.lat)
    const lngs = points.map((point) => point.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const latRange = Math.max(0.000001, maxLat - minLat)
    const lngRange = Math.max(0.000001, maxLng - minLng)
    return points.map((point) => {
      const x = 8 + ((point.lng - minLng) / lngRange) * 84
      const y = 34 - ((point.lat - minLat) / latRange) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [points])

  return (
    <svg className="route-library__mini-path" viewBox="0 0 100 42" aria-hidden="true">
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        if (!polyline) return null
        const [x, y] = polyline.split(' ')[index].split(',')
        return <circle key={`${point.lat}-${point.lng}-${index}`} cx={x} cy={y} r={index === 0 ? 3.2 : 2.1} />
      })}
    </svg>
  )
}

export function RouteLibraryButton({ deviceId, currentMode, waypoints, runtimeConfig, anchor, disabled = false, onLoad }: Props) {
  const t = useT()
  const [opened, setOpened] = useState(false)
  const [view, setView] = useState<View>('list')
  const [tab, setTab] = useState<'presets' | 'mine'>('presets')
  const [routes, setRoutes] = useState<SavedRoute[]>([])
  const [selected, setSelected] = useState<SavedRoute | null>(null)
  const [pendingTarget, setPendingTarget] = useState<SavedRouteMode | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const builtIns = useMemo(() => buildPresetRoutes(anchor ?? waypoints[0] ?? null, t), [anchor, t, waypoints])

  const modeLabel = (mode: SavedRouteMode) => t(`route_library.mode.${mode}`)

  async function openLibrary() {
    setOpened(true)
    setView('list')
    setLoading(true)
    try {
      setRoutes(await listSavedRoutes())
    } catch (err) {
      notify.failure(err, t('route_library.load_failed'), { id: 'route-library:load' })
    } finally {
      setLoading(false)
    }
  }

  function chooseRoute(route: SavedRoute) {
    setSelected(route)
    setPendingTarget(null)
    setView('actions')
  }

  function requestLoad(target: SavedRouteMode) {
    if (!selected) return
    if (selected.source_mode === target) {
      onLoad(selected, target)
      setOpened(false)
      return
    }
    setPendingTarget(target)
    setView('confirm')
  }

  function confirmCoordinateOnlyLoad() {
    if (!selected || !pendingTarget) return
    onLoad(selected, pendingTarget)
    setOpened(false)
  }

  async function saveCurrent() {
    if (!name.trim() || waypoints.length === 0) return
    setLoading(true)
    try {
      const created = await createSavedRoute({
        name: name.trim(),
        source_mode: currentMode,
        waypoints,
        runtime_config: runtimeConfig,
      })
      setRoutes((current) => [created, ...current])
      setName('')
      setTab('mine')
      setView('list')
      notify.success(t('route_library.save_success'), { id: 'route-library:save' })
    } catch (err) {
      notify.failure(err, t('route_library.save_failed'), { id: 'route-library:save' })
    } finally {
      setLoading(false)
    }
  }

  async function removeRoute(route: SavedRoute) {
    setLoading(true)
    try {
      await deleteSavedRoute(route.id)
      setRoutes((current) => current.filter((item) => item.id !== route.id))
      setSelected(null)
      setView('list')
      notify.success(t('route_library.delete_success'), { id: 'route-library:delete' })
    } catch (err) {
      notify.failure(err, t('route_library.delete_failed'), { id: 'route-library:delete' })
    } finally {
      setLoading(false)
    }
  }

  const visibleRoutes = tab === 'presets' ? builtIns : routes

  return (
    <>
      <Tooltip label={t('route_library.title')}>
        <Button
          className="route-library__trigger"
          variant="light"
          color="gray"
          size="compact-xs"
          leftSection={<IconBookmark size={14} />}
          disabled={disabled || !deviceId}
          onClick={() => void openLibrary()}
          aria-label={t('route_library.open')}
        >
          {t('route_library.trigger')}
        </Button>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={view === 'list' ? t('route_library.title') : selected?.name ?? t('route_library.title')}
        centered
        size="sm"
        className="route-library"
      >
        {view === 'list' && (
          <Stack gap="sm" className="route-library__list-view">
            <SegmentedControl
              fullWidth
              size="xs"
              value={tab}
              onChange={(value) => setTab(value as 'presets' | 'mine')}
              data={[
                { value: 'presets', label: t('route_library.presets') },
                { value: 'mine', label: t('route_library.mine') },
              ]}
            />
            {loading && <Text size="sm" c="dimmed">{t('generic.working')}</Text>}
            {!loading && visibleRoutes.length === 0 && (
              <Alert color="gray" variant="light">
                {tab === 'presets' ? t('route_library.preset_needs_location') : t('route_library.empty')}
              </Alert>
            )}
            <Stack gap="xs" className="route-library__list">
              {visibleRoutes.map((route) => (
                <div className="route-library__card" key={route.id}>
                  <UnstyledButton className="route-library__card-main" onClick={() => chooseRoute(route)}>
                    <MiniPath points={route.waypoints} />
                    <div className="route-library__card-copy">
                      <Text size="sm" fw={650} lineClamp={1}>{route.name}</Text>
                      <Group gap={5} wrap="wrap">
                        <Badge size="xs" variant="light">{modeLabel(route.source_mode)}</Badge>
                        <Text size="xs" c="dimmed">{route.waypoints.length} {t('route_library.points')}</Text>
                        <Text size="xs" c="dimmed">{pathDistanceKm(route.waypoints).toFixed(1)} km</Text>
                      </Group>
                    </div>
                  </UnstyledButton>
                  {tab === 'mine' && (
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      size="sm"
                      disabled={loading}
                      onClick={() => {
                        setSelected(route)
                        setView('delete')
                      }}
                      aria-label={t('route_library.delete')}
                    >
                      <IconTrash size={15} />
                    </ActionIcon>
                  )}
                </div>
              ))}
            </Stack>
            <Button
              variant="light"
              leftSection={<IconPlus size={15} />}
              disabled={waypoints.length === 0}
              onClick={() => {
                setName(`${modeLabel(currentMode)}（${waypoints.length} ${t('route_library.points')}）`)
                setView('save')
              }}
            >
              {t('route_library.save_current')}
            </Button>
          </Stack>
        )}

        {view === 'actions' && selected && (
          <Stack gap="sm">
            <Button variant="subtle" size="compact-sm" className="route-library__back" leftSection={<IconArrowLeft size={14} />} onClick={() => setView('list')}>
              {t('route_library.back')}
            </Button>
            <div className="route-library__detail-preview">
              <MiniPath points={selected.waypoints} />
            </div>
            <div className="route-library__detail-meta">
              <Badge variant="light">{t('route_library.saved_from').replace('{mode}', modeLabel(selected.source_mode))}</Badge>
              <Text size="xs" c="dimmed">{selected.waypoints.length} {t('route_library.points')}</Text>
            </div>
            <Text size="sm" c="dimmed">{t('route_library.choose_target')}</Text>
            {MODE_ORDER.map((mode) => {
              const sameMode = mode === selected.source_mode
              const Icon = mode === 'route_loop' ? IconRepeat : mode === 'flower' ? IconFlower : IconRoute2
              return (
                <Button
                  key={mode}
                  className="route-library__load-button"
                  variant={sameMode ? 'filled' : 'default'}
                  onClick={() => requestLoad(mode)}
                >
                  <span className="route-library__load-button-content">
                    <Icon size={17} />
                    <span>{t('route_library.load_to').replace('{mode}', modeLabel(mode))}</span>
                    <Badge size="xs" variant={sameMode ? 'white' : 'light'}>{t(sameMode ? 'route_library.full_load' : 'route_library.coordinates_only')}</Badge>
                  </span>
                </Button>
              )
            })}
          </Stack>
        )}

        {view === 'confirm' && selected && pendingTarget && (
          <Stack gap="md">
            <Button variant="subtle" size="compact-sm" className="route-library__back" leftSection={<IconArrowLeft size={14} />} onClick={() => setView('actions')}>
              {t('route_library.back')}
            </Button>
            <Alert color="yellow" title={t('route_library.cross_mode_title')}>
              {t('route_library.cross_mode_description')
                .replace('{source}', modeLabel(selected.source_mode))
                .replace('{target}', modeLabel(pendingTarget))
                .replace('{count}', String(selected.waypoints.length))}
            </Alert>
            <Group grow>
              <Button variant="default" onClick={() => setView('actions')}>{t('favorites.cancel')}</Button>
              <Button onClick={confirmCoordinateOnlyLoad}>{t('route_library.load_coordinates')}</Button>
            </Group>
          </Stack>
        )}

        {view === 'save' && (
          <Stack gap="md">
            <Button variant="subtle" size="compact-sm" className="route-library__back" leftSection={<IconArrowLeft size={14} />} onClick={() => setView('list')}>
              {t('route_library.back')}
            </Button>
            <TextInput
              label={t('route_library.name')}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={80}
              autoFocus
            />
            <Alert color="blue" variant="light">
              {t('route_library.save_description')
                .replace('{count}', String(waypoints.length))
                .replace('{mode}', modeLabel(currentMode))}
            </Alert>
            <Group grow>
              <Button variant="default" onClick={() => setView('list')}>{t('favorites.cancel')}</Button>
              <Button loading={loading} disabled={!name.trim()} onClick={() => void saveCurrent()}>{t('favorites.save')}</Button>
            </Group>
          </Stack>
        )}

        {view === 'delete' && selected && (
          <Stack gap="md">
            <Alert color="red" title={t('route_library.delete_title')}>
              {t('route_library.delete_description').replace('{name}', selected.name)}
            </Alert>
            <Group grow>
              <Button variant="default" onClick={() => setView('list')}>{t('favorites.cancel')}</Button>
              <Button color="red" loading={loading} onClick={() => void removeRoute(selected)}>{t('route_library.delete')}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
