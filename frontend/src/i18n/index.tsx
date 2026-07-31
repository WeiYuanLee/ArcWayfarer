import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { STRINGS, type Lang, type StringKey } from './strings'

type I18nContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: StringKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = 'arcwayfarer.lang'

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // ignore
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // ignore
    }
  }, [])

  const t = useCallback((key: StringKey) => STRINGS[key]?.[lang] ?? key, [lang])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'
  }, [lang])

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function useT() {
  return useI18n().t
}

export type { Lang, StringKey }
