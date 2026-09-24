// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { StatusBar } from './StatusBar'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

describe('StatusBar', () => {
  beforeEach(() => {
    localStorage.setItem('arcwayfarer.lang', 'zh')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T00:05:00Z'))
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('omits status badges and displays the selected coordinate local time', () => {
    render(<MantineProvider><I18nProvider><StatusBar
      livePosition={null} liveSpeedMps={null} lat={25.033} lng={121.565}
    /></I18nProvider></MantineProvider>)

    expect(screen.queryByText('待命')).toBeNull()
    expect(screen.getByText('09/23 08:05')).toBeTruthy()
  })
})
