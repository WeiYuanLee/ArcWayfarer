import { FormEvent, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertCircle, IconLink } from '@tabler/icons-react'
import App from '../src/MobileApp'
import { I18nProvider } from '../src/i18n'
import { AppProviders } from '../src/theme/AppProviders'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'
import '../src/theme/tokens.css'
import '../src/styles.css'
import '../src/mobile.css'

const SESSION_KEY = 'arcwayfarer.mobile.session'

function PairingScreen({ token, onPaired }: { token: string | null; onPaired: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !/^\d{6}$/.test(pin)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/mobile/exchange', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, pin }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || '配對失敗')
      sessionStorage.setItem(SESSION_KEY, payload.session)
      history.replaceState(null, '', '/mobile/')
      onPaired()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '配對失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mobile-pairing">
      <Paper className="mobile-pairing-card" withBorder radius="md" p="xl">
        <Stack gap="lg">
          <Stack gap={4} align="center">
            <Title order={1} size="h2">ArcWayfarer</Title>
            <Text c="dimmed" size="sm" ta="center">輸入電腦畫面顯示的 6 位配對碼。</Text>
          </Stack>
          <form onSubmit={submit}>
            <Stack gap="md">
              <TextInput
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                aria-label="配對碼"
                size="lg"
                styles={{ input: { textAlign: 'center', letterSpacing: '0.2em' } }}
              />
              <Button type="submit" leftSection={<IconLink size={17} />} loading={busy} disabled={!token || pin.length !== 6} fullWidth>
                連線控制器
              </Button>
            </Stack>
          </form>
          {!token && <Alert color="red" icon={<IconAlertCircle size={16} />}>QR Code 無效或已過期，請在電腦端重新產生。</Alert>}
          {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        </Stack>
      </Paper>
    </main>
  )
}

function MobileRoot() {
  const [paired, setPaired] = useState(() => Boolean(sessionStorage.getItem(SESSION_KEY)))
  const token = new URLSearchParams(location.hash.slice(1)).get('pair')
  return (
    <AppProviders>
      {paired ? <I18nProvider><App /></I18nProvider> : <PairingScreen token={token} onPaired={() => setPaired(true)} />}
    </AppProviders>
  )
}

createRoot(document.getElementById('root')!).render(<MobileRoot />)
