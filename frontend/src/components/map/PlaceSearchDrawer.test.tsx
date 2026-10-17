// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaceSearchDrawer } from './PlaceSearchDrawer'

const mocks = vi.hoisted(() => ({
  clearResults: vi.fn(),
  result: {
    id: 'osm-1',
    name: '開礦村',
    address: '開礦村，公館鄉，苗栗縣，臺灣',
    lat: 24.451,
    lng: 120.8517,
    category: 'administrative',
  },
}))

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../../hooks/usePlaceSearch', () => ({
  usePlaceSearch: () => ({
    results: [mocks.result],
    loading: false,
    errorMsg: null,
    clearResults: mocks.clearResults,
  }),
}))

describe('PlaceSearchDrawer teleport actions', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
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
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => cleanup())

  it('switches the teleport device and teleports directly from a search result', async () => {
    const onTeleportDeviceChange = vi.fn()
    const onTeleportPlace = vi.fn().mockResolvedValue(undefined)
    render(
      <MantineProvider>
        <PlaceSearchDrawer
          isOpen
          onClose={vi.fn()}
          onSelectPlace={vi.fn()}
          onTeleportPlace={onTeleportPlace}
          teleportDisabledReason={null}
          teleportingPlaceId={null}
          teleportDeviceName="Lence"
          teleportDevices={[{ value: 'device-a', label: 'Lence' }, { value: 'device-b', label: 'Moss' }]}
          teleportDeviceId="device-a"
          onTeleportDeviceChange={onTeleportDeviceChange}
        />
      </MantineProvider>,
    )

    const picker = await screen.findByRole('combobox', { name: 'favorites.teleport_device' })
    expect((picker as HTMLSelectElement).value).toBe('device-a')
    fireEvent.change(picker, { target: { value: 'device-b' } })
    expect(onTeleportDeviceChange).toHaveBeenCalledWith('device-b')

    fireEvent.click(screen.getByRole('button', { name: 'teleport.action.set_location：開礦村' }))
    await waitFor(() => expect(onTeleportPlace).toHaveBeenCalledWith({
      id: 'place-search:osm-1',
      name: '開礦村',
      lat: 24.451,
      lng: 120.8517,
    }))
  })

  it('disables result teleport while the selected device is busy', async () => {
    render(
      <MantineProvider>
        <PlaceSearchDrawer
          isOpen
          onClose={vi.fn()}
          onSelectPlace={vi.fn()}
          onTeleportPlace={vi.fn()}
          teleportDisabledReason="teleport.hint.navigating"
          teleportingPlaceId={null}
          teleportDeviceName="Lence"
          teleportDevices={[{ value: 'device-a', label: 'Lence' }]}
          teleportDeviceId="device-a"
          onTeleportDeviceChange={vi.fn()}
        />
      </MantineProvider>,
    )

    expect((await screen.findByRole('button', { name: 'teleport.action.set_location：開礦村' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
