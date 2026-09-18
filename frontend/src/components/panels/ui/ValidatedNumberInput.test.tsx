// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n'
import { ValidatedNumberInput } from './ValidatedNumberInput'

describe('ValidatedNumberInput', () => {
  beforeEach(() => {
    localStorage.setItem('arcwayfarer.lang', 'zh')
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
  })
  afterEach(cleanup)

  it('保留全形或文字輸入並顯示錯誤，不回填預設數值', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <ValidatedNumberInput label="圖案大小（公里）" value={0.2} min={0.01} onChange={onChange} onValidityChange={onValidityChange} />
        </I18nProvider>
      </MantineProvider>,
    )

    const input = screen.getByLabelText('圖案大小（公里）') as HTMLInputElement
    fireEvent.change(input, { target: { value: '１２公里' } })

    expect(input.value).toBe('１２公里')
    expect(screen.getByText('請輸入有效的半形數字。')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
  })

  it('有效數字才更新數值，超出範圍時保留輸入並警告', () => {
    const onChange = vi.fn()
    render(
      <MantineProvider>
        <I18nProvider>
          <ValidatedNumberInput label="花朵半徑（公尺）" value={30} min={5} max={100} onChange={onChange} />
        </I18nProvider>
      </MantineProvider>,
    )

    const input = screen.getByLabelText('花朵半徑（公尺）') as HTMLInputElement
    fireEvent.change(input, { target: { value: '45' } })
    expect(onChange).toHaveBeenLastCalledWith(45)

    fireEvent.change(input, { target: { value: '120' } })
    expect(input.value).toBe('120')
    expect(screen.getByText('數值超出允許範圍。')).toBeTruthy()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
