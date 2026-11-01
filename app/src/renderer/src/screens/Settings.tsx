import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldOff, FlaskConical, PlugZap } from 'lucide-react'
import { PROVIDERS, type AppInfo, type Provider, type SecretProvider, type SecretStatus } from '@shared/ipc-contract'
import { useNexora } from '../state/store'
import { enterDemo, exitDemo } from '../demo/controller'
import { ScreenHeader } from './ScreenHeader'
import { LicenseSection } from '../components/settings/LicenseSection'
import { SystemStatusPanel } from '../components/settings/SystemStatusPanel'
import { ConnectorsSection } from '../components/settings/ConnectorsSection'
import { EmailAccountSection } from '../components/settings/EmailAccountSection'

const THEME_OPTIONS = [
  { id: 'crimson', label: 'Crimson', color: '#f43f67' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'violet', label: 'Violett', color: '#8b5cf6' },
  { id: 'minimal', label: 'Minimal', color: '#94a3b8' }
] as const

const PROVIDER_LABEL: Record<SecretProvider, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI' }

/** IPC-Fehler kommen als „Error invoking remote method …: Error: <Text>“ – nur den Text zeigen. */
function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function ApiKeyRow({ provider, configured, disabled, onChange }: { provider: SecretProvider; configured: boolean; disabled: boolean; onChange: (s: SecretStatus) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)

  const runTest = async () => {
    setBusy(true)
    setTest(null)
    try {
      setTest(await window.nexora.testAiConnection(provider))
    } catch (e) {
      setTest({ ok: false, message: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }

  const run = async (fn: () => Promise<SecretStatus>) => {
    setBusy(true)
    setError(null)
    setTest(null)
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
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void runTest()}>
            <PlugZap className="size-4" aria-hidden /> Verbindung testen
          </button>
        )}
        {configured && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(() => window.nexora.clearSecret(provider))}>
            Entfernen
          </button>
        )}
      </form>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
      {test && (
        <p role="status" className={`mt-1.5 text-xs ${test.ok ? 'text-success' : 'text-warning'}`}>
          {test.message}
        </p>
      )}
    </div>
  )
}

const OLLAMA_DEFAULT = { enabled: false, model: 'llama3.1', baseUrl: 'http://127.0.0.1:11434/v1/chat/completions' }

/** Lokales KI-Modell (Ollama): läuft auf dem PC, ohne Cloud/Schlüssel – maximaler Datenschutz. */
function OllamaSection() {
  const appSettings = useNexora((s) => s.settings)
  const saveSettings = useNexora((s) => s.saveSettings)
  const cfg = appSettings?.ollama ?? OLLAMA_DEFAULT
  const [model, setModel] = useState(cfg.model)
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl)
  const [msg, setMsg] = useState<string | null>(null)
  const store = (ollama: { enabled: boolean; model: string; baseUrl: string }) =>
    saveSettings({ ollama }).then(() => setMsg('Gespeichert.'), (e: unknown) => setMsg(cleanError(e)))

  return (
    <section className="panel p-5" aria-labelledby="ollama-title">
      <h2 id="ollama-title" className="hud-label">Lokales KI-Modell (Ollama)</h2>
      <p className="mt-2 text-sm text-text-2">
        Maximaler Datenschutz: NEXORA nutzt ein Modell, das komplett auf deinem PC läuft – ohne Cloud, ohne Schlüssel. Voraussetzung:
        Ollama ist installiert (ollama.com) und ein Modell geladen. Werkzeuge/Aktionen gelingen am besten mit werkzeugfähigen Modellen
        wie „llama3.1". Ist das lokale Modell aktiv, hat es Vorrang vor Anthropic/OpenAI.
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => void store({ enabled: e.target.checked, model: model.trim() || 'llama3.1', baseUrl: baseUrl.trim() || OLLAMA_DEFAULT.baseUrl })}
          className="mt-1 accent-[var(--color-accent)]"
          aria-label="Lokales Modell (Ollama) nutzen"
        />
        <span>Lokales Modell (Ollama) nutzen</span>
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-text-2">
          Modellname
          <input className="input text-sm" value={model} onChange={(e) => setModel(e.target.value)} maxLength={100} placeholder="llama3.1" aria-label="Modellname" />
        </label>
        <label className="grid gap-1 text-xs text-text-2">
          Adresse (OpenAI-kompatibel)
          <input className="input font-mono text-sm" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} maxLength={300} placeholder={OLLAMA_DEFAULT.baseUrl} aria-label="Adresse" />
        </label>
      </div>
      {msg && <p className="mt-2 text-xs text-text-2">{msg}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" className="btn-secondary" onClick={() => void store({ enabled: cfg.enabled, model: model.trim() || 'llama3.1', baseUrl: baseUrl.trim() || OLLAMA_DEFAULT.baseUrl })}>
          Speichern
        </button>
      </div>
    </section>
  )
}

export function Settings() {
  const demoMode = useNexora((s) => s.demoMode)
  const expertMode = useNexora((s) => s.expertMode)
  const setExpertMode = useNexora((s) => s.setExpertMode)
  const appSettings = useNexora((s) => s.settings)
  const saveSettings = useNexora((s) => s.saveSettings)
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
        <SystemStatusPanel />
        <LicenseSection />
        <ConnectorsSection />
        <EmailAccountSection />

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
          <p className="mt-2 text-xs text-text-2">„Verbindung testen“ fragt nur die Modellliste des Anbieters ab und verbraucht keine Tokens.</p>
          <p className="mt-2 text-xs text-success">Kein Abo, keine Marge: Du zahlst nur deine tatsächliche Nutzung direkt beim Anbieter. Die laufenden Kosten siehst du jederzeit live oben in der Leiste.</p>
        </section>

        <OllamaSection />

        <section className="panel p-5" aria-labelledby="demo-title">
          <h2 id="demo-title" className="hud-label">Demo-Modus</h2>
          <p className="mt-2 text-sm text-text-2">
            Zeigt simulierte Abläufe für Präsentationen. Alles ist als DEMO gekennzeichnet. Beim Beenden werden alle Demo-Daten entfernt.
          </p>
          <button type="button" className="btn-secondary mt-3" onClick={demoMode ? exitDemo : enterDemo}>
            <FlaskConical className="size-4" aria-hidden /> {demoMode ? 'Demo-Modus beenden' : 'Demo-Modus starten'}
          </button>
        </section>

        <section className="panel p-5" aria-labelledby="expert-title">
          <h2 id="expert-title" className="hud-label">Ansicht</h2>
          <label className="mt-3 flex items-start gap-3 text-sm text-text">
            <input type="checkbox" checked={expertMode} onChange={(e) => setExpertMode(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" aria-label="Expertenansicht" />
            <span>
              Expertenansicht
              <span className="block text-xs text-text-2">
                Zeigt auf der Startseite das technische Kontrollzentrum: Ereignisprotokoll, Event-Stream, Kennzahlen und Agenten-Details.
              </span>
            </span>
          </label>
        </section>

        <section className="panel p-5" aria-labelledby="data-title">
          <h2 id="data-title" className="hud-label">Datenverarbeitung</h2>
          <p className="mt-2 text-sm text-text-2">
            Ordner aufräumen läuft vollständig auf diesem PC; die Web-Recherche ruft nur die Webseiten ab, die du angibst. Bevor Inhalte an
            einen KI-Anbieter gesendet werden (PDF-Analyse oder E-Mail-Entwürfe mit KI), fragt NEXORA ausdrücklich nach.
          </p>
        </section>

        <section className="panel p-5" aria-labelledby="theme-title">
          <h2 id="theme-title" className="hud-label">Darstellung und Hinweise</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Farbthema">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={appSettings?.theme === t.id}
                onClick={() => void saveSettings({ theme: t.id })}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${appSettings?.theme === t.id ? 'border-accent text-text' : 'border-line text-text-2 hover:text-text'}`}
              >
                <span className="size-4 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={appSettings?.notifications ?? true}
              onChange={(e) => void saveSettings({ notifications: e.target.checked })}
              className="mt-1 accent-[var(--color-accent)]"
              aria-label="Windows-Benachrichtigungen"
            />
            <span>
              Windows-Benachrichtigungen
              <span className="block text-xs text-text-2">Wenn NEXORA im Hintergrund ist: Hinweis, sobald eine Bestätigung nötig oder eine Aufgabe fertig ist.</span>
            </span>
          </label>
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
