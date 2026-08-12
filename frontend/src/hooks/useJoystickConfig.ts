import { useEffect, useState } from 'react'
import type { CurveMode } from '../utils/joystickPhysics'

export const JOYSTICK_STORAGE_KEY = 'arcwayfarer.joystick_config'

export interface JoystickConfig {
  isDynamic: boolean
  curveMode: CurveMode
  curveExponent: number
  enableKeyboardRamp: boolean
}

export const DEFAULT_JOYSTICK_CONFIG: JoystickConfig = {
  isDynamic: true,
  curveMode: 'power',
  curveExponent: 2.0,
  enableKeyboardRamp: true,
}

export function useJoystickConfig() {
  const [config, setConfig] = useState<JoystickConfig>(() => {
    try {
      const saved = localStorage.getItem(JOYSTICK_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return { ...DEFAULT_JOYSTICK_CONFIG, ...parsed }
      }
    } catch (e) {
      console.warn('Failed to load joystick config from localStorage:', e)
    }
    return DEFAULT_JOYSTICK_CONFIG
  })

  useEffect(() => {
    try {
      localStorage.setItem(JOYSTICK_STORAGE_KEY, JSON.stringify(config))
    } catch (e) {
      console.warn('Failed to save joystick config to localStorage:', e)
    }
  }, [config])

  const updateConfig = (partial: Partial<JoystickConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  return { config, updateConfig, setConfig }
}
