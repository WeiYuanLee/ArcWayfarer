import type { Lang } from '../../i18n'

export function formatRelativeTime(ts: number, lang: Lang): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (diff < 60) return lang === 'zh' ? '剛剛' : 'just now'
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return lang === 'zh' ? `${m} 分鐘前` : `${m}m ago`
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return lang === 'zh' ? `${h} 小時前` : `${h}h ago`
  }
  const d = Math.floor(diff / 86400)
  return lang === 'zh' ? `${d} 天前` : `${d}d ago`
}
