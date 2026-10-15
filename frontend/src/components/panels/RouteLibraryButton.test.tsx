// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { buildPresetRoutes, RouteLibraryButton } from './RouteLibraryButton'
import { createGpxPresetRoutes } from './gpxPresetRoutes'

const mocks = vi.hoisted(() => ({
  createSavedRoute: vi.fn(),
  deleteSavedRoute: vi.fn(),
  listSavedRoutes: vi.fn(),
}))

vi.mock('../../services/api', () => mocks)

describe('RouteLibraryButton', () => {
  beforeEach(() => {
    localStorage.setItem('arcwayfarer.lang', 'zh')
    mocks.listSavedRoutes.mockReset().mockResolvedValue([])
    mocks.createSavedRoute.mockReset()
    mocks.deleteSavedRoute.mockReset()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows a clearly labeled route favorites trigger', () => {
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={vi.fn()}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    expect(screen.getByRole('button', { name: '開啟路徑收藏' }).textContent).toContain('路徑收藏')
  })

  it('warns and sends coordinates-only intent when a preset is loaded into another mode', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="multi_stop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={{ lat: 25.033, lng: 121.535 }}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('附近方形循環'))
    fireEvent.click(screen.getByRole('button', { name: /載入多點巡迴/ }))

    expect(screen.getByText('將以不同模式載入')).toBeDefined()
    expect(onLoad).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '載入座標' }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-nearby-loop', source_mode: 'route_loop' }),
      'multi_stop',
    ))
  })

  it('offers the fixed park and forest pot route as a route loop without a location anchor', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('公園盆・森林盆雙盆巡迴'))
    expect(screen.getByText('97 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-park-forest-pots',
        source_mode: 'route_loop',
        waypoints: expect.arrayContaining([
          { lat: 39.272962, lng: 9.067519 },
          { lat: 39.272917, lng: 9.067175 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('offers the fixed forest pot point route as a route loop', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('森林盆純點巡迴'))
    expect(screen.getByText('26 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-forest-pot',
        source_mode: 'route_loop',
        waypoints: expect.arrayContaining([
          { lat: 24.943470, lng: 121.426211 },
          { lat: 24.944793, lng: 121.414799 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('offers the fixed park, forest, and hill point route as a route loop', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('公園・森林・山丘純點巡迴'))
    expect(screen.getByText('66 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-park-forest-hill-points',
        source_mode: 'route_loop',
        waypoints: expect.arrayContaining([
          { lat: 35.21799629370032, lng: 128.69858980178833 },
          { lat: 35.217869200075405, lng: 128.69877755641937 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('offers the fixed park point route with the shared cycling speed', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('公園純點巡迴'))
    expect(screen.getByText('20 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-park-points-18',
        source_mode: 'route_loop',
        runtime_config: expect.objectContaining({ nav_mode: 'bike', speed_kmh: 18.9 }),
        waypoints: expect.arrayContaining([
          { lat: 24.980714, lng: 121.527661 },
          { lat: 24.979864, lng: 121.526905 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('offers the Gannong Bridge roadside pot route as a route loop', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    fireEvent.click(await screen.findByText('幹農大橋路邊盆'))
    expect(screen.getByText('7 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-gannong-bridge-roadside-pot',
        source_mode: 'route_loop',
        runtime_config: expect.objectContaining({ nav_mode: 'bike', speed_kmh: 18.9 }),
        waypoints: expect.arrayContaining([
          { lat: 25.061062990864123, lng: 121.4405788592285 },
          { lat: 25.060840402688942, lng: 121.44075892082674 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('preserves all parsed GPX routes and their point counts', () => {
    const routes = createGpxPresetRoutes((key) => key)
    expect(routes).toHaveLength(21)
    expect(routes.reduce((total, route) => total + route.waypoints.length, 0)).toBe(288)
    expect(routes.map((route) => [route.id, route.waypoints.length])).toEqual([
      ['preset-gpx-stadium-us', 11],
      ['preset-gpx-stadium-es', 13],
      ['preset-gpx-stadium-zuoying', 13],
      ['preset-gpx-stadium-north-korea', 18],
      ['preset-gpx-park-rome-d', 11],
      ['preset-gpx-park-rome-c', 12],
      ['preset-gpx-park-rome-b', 9],
      ['preset-gpx-park-rome-a', 9],
      ['preset-gpx-ticket-tokyo', 14],
      ['preset-gpx-ticket-kyoto', 16],
      ['preset-gpx-ticket-nagoya', 13],
      ['preset-gpx-ticket-osaka', 12],
      ['preset-gpx-supermarket-b', 12],
      ['preset-gpx-supermarket-a', 17],
      ['preset-gpx-forest-d', 14],
      ['preset-gpx-forest-c', 13],
      ['preset-gpx-forest-b', 16],
      ['preset-gpx-forest-a', 14],
      ['preset-gpx-shrine-shokokuji', 16],
      ['preset-gpx-shrine-jojoji', 18],
      ['preset-gpx-shrine-daitokuji', 17],
    ])
    expect(routes.every((route) => route.source_mode === 'route_loop')).toBe(true)
    expect(routes.every((route) => route.runtime_config.nav_mode === 'bike')).toBe(true)
    expect(routes.every((route) => route.runtime_config.speed_kmh === 18.9)).toBe(true)
    expect(routes[0].waypoints[0]).toEqual({ lat: 40.813275, lng: -77.854231 })
    expect(routes.at(-1)?.waypoints.at(-1)).toEqual({ lat: 35.045291, lng: 135.745275 })
  })

  it('shows imported GPX presets and loads one as a complete route loop', async () => {
    const onLoad = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <RouteLibraryButton
            deviceId="dev-1"
            currentMode="route_loop"
            waypoints={[]}
            runtimeConfig={{}}
            anchor={null}
            onLoad={onLoad}
          />
        </I18nProvider>
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟路徑收藏' }))
    const importedNames = [
      '體育館純點US', '體育館純點ES', '體育館純點左營', '體育館純點北韓',
      '公園純點羅馬D', '公園純點羅馬C', '公園純點羅馬B', '公園純點羅馬A',
      '票卷純點東京', '票卷純點京都', '票卷純點名古屋', '票卷純點大阪',
      '超市純點路線B', '超市純點路線A',
      '森林純點D', '森林純點C', '森林純點B', '森林純點A',
      '神社純點相國寺', '神社純點十乘寺', '神社純點大德寺',
    ]
    for (const name of importedNames) expect(await screen.findByText(name)).toBeDefined()

    fireEvent.click(screen.getByText('體育館純點US'))
    expect(screen.getByText('11 點')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /載入路線循環/ }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-gpx-stadium-us',
        source_mode: 'route_loop',
        runtime_config: expect.objectContaining({ nav_mode: 'bike', speed_kmh: 18.9 }),
        waypoints: expect.arrayContaining([
          { lat: 40.813275, lng: -77.854231 },
          { lat: 40.813061, lng: -77.854245 },
        ]),
      }),
      'route_loop',
    ))
  })

  it('uses cycling at 18.9 km/h for every built-in preset', () => {
    const routes = buildPresetRoutes({ lat: 25.033, lng: 121.535 }, (key) => key)
    expect(routes).toHaveLength(29)
    expect(routes.every((route) => route.runtime_config.nav_mode === 'bike')).toBe(true)
    expect(routes.every((route) => route.runtime_config.speed_kmh === 18.9)).toBe(true)
  })
})
