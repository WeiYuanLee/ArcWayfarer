import { useState } from 'react'
import { ActionIcon, Button, Group, Menu, Text } from '@mantine/core'
import { IconHeart, IconMenu2, IconPhone, IconUsersGroup } from '@tabler/icons-react'
import { useI18n } from '../../i18n'
import { MobileRemoteModal } from '../common/MobileRemoteModal'
import { SponsorModal } from '../common/SponsorModal'
import { CommunityModal } from '../common/CommunityModal'

export function DevMenuButton() {
  const { lang, setLang, t } = useI18n()
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false)

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
          <Menu.Item leftSection={<IconPhone size={16} />} onClick={() => setRemoteOpen(true)}>{t('devmenu.remote')}</Menu.Item>
          <Menu.Item leftSection={<IconHeart size={16} />} onClick={() => setSponsorOpen(true)}>{t('devmenu.sponsor')}</Menu.Item>
          <Menu.Item leftSection={<IconUsersGroup size={16} />} onClick={() => setCommunityOpen(true)}>{t('devmenu.community')}</Menu.Item>
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
      <CommunityModal isOpen={communityOpen} onClose={() => setCommunityOpen(false)} />
    </>
  )
}
