import { memo } from 'react'
import { Button, Tooltip } from '@mantine/core'
import { IconArrowUpRight, IconRefresh } from '@tabler/icons-react'
import { useT } from '../../i18n'

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
  const t = useT()
  return (
    <Tooltip label={hasUpdate ? `New version v${latestVersion} available` : `Current version v${version}`} openDelay={450}>
      <Button
        className="version-badge-btn"
        size="compact-xs"
        variant={hasUpdate ? 'light' : 'subtle'}
        color={hasUpdate ? 'blue' : 'gray'}
        onClick={onClick}
        loading={loading}
        leftSection={hasUpdate ? <IconArrowUpRight size={14} /> : <IconRefresh size={13} />}
      >
        {hasUpdate ? `v${latestVersion} · ${t('version.update_available_short')}` : `v${version}`}
      </Button>
    </Tooltip>
  )
})
