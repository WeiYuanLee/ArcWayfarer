import { useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Group, Menu, Text } from '@mantine/core'
import { IconHeart, IconMenu2, IconPhone, IconTool } from '@tabler/icons-react'
import * as api from '../../services/api'
import { useI18n } from '../../i18n'
import { MobileRemoteModal } from '../common/MobileRemoteModal'
import { SponsorModal } from '../common/SponsorModal'

type Props = { deviceId: string | null }

export function DevMenuButton({ deviceId }: Props) {
  const { lang, setLang, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 3000)
    return () => window.clearTimeout(timer)
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
    <>
      <Menu shadow="md" width={280} position="bottom-start">
        <Menu.Target>
          <ActionIcon aria-label={t('devmenu.title')} size="md">
            <IconMenu2 size={18} stroke={1.8} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t('devmenu.title')}</Menu.Label>
          <Menu.Item leftSection={<IconTool size={16} />} disabled={!deviceId || busy} onClick={handleRevealDeveloperMode}>
            {busy ? t('generic.working') : t('devmenu.amfi_reveal')}
          </Menu.Item>
          {!deviceId && <Text size="xs" c="dimmed" px="sm" pt={4}>{t('devmenu.select_device_first')}</Text>}
          {message && <Alert color="blue" variant="light" mt="sm" mx="xs" py="xs">{message}</Alert>}
          <Menu.Divider />
          <Menu.Item leftSection={<IconPhone size={16} />} onClick={() => setRemoteOpen(true)}>{t('devmenu.remote')}</Menu.Item>
          <Menu.Item leftSection={<IconHeart size={16} />} onClick={() => setSponsorOpen(true)}>{t('devmenu.sponsor')}</Menu.Item>
          <Menu.Divider />
          <Group justify="space-between" px="sm" py={4}>
            <Text size="xs" c="dimmed">{t('devmenu.lang_label')}</Text>
            <Group gap={4}>
              <Button size="compact-xs" variant={lang === 'zh' ? 'filled' : 'default'} onClick={() => setLang('zh')}>中文</Button>
              <Button size="compact-xs" variant={lang === 'en' ? 'filled' : 'default'} onClick={() => setLang('en')}>EN</Button>
            </Group>
          </Group>
        </Menu.Dropdown>
      </Menu>
      <MobileRemoteModal isOpen={remoteOpen} onClose={() => setRemoteOpen(false)} />
      <SponsorModal isOpen={sponsorOpen} onClose={() => setSponsorOpen(false)} />
    </>
  )
}
