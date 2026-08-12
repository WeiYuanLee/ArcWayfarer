import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createMobilePairing, getMobileRemoteStatus, revokeMobileSessions, type MobilePairing } from '../../services/api'

export function MobileRemoteModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [pairing, setPairing] = useState<MobilePairing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [connectedPhones, setConnectedPhones] = useState(0)

  async function refresh() {
    setBusy(true); setError('')
    try {
      const nextPairing = await createMobilePairing()
      setPairing(nextPairing)
      setRemainingSeconds(nextPairing.expires_in)
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : '無法產生 QR Code'
      setError(
        message === 'Request failed (404)' || message === 'Not Found'
          ? '手機遙控後端尚未載入。請完全關閉 ArcWayfarer，再重新啟動後重試。'
          : message,
      )
    }
    finally { setBusy(false) }
  }

  useEffect(() => { if (isOpen) void refresh(); else { setPairing(null); setConnectedPhones(0) } }, [isOpen])
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const updateStatus = async () => {
      try {
        const status = await getMobileRemoteStatus()
        if (!cancelled) setConnectedPhones(status.connected_phones)
      } catch {
        if (!cancelled) setConnectedPhones(0)
      }
    }
    void updateStatus()
    const timer = window.setInterval(() => void updateStatus(), 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [isOpen])
  useEffect(() => {
    if (!pairing || remainingSeconds <= 0) return
    const timer = window.setInterval(() => setRemainingSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [pairing, remainingSeconds > 0])
  if (!isOpen) return null

  const countdown = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`

  return createPortal(<div className="modal-backdrop" onMouseDown={onClose}>
    <section className="mobile-remote-modal" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
      <h2>手機遙控</h2>
      <p>手機與電腦連同一個 Wi‑Fi 後，掃描 QR Code，再輸入下方配對碼。</p>
      {pairing && <><img className="remote-qr" src={pairing.qr_data_url} alt="手機遙控 QR Code" /><code className="remote-pin">{pairing.pin}</code><small className={remainingSeconds === 0 ? 'remote-expired' : undefined}>{remainingSeconds === 0 ? 'QR Code 已失效，請重新產生。' : `QR Code 剩餘 ${countdown} 後失效。`}</small><p className="remote-url">{pairing.url.replace(/#pair=.*/, '')}</p></>}
      {error && <p className="mobile-error">{error}</p>}
      {connectedPhones > 0 && <p className="remote-connected">已連線 {connectedPhones} 支手機</p>}
      <div className="remote-actions"><button onClick={() => void refresh()} disabled={busy}>{busy ? '產生中…' : '重新產生 QR'}</button>{connectedPhones > 0 && <button className="danger" onClick={() => void revokeMobileSessions().then(() => setConnectedPhones(0))}>中斷手機連線</button>}</div>
    </section>
  </div>, document.body)
}
