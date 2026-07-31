import { useEffect, useRef, useState } from 'react'
import * as api from '../../services/api'
import { useI18n } from '../../i18n'

type Props = {
  deviceId: string | null
}

export function DevMenuButton({ deviceId }: Props) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [message])

  async function handleRevealDeveloperMode() {
    if (!deviceId) return
    setBusy(true)
    setMessage(null)
    try {
      await api.amfiRevealDeveloperMode(deviceId)
      setMessage(t('devmenu.amfi_success'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('devmenu.amfi_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dev-menu" ref={rootRef}>
      <button
        type="button"
        className="dev-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        title={t('devmenu.title')}
      >
        ⚙️
      </button>
      {open && (
        <div className="dev-menu-dropdown">
          <button
            type="button"
            disabled={!deviceId || busy}
            title={deviceId ? undefined : t('devmenu.select_device_first')}
            onClick={handleRevealDeveloperMode}
          >
            {busy ? t('generic.working') : t('devmenu.amfi_reveal')}
          </button>
          {message && <div className="dev-menu-message">{message}</div>}

          <hr className="dev-menu-divider" />

          <div className="dev-menu-lang">
            <span>{t('devmenu.lang_label')}</span>
            <button type="button" className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>
              中文
            </button>
            <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
