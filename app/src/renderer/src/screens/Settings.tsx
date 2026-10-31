import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldOff, FlaskConical } from 'lucide-react'
import { PROVIDERS, type AppInfo, type Provider, type SecretStatus } from '@shared/ipc-contract'
import { useNexora } from '../state/store'
import { enterDemo, exitDemo } from '../demo/controller'
import { ScreenHeader } from './ScreenHeader'

const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI' }

/** IPC-Fehler kommen als „Error invoking remote method …: Error: <Text>“ – nur den Text zeigen. */
function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function ApiKeyRow({ provider, configured, disabled, onChange }: { provider: Provider; configured: boolean; disabled: boolean; onChange: (s: SecretStatus) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<SecretStatus>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await fn())
      setValue('')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-line py-4 last:border-0">
      <div className="flex items-center gap-3">
        <KeyRound className="size-4 text-text-2" aria-hidden />
        <span className="font-medium text-text">{PROVIDER_LABEL[provider]}</span>
        <span className={configured ? 'text-xs text-success' : 'text-xs text-text-2'}>{configured ? '✓ hinterlegt (verschlüsselt)' : 'nicht hinterlegt'}</span>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => window.nexora.setSecret(provider, value))
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={configured ? 'Neuen Schlüssel eingeben, um zu ersetzen' : 'API-Schlüssel einfügen'}
          aria-label={`API-Schlüssel ${PROVIDER_LABEL[provider]}`}
          className="input flex-1 font-mono text-sm"
          disabled={disabled || busy}
        />
        <button type="submit" className="btn-primary" disabled={disabled || busy || value.trim().length === 0}>
          Speichern
        </button>
        {configured && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(() => window.nexora.clearSecret(provider))}>
            Entfernen
          </button>
        )}
      </form>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Settings() {
  const demoMode = useNexora((s) => s.demoMode)
  const [status, setStatus] = useState<SecretStatus | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    window.nexora.getSecretStatus().then(setStatus, (e: unknown) => setLoadError(cleanError(e)))
    window.nexora.getAppInfo().then(setInfo, () => undefined)
  }, [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <ScreenHeader title="Einstellungen" />
      <div className="grid max-w-3xl gap-5">
        <section className="panel p-5" aria-labelledby="keys-title">
          <h2 id="keys-title" className="hud-label">API-Schlüssel (BYOK)</h2>
          <p className="mt-2 text-sm text-text-2">
            Schlüssel werden nur im Hauptprozess mit der Verschlüsselung des Betriebssystems gespeichert (Windows: DPAPI). Die Oberfläche
            sieht sie nie, und sie erscheinen nicht in Logs.
          </p>
          {loadError && <p role="alert" className="mt-2 text-sm text-danger">{loadError}</p>}
          {status && (
            <>
              <p className={`mt-3 inline-flex items-center gap-1.5 text-xs ${status.encryptionAvailable ? 'text-success' : 'text-warning'}`}>
                {status.encryptionAvailable ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldOff className="size-4" aria-hidden />}
                {status.encryptionAvailable
                  ? 'Sichere Speicherung verfügbar'
                  : 'Sichere Speicherung auf diesem System nicht verfügbar. Schlüssel können nicht gespeichert werden.'}
              </p>
              {PROVIDERS.map((p) => (
                <ApiKeyRow key={p} provider={p} configured={status.configured[p] ?? false} disabled={!status.encryptionAvailable} onChange={setStatus} />
              ))}
            </>
          )}
          <p className="mt-2 text-xs text-text-2">Verbindungstest und Verbrauchslimits folgen mit dem Worker (Phase 2).</p>
        </section>

        <section className="panel p-5" aria-labelledby="demo-title">
          <h2 id="demo-title" className="hud-label">Demo-Modus</h2>
          <p className="mt-2 text-sm text-text-2">
            Zeigt simulierte Abläufe für Präsentationen. Alles ist als DEMO gekennzeichnet. Beim Beenden werden alle Demo-Daten entfernt.
          </p>
          <button type="button" className="btn-secondary mt-3" onClick={demoMode ? exitDemo : enterDemo}>
            <FlaskConical className="size-4" aria-hidden /> {demoMode ? 'Demo-Modus beenden' : 'Demo-Modus starten'}
          </button>
        </section>

        <section className="panel p-5" aria-labelledby="data-title">
          <h2 id="data-title" className="hud-label">Datenverarbeitung</h2>
          <p className="mt-2 text-sm text-text-2">
            Derzeit findet keine Cloud-Verarbeitung statt. Bevor Screenshots oder Inhalte an einen KI-Anbieter gesendet werden, fragt NEXORA
            ausdrücklich nach (ab Phase 2).
          </p>
        </section>

        <section className="panel p-5" aria-labelledby="theme-title">
          <h2 id="theme-title" className="hud-label">Darstellung</h2>
          <p className="mt-2 text-sm text-text">Theme: Crimson</p>
          <p className="text-xs text-text-2">Weitere Themes (Cyan, Violet, Minimal) folgen.</p>
        </section>

        {info && (
          <p className="text-xs text-text-2">
            {info.name} {info.version} · {info.platform}
          </p>
        )}
      </div>
    </div>
  )
}
