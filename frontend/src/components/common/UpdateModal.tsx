import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import {
  checkForUpdates,
  openDownloadLink,
  type CheckUpdateResult,
  type PlatformEnv,
} from '../../services/updateService'

type Props = {
  isOpen: boolean
  onClose: () => void
  checkResult: CheckUpdateResult | null
  loading: boolean
  onRecheck: () => void
}

export function UpdateModal({ isOpen, onClose, checkResult, loading, onRecheck }: Props) {
  const t = useT()
  const [showAllPlatforms, setShowAllPlatforms] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentVersion = checkResult?.currentVersion || '0.1.0'
  const latestRelease = checkResult?.latestRelease
  const hasUpdate = checkResult?.hasUpdate ?? false
  const currentEnv = checkResult?.currentEnv || 'mac-arm64'

  const envLabels: Record<PlatformEnv, { name: string; icon: string }> = {
    'mac-arm64': { name: t('version.env.mac_arm64'), icon: '🍏' },
    'mac-x64': { name: t('version.env.mac_x64'), icon: '🍎' },
    'win-x64': { name: t('version.env.win_x64'), icon: '🪟' },
  }

  const primaryDownloadUrl = latestRelease?.downloadUrls[currentEnv] || latestRelease?.htmlUrl || ''

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={backdropStyle}>
      <div
        role="dialog"
        aria-modal="true"
        className="modal-card update-modal-card"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🚀</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{t('version.title')}</h3>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                {t('version.current')}: <span style={{ color: '#00e5ff', fontWeight: 'bold' }}>v{currentVersion}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* System Environment Detected Badge */}
        <div style={envBadgeStyle}>
          <span>辨識目前系統：<strong>{envLabels[currentEnv].name}</strong></span>
        </div>

        {/* Content Body */}
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <div style={statusBoxStyle}>
              <span className="hud-pulse-dot active-pulse" style={{ display: 'inline-block', marginRight: '8px' }} />
              {t('version.checking')}
            </div>
          ) : checkResult?.error ? (
            <div style={{ ...statusBoxStyle, borderColor: '#ff4444', color: '#ff6b6b' }}>
              ⚠️ {checkResult.error}
            </div>
          ) : hasUpdate && latestRelease ? (
            <div>
              {/* Update Banner */}
              <div style={updateBannerStyle}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#39ff14', marginBottom: '4px' }}>
                  ✨ {t('version.new_available')} (v{latestRelease.version})
                </div>
                <div style={{ fontSize: '12px', color: '#bbb' }}>
                  發布時間：{new Date(latestRelease.publishedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Primary Download Button for Current Platform */}
              <button
                className="hud-action-btn primary"
                style={primaryDownloadBtnStyle}
                onClick={() => openDownloadLink(primaryDownloadUrl)}
              >
                <span>{t('version.download_now')} (v{latestRelease.version}) - {envLabels[currentEnv].name}</span>
              </button>

              {/* Release Notes */}
              {latestRelease.releaseNotes && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', marginBottom: '6px' }}>
                    {t('version.release_notes')}
                  </div>
                  <div style={releaseNotesStyle}>
                    <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {latestRelease.releaseNotes}
                    </pre>
                  </div>
                </div>
              )}

              {/* Toggle Download links for all 3 environments */}
              <div style={{ marginTop: '16px' }}>
                <button
                  style={togglePlatformsBtnStyle}
                  onClick={() => setShowAllPlatforms((prev) => !prev)}
                >
                  <span>{showAllPlatforms ? '▼' : '►'} {t('version.all_platforms')}</span>
                </button>

                {showAllPlatforms && (
                  <div style={platformsListStyle}>
                    {(['mac-arm64', 'mac-x64', 'win-x64'] as PlatformEnv[]).map((env) => {
                      const url = latestRelease.downloadUrls[env]
                      const isCurrent = env === currentEnv
                      return (
                        <div
                          key={env}
                          style={{
                            ...platformItemStyle,
                            backgroundColor: isCurrent ? 'rgba(0, 229, 255, 0.1)' : '#181820',
                            borderColor: isCurrent ? '#00e5ff' : '#2a2a35',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{envLabels[env].icon}</span>
                            <span style={{ fontSize: '13px' }}>{envLabels[env].name}</span>
                            {isCurrent && (
                              <span style={currentTagStyle}>您的本機</span>
                            )}
                          </div>
                          {url ? (
                            <button
                              style={smallDownloadBtnStyle}
                              onClick={() => openDownloadLink(url)}
                            >
                              下載 .dmg / .exe
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#666' }}>無對應檔案</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={upToDateBoxStyle}>
              <span style={{ fontSize: '28px' }}>🎉</span>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#00e5ff', marginTop: '6px' }}>
                {t('version.up_to_date')}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                {t('version.current')}: v{currentVersion}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={footerStyle}>
          {latestRelease?.htmlUrl && (
            <button
              style={textBtnStyle}
              onClick={() => openDownloadLink(latestRelease.htmlUrl)}
            >
              {t('version.view_github')}
            </button>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="swap-button"
              onClick={onRecheck}
              disabled={loading}
              style={{ backgroundColor: '#2b2b36', color: '#eee', minWidth: '100px' }}
            >
              {t('version.check_btn')}
            </button>
            <button className="swap-button" onClick={onClose}>
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Styling definitions
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  backdropFilter: 'blur(5px)',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#16161c',
  border: '1px solid rgba(0, 229, 255, 0.25)',
  borderRadius: '12px',
  padding: '22px 24px',
  maxWidth: '520px',
  width: '92%',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 229, 255, 0.1)',
  color: '#f0f0f5',
  maxHeight: '85vh',
  overflowY: 'auto',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  paddingBottom: '12px',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: '18px',
  cursor: 'pointer',
  padding: '4px 8px',
}

const envBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  color: '#bbb',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  padding: '6px 12px',
  borderRadius: '20px',
  marginTop: '12px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
}

const statusBoxStyle: React.CSSProperties = {
  padding: '16px',
  backgroundColor: '#1c1c24',
  border: '1px dashed #333344',
  borderRadius: '8px',
  textAlign: 'center',
  fontSize: '14px',
  color: '#aaa',
}

const upToDateBoxStyle: React.CSSProperties = {
  padding: '24px 16px',
  backgroundColor: 'rgba(0, 229, 255, 0.04)',
  border: '1px solid rgba(0, 229, 255, 0.2)',
  borderRadius: '10px',
  textAlign: 'center',
}

const updateBannerStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: 'rgba(57, 255, 20, 0.08)',
  border: '1px solid rgba(57, 255, 20, 0.3)',
  borderRadius: '8px',
  marginBottom: '14px',
}

const primaryDownloadBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: '14px',
  fontWeight: 600,
  backgroundColor: '#00e5ff',
  color: '#0a0a0f',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  boxShadow: '0 4px 14px rgba(0, 229, 255, 0.4)',
  transition: 'transform 0.1s ease',
}

const releaseNotesStyle: React.CSSProperties = {
  maxHeight: '140px',
  overflowY: 'auto',
  backgroundColor: '#111116',
  border: '1px solid #282836',
  borderRadius: '6px',
  padding: '10px 12px',
  fontSize: '12px',
  color: '#ccc',
  lineHeight: 1.5,
}

const togglePlatformsBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#00e5ff',
  fontSize: '13px',
  cursor: 'pointer',
  padding: '4px 0',
  fontWeight: 500,
}

const platformsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: '10px',
}

const platformItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #2a2a35',
}

const currentTagStyle: React.CSSProperties = {
  fontSize: '10px',
  backgroundColor: '#00e5ff',
  color: '#000',
  fontWeight: 'bold',
  padding: '2px 6px',
  borderRadius: '10px',
  marginLeft: '4px',
}

const smallDownloadBtnStyle: React.CSSProperties = {
  backgroundColor: '#2b2b36',
  color: '#00e5ff',
  border: '1px solid rgba(0, 229, 255, 0.3)',
  borderRadius: '4px',
  padding: '4px 10px',
  fontSize: '12px',
  cursor: 'pointer',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '20px',
  paddingTop: '14px',
  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
}

const textBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8888aa',
  fontSize: '12px',
  cursor: 'pointer',
  textDecoration: 'underline',
}
