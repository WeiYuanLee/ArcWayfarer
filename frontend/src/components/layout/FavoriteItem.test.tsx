// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { FavoriteItem } from './FavoriteItem'
import type { Favorite } from '../../services/api'

vi.mock('@dnd-kit/sortable', () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: undefined, isDragging: false }) }))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
  localStorage.setItem('arcwayfarer.lang', 'zh')
})
afterEach(cleanup)

const favorite = { id: 'favorite-1', name: '墨西哥', lat: 19.0948, lng: -103.62249, group: '', notes: '', created_at: 0, order: 0 } as Favorite

function setup(disabledReason: string | null = null, pendingId: string | null = null, groups: string[] = []) {
  const onSelect = vi.fn()
  const onTeleportFavorite = vi.fn(async () => {})
  render(<MantineProvider><I18nProvider><FavoriteItem favorite={favorite} sortMode="name" groups={groups} onSelect={onSelect} onUpdate={vi.fn()} onDelete={vi.fn()} onTeleportFavorite={onTeleportFavorite} teleportDisabledReason={disabledReason} teleportingFavoriteId={pendingId} teleportDeviceName="iPhone A" /></I18nProvider></MantineProvider>)
  return { onSelect, onTeleportFavorite }
}

describe('FavoriteItem teleport action', () => {
  it('keeps preview and teleport as separate actions', () => {
    const { onSelect, onTeleportFavorite } = setup()
    fireEvent.click(screen.getByText('墨西哥'))
    expect(onSelect).toHaveBeenCalledWith(favorite.lat, favorite.lng)
    expect(onTeleportFavorite).not.toHaveBeenCalled()
    onSelect.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '瞬移至此：墨西哥' }))
    expect(onTeleportFavorite).toHaveBeenCalledWith(favorite)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('blocks teleport while the selected device is unavailable', () => {
    const { onTeleportFavorite } = setup('請先選擇裝置')
    const button = screen.getByRole('button', { name: '瞬移至此：墨西哥' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onTeleportFavorite).not.toHaveBeenCalled()
  })

  it('blocks other favorites while a teleport is pending', () => {
    const { onTeleportFavorite } = setup(null, 'another-favorite')
    const button = screen.getByRole('button', { name: '瞬移至此：墨西哥' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onTeleportFavorite).not.toHaveBeenCalled()
  })

  it('only allows choosing an existing group while editing', () => {
    setup(null, null, ['卡菇', '地點'])
    fireEvent.click(screen.getByRole('button', { name: '重新命名' }))
    const groupSelect = screen.getAllByLabelText('群組')[0] as HTMLInputElement
    expect(groupSelect.readOnly).toBe(true)
    fireEvent.click(groupSelect)
    expect(screen.getByRole('option', { name: '卡菇' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '地點' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '未分組' })).toBeTruthy()
  })
})
