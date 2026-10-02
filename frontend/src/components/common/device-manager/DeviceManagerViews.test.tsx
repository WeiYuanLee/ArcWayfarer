// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n'
import { DeviceListView } from './DeviceListView'
import { QuickReconnectList } from './QuickReconnectList'
import { DirectConnectionFlow } from './DirectConnectionFlow'
import { DeviceSetupFlow } from './DeviceSetupFlow'
import type { ManagedDevice } from './types'

afterEach(cleanup)
beforeAll(() => {
  window.localStorage.setItem('arcwayfarer.lang', 'zh')
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
    render(<MantineProvider><I18nProvider><DeviceListView
      devices={[direct]} activeCount={1} deviceStates={{}} quickReconnects={[]}
      includeWifi={false} devicesLoading={false}
      onClose={vi.fn()} onOpenDirect={vi.fn()} onRename={vi.fn()} onToggle={vi.fn()} onSetup={vi.fn()}
      onRefresh={vi.fn()} onIncludeWifiChange={vi.fn()}
      onQuickConnect={vi.fn()} onClearQuickReconnects={vi.fn()}
    /></I18nProvider></MantineProvider>)
    expect(screen.getAllByText('Wireless Direct')).toHaveLength(2)
    expect(screen.queryByText('USB')).toBeNull()
    expect(screen.queryByText('Wi-Fi')).toBeNull()
  })

  it('keeps Wi-Fi discovery and device refresh beside the Device Manager close action', () => {
    const onIncludeWifiChange = vi.fn()
    const onRefresh = vi.fn()
    render(<MantineProvider><I18nProvider><DeviceListView
      devices={[]} activeCount={0} deviceStates={{}} quickReconnects={[]}
      includeWifi={false} devicesLoading={false}
      onClose={vi.fn()} onOpenDirect={vi.fn()} onRename={vi.fn()} onToggle={vi.fn()} onSetup={vi.fn()}
      onRefresh={onRefresh} onIncludeWifiChange={onIncludeWifiChange}
      onQuickConnect={vi.fn()} onClearQuickReconnects={vi.fn()}
    /></I18nProvider></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: '開啟 Wi‑Fi 裝置探索' }))
    fireEvent.click(screen.getByRole('button', { name: '重新掃描裝置' }))

    expect(onIncludeWifiChange).toHaveBeenCalledWith(true)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('limits quick reconnect rendering to the two most recent records', () => {
    const onConnect = vi.fn()
    const records = ['one', 'two', 'three'].map((name, index) => ({ name, endpoint: `10.0.0.${index + 1}:49152`, ip: `10.0.0.${index + 1}`, timestamp: '2026-09-23 10:00' }))
    render(<MantineProvider><QuickReconnectList records={records} onConnect={onConnect} onClear={vi.fn()} /></MantineProvider>)
    expect(screen.getByText('10.0.0.1:49152')).toBeTruthy()
    expect(screen.getByText('10.0.0.2:49152')).toBeTruthy()
    expect(screen.queryByText('10.0.0.3:49152')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: '點擊連線' })[0])
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ port: 49152 }))
  })

  it('returns from a failed connection to the endpoint list without issuing another command', () => {
    const onBack = vi.fn()
    const onRetry = vi.fn()
    const onRepairAuthorization = vi.fn()
    render(<MantineProvider><DirectConnectionFlow
      state={{ status: 'error', targetUdid: 'phone-a', targetName: 'Lence', targetIp: '10.0.0.1', fallbackBonjour: true, port: 49152, errorMessage: '授權已失效' }}
      onBack={onBack} onClose={vi.fn()} onRetry={onRetry} onRepairAuthorization={onRepairAuthorization}
    /></MantineProvider>)
    fireEvent.click(screen.getByRole('button', { name: '返回端點清單' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
    expect(onRepairAuthorization).not.toHaveBeenCalled()
  })

  it('separates a network retry from explicit USB authorization repair', () => {
    const onRetry = vi.fn()
    const onRepairAuthorization = vi.fn()
    render(<MantineProvider><DirectConnectionFlow
      state={{ status: 'error', targetUdid: 'phone-a', targetName: 'Lence', targetIp: '10.0.0.1', fallbackBonjour: true, port: 49152, errorMessage: '授權已失效' }}
      onBack={vi.fn()} onClose={vi.fn()} onRetry={onRetry} onRepairAuthorization={onRepairAuthorization}
    /></MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: '再試一次' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRepairAuthorization).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '接上 USB 修復授權' }))
    expect(onRepairAuthorization).toHaveBeenCalledOnce()
  })

  it('explains the explicit trust action before requesting it', () => {
    const onRequestTrust = vi.fn()
    render(<MantineProvider><DeviceSetupFlow
      state={{ step: 'unlock', device: direct }} onBack={vi.fn()} onClose={vi.fn()}
      onRequestTrust={onRequestTrust} onRevealDeveloperMode={vi.fn()} onCheckDeveloperMode={vi.fn()}
    /></MantineProvider>)
    expect(screen.getByText('請先解鎖 iPhone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '我已解鎖，繼續' }))
    expect(onRequestTrust).toHaveBeenCalledOnce()
  })

  it('keeps AMFI terminology out of the Developer Mode onboarding copy', () => {
    render(<MantineProvider><DeviceSetupFlow
      state={{ step: 'developer_mode', device: direct }} onBack={vi.fn()} onClose={vi.fn()}
      onRequestTrust={vi.fn()} onRevealDeveloperMode={vi.fn()} onCheckDeveloperMode={vi.fn()}
    /></MantineProvider>)
    expect(screen.getByText('需要開啟開發者模式')).toBeTruthy()
    expect(screen.queryByText(/AMFI/i)).toBeNull()
  })
})
