import { Accordion, Alert, Badge, Button, Group, Loader, Modal, Paper, ScrollArea, Stack, Text } from '@mantine/core'
import { IconAlertCircle, IconCheck, IconDownload, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import { useT } from '../../i18n'
import { openDownloadLink, type CheckUpdateResult, type PlatformEnv } from '../../services/updateService'

type Props = { isOpen: boolean; onClose: () => void; checkResult: CheckUpdateResult | null; loading: boolean; onRecheck: () => void }

export function UpdateModal({ isOpen, onClose, checkResult, loading, onRecheck }: Props) {
  const t = useT()
  const currentVersion = checkResult?.currentVersion || '0.1.0'
  const latestRelease = checkResult?.latestRelease
  const currentEnv = checkResult?.currentEnv || 'mac-arm64'
  const envLabels: Record<PlatformEnv, string> = {
    'mac-arm64': t('version.env.mac_arm64'), 'mac-x64': t('version.env.mac_x64'), 'win-x64': t('version.env.win_x64'),
  }
  const primaryUrl = latestRelease?.downloadUrls[currentEnv] || latestRelease?.htmlUrl

  return (
    <Modal opened={isOpen} onClose={onClose} title={t('version.title')} centered size="lg">
      <Stack gap="md">
        <Group justify="space-between"><Text size="sm" c="dimmed">{t('version.current')}: <Text span fw={600}>v{currentVersion}</Text></Text><Badge variant="light" color="gray">{envLabels[currentEnv]}</Badge></Group>
        {loading && <Group justify="center" py="xl"><Loader size="sm" /><Text size="sm">{t('version.checking')}</Text></Group>}
        {!loading && checkResult?.error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{checkResult.error}</Alert>}
        {!loading && !checkResult?.error && latestRelease && checkResult.hasUpdate && (
          <>
            <Paper withBorder p="sm" bg="var(--aw-surface-raised)">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap"><IconDownload size={18} color="var(--mantine-primary-color-filled)" /><div><Text size="sm" fw={600}>{t('version.new_available')} v{latestRelease.version}</Text><Text size="xs" c="dimmed">{new Date(latestRelease.publishedAt).toLocaleDateString()}</Text></div></Group>
                <Badge color="blue" variant="light">v{latestRelease.version}</Badge>
              </Group>
            </Paper>
            {primaryUrl && <Button leftSection={<IconDownload size={16} />} onClick={() => openDownloadLink(primaryUrl)}>{t('version.download_now')} · {envLabels[currentEnv]}</Button>}
            {latestRelease.releaseNotes && <Accordion variant="contained"><Accordion.Item value="notes"><Accordion.Control>{t('version.release_notes')}</Accordion.Control><Accordion.Panel><ScrollArea.Autosize mah={180}><Text component="pre" size="xs" style={{ whiteSpace: 'pre-wrap' }}>{latestRelease.releaseNotes}</Text></ScrollArea.Autosize></Accordion.Panel></Accordion.Item></Accordion>}
            <Accordion variant="contained"><Accordion.Item value="platforms"><Accordion.Control>{t('version.all_platforms')}</Accordion.Control><Accordion.Panel><Stack gap="xs">{(['mac-arm64', 'mac-x64', 'win-x64'] as PlatformEnv[]).map((env) => { const url = latestRelease.downloadUrls[env]; return <Paper key={env} withBorder p="xs"><Group justify="space-between"><Group gap="xs"><Text size="sm">{envLabels[env]}</Text>{env === currentEnv && <Badge size="xs">Current</Badge>}</Group>{url && <Button size="compact-sm" variant="default" onClick={() => openDownloadLink(url)}>{t('version.download_now')}</Button>}</Group></Paper> })}</Stack></Accordion.Panel></Accordion.Item></Accordion>
          </>
        )}
        {!loading && !checkResult?.error && (!latestRelease || !checkResult.hasUpdate) && <Alert color="green" icon={<IconCheck size={16} />}>{t('version.up_to_date')}</Alert>}
        <Group justify="space-between"><Button variant="subtle" leftSection={<IconExternalLink size={16} />} disabled={!latestRelease?.htmlUrl} onClick={() => latestRelease?.htmlUrl && openDownloadLink(latestRelease.htmlUrl)}>{t('version.view_github')}</Button><Group><Button variant="default" leftSection={<IconRefresh size={16} />} loading={loading} onClick={onRecheck}>{t('version.check_btn')}</Button><Button onClick={onClose}>{t('generic.close')}</Button></Group></Group>
      </Stack>
    </Modal>
  )
}
