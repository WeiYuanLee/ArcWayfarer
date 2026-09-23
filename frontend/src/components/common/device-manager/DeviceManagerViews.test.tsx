// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DeviceListView } from './DeviceListView'
import { QuickReconnectList } from './QuickReconnectList'
import { DirectConnectionFlow } from './DirectConnectionFlow'
import type { ManagedDevice } from './types'

afterEach(cleanup)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

const direct: ManagedDevice = {
  udid: 'phone-a', name: 'Lence', rawName: 'Lence', model: 'iPhone', ios_version: '18.0',
  connection_type: 'wireless_direct', status: 'ready', isActive: true,
}

describe('Device Manager views', () => {
  it('renders exactly one transport badge for a discovered Wireless Direct device', () => {
    render(<MantineProvider><DeviceListView
      devices={[direct]} activeCount={1} deviceStates={{}} pairingBusyId={null} quickReconnects={[]}
      onClose={vi.fn()} onOpenDirect={vi.fn()} onRename={vi.fn()} onToggle={vi.fn()} onPair={vi.fn()}
      onQuickConnect={vi.fn()} onClearQuickReconnects={vi.fn()}
    /></MantineProvider>)
    expect(screen.getAllByText('Wireless Direct')).toHaveLength(2)
    expect(screen.queryByText('USB')).toBeNull()
    expect(screen.queryByText('Wi-Fi')).toBeNull()
  })

  it('limits quick reconnect rendering to the two most recent records', () => {
    const records = ['one', 'two', 'three'].map((name, index) => ({ name, endpoint: `10.0.0.${index + 1}:49152`, ip: `10.0.0.${index + 1}`, timestamp: '2026-09-23 10:00' }))
    render(<MantineProvider><QuickReconnectList records={records} onConnect={vi.fn()} onClear={vi.fn()} /></MantineProvider>)
    expect(screen.getByText('10.0.0.1:49152')).toBeTruthy()
    expect(screen.getByText('10.0.0.2:49152')).toBeTruthy()
    expect(screen.queryByText('10.0.0.3:49152')).toBeNull()
  })

  it('returns from a failed connection to the endpoint list without issuing another command', () => {
    const onBack = vi.fn()
    const onRetry = vi.fn()
    render(<MantineProvider><DirectConnectionFlow
      state={{ status: 'error', targetUdid: 'phone-a', targetName: 'Lence', targetIp: '10.0.0.1', fallbackBonjour: true, port: 49152, errorMessage: '授權已失效' }}
      onBack={onBack} onClose={vi.fn()} onRetry={onRetry}
    /></MantineProvider>)
    fireEvent.click(screen.getByRole('button', { name: '返回端點清單' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
  })
})
