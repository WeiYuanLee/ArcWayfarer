import { useT } from '../i18n'

type Props = {
  connected: boolean
}

export function ConnectionStatus({ connected }: Props) {
  const t = useT()
  return (
    <span className="connection-status" title={connected ? t('connection.connected') : t('connection.disconnected')}>
      <span className={connected ? 'status-dot ok' : 'status-dot'} />
    </span>
  )
}
