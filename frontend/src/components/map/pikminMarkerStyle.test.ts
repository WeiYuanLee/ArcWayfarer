// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { updatePikminSpotElement } from './pikminMarkerStyle'

describe('MapLibre Pikmin marker styling', () => {
  it('preserves the transform that MapLibre uses to position the marker', () => {
    const marker = document.createElement('button')
    marker.style.transform = 'translate(-50%, -50%) translate(321px, 245px)'

    updatePikminSpotElement(marker, false)
    expect(marker.style.transform).toBe('translate(-50%, -50%) translate(321px, 245px)')

    updatePikminSpotElement(marker, true)
    expect(marker.style.transform).toBe('translate(-50%, -50%) translate(321px, 245px)')
    expect(marker.style.width).toBe('38px')
  })
})
