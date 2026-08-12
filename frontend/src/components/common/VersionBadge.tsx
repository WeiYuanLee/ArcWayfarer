import { memo } from 'react'

type Props = {
  version: string
  hasUpdate: boolean
  latestVersion?: string
  loading: boolean
  onClick: () => void
}

export const VersionBadge = memo(function VersionBadge({
  version,
  hasUpdate,
  latestVersion,
  loading,
  onClick,
}: Props) {
  return (
    <button
      className={`version-badge-btn ${hasUpdate ? 'update-available' : ''}`}
      onClick={onClick}
      title={hasUpdate ? `發現新版本 v${latestVersion}! 點擊查看` : `目前版本 v${version} (點擊檢查更新)`}
      style={badgeStyle(hasUpdate)}
    >
      {hasUpdate ? (
        <>
          <span className="version-pulse-dot" />
          <span style={{ fontWeight: 600, color: '#39ff14' }}>v{version}</span>
          <span style={newBadgeStyle}>🚀 v{latestVersion} 可更新</span>
        </>
      ) : (
        <>
          <span style={{ color: '#8888aa', fontSize: '11px' }}>v</span>
          <span>{version}</span>
          {loading && <span className="version-loading-spinner" style={{ marginLeft: '4px' }}>⏳</span>}
        </>
      )}
    </button>
  )
})

const badgeStyle = (hasUpdate: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '16px',
  backgroundColor: hasUpdate ? 'rgba(57, 255, 20, 0.12)' : 'rgba(255, 255, 255, 0.05)',
  border: hasUpdate ? '1px solid rgba(57, 255, 20, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
  color: hasUpdate ? '#39ff14' : '#c0c0d0',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: hasUpdate ? '0 0 12px rgba(57, 255, 20, 0.25)' : 'none',
})

const newBadgeStyle: React.CSSProperties = {
  backgroundColor: '#39ff14',
  color: '#000',
  fontSize: '10px',
  fontWeight: 'bold',
  padding: '1px 6px',
  borderRadius: '8px',
  marginLeft: '2px',
}
