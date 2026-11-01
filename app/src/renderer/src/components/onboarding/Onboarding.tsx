import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, FolderSync, Hand, HardDrive, KeyRound, MessageSquareText, PlugZap, ShieldCheck, Sparkles, Undo2 } from 'lucide-react'
import { ApiKeySchema, type Provider, type SecretStatus } from '@shared/ipc-contract'
import { CONNECTOR_CATALOG, CONNECTOR_CATEGORY_ORDER } from '../../data/connectors'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI' }
const KEY_HELP: Record<Provider, string> = {
  anthropic: 'Dein Anthropic-Schlüssel beginnt mit „sk-ant-…".',
  openai: 'Dein OpenAI-Schlüssel beginnt mit „sk-…".'
}
// Direkt-Links zur Schlüsselseite des Anbieters (öffnen im echten Browser; Main-Prozess prüft gegen Allowlist).
const KEY_URL: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys'
}
// Kurze Schritt-für-Schritt-Hilfe, damit auch Laien in Minuten zum Schlüssel kommen.
const KEY_STEPS: Record<Provider, string[]> = {
  anthropic: ['Auf „Schlüssel holen" klicken und bei Anthropic anmelden (oder kostenlos registrieren).', 'Auf „Create Key" klicken und dem Schlüssel einen Namen geben.', 'Den Schlüssel kopieren (beginnt mit „sk-ant-…") und hier unten einfügen.'],
  openai: ['Auf „Schlüssel holen" klicken und bei OpenAI anmelden (oder registrieren).', 'Auf „Create new secret key" klicken.', 'Den Schlüssel kopieren (beginnt mit „sk-…") und hier unten einfügen.']
}

/** Schritt „KI-Schlüssel eintragen": damit der Kunde sofort mit NEXORA schreiben kann. Der Schlüssel wird nur im
 *  Hauptprozess verschlüsselt gespeichert (die Oberfläche sieht ihn nie). */
function KeyStep({ onConfigured }: { onConfigured: (any: boolean) => void }) {
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<SecretStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    window.nexora.getSecretStatus().then((s) => {
      setStatus(s)
      onConfigured(Object.values(s.configured).some(Boolean))
    }, () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const anyConfigured = !!status && Object.values(status.configured).some(Boolean)
  const valid = ApiKeySchema.safeParse(value.trim()).success

  const save = async () => {
    setBusy(true)
    setError(null)
    setTested(null)
    try {
      const s = await window.nexora.setSecret(provider, value.trim())
      setStatus(s)
      setValue('')
      onConfigured(Object.values(s.configured).some(Boolean))
      // Direkt prüfen, damit der Kunde Gewissheit hat (ehrlich: nur wenn ein Schlüssel vorhanden ist)
      try {
        setTested(await window.nexora.testAiConnection(provider))
      } catch {
        /* Test optional – Speichern hat schon geklappt */
      }
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-text-2">
        Damit du sofort mit NEXORA schreiben kannst, trage einmalig einen KI-Schlüssel ein (Anthropic oder OpenAI – einer reicht).
        Er wird nur auf deinem PC verschlüsselt gespeichert und nie angezeigt.
      </p>
      {anyConfigured && (
        <p className="inline-flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="size-3.5" aria-hidden /> Ein Schlüssel ist hinterlegt – du kannst direkt loslegen.
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="Anbieter">
        {(['anthropic', 'openai'] as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={provider === p}
            className={provider === p ? 'btn-secondary text-xs' : 'btn-ghost text-xs'}
            onClick={() => { setProvider(p); setTested(null); setError(null) }}
          >
            {PROVIDER_LABEL[p]}
            {status?.configured[p] && <CheckCircle2 className="ml-1 size-3.5 text-success" aria-hidden />}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-line bg-panel-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-text">So bekommst du einen {PROVIDER_LABEL[provider]}-Schlüssel:</p>
          <button type="button" className="btn-secondary text-xs" onClick={() => void window.nexora.openExternal(KEY_URL[provider])}>
            <ExternalLink className="size-3.5" aria-hidden /> Schlüssel holen
          </button>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-text-2">
          {KEY_STEPS[provider].map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      <input
        className="input font-mono text-sm"
        type="password"
        autoComplete="off"
        placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
        aria-label={`${PROVIDER_LABEL[provider]}-Schlüssel`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={400}
        disabled={busy || (status ? !status.encryptionAvailable : false)}
      />
      <p className="text-xs text-text-2">{KEY_HELP[provider]}</p>
      {status && !status.encryptionAvailable && <p className="text-xs text-warning">Sichere Speicherung ist auf diesem System nicht verfügbar – der Schlüssel kann nicht gespeichert werden.</p>}
      {tested && <p className={`text-xs ${tested.ok ? 'text-success' : 'text-warning'}`}>{tested.message}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={busy || !valid || (status ? !status.encryptionAvailable : false)} onClick={() => void save()}>
          <KeyRound className="size-4" aria-hidden /> Speichern &amp; prüfen
        </button>
      </div>
    </div>
  )
}

/** Begrüßung beim ersten Start: geführte Einrichtung in vier Schritten – inkl. KI-Schlüssel, damit man direkt schreiben kann. */
export function Onboarding() {
  const settings = useNexora((s) => s.settings)
  const saveSettings = useNexora((s) => s.saveSettings)
  const setPickedFolder = useNexora((s) => s.setPickedFolder)
  const setScreen = useNexora((s) => s.setScreen)
  const openWizard = useNexora((s) => s.setWizard)
  const worker = useNexora((s) => s.worker.state)
  const [step, setStep] = useState(0)
  const [hasKey, setHasKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!settings || settings.onboarded) return null

  const finish = () => void saveSettings({ onboarded: true })
  const startChat = async () => {
    await saveSettings({ onboarded: true })
    setScreen('dashboard')
  }
  const startPractice = async () => {
    setBusy(true)
    setError(null)
    try {
      const folder = await window.nexora.createPracticeFolder()
      setPickedFolder(folder)
      await saveSettings({ onboarded: true })
      setScreen('dashboard')
      openWizard('ordner')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Willkommen bei NEXORA',
      body: (
        <ul className="space-y-4">
          <li className="flex gap-3">
            <MessageSquareText className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Du schreibst (oder sprichst) einfach mit NEXORA – und NEXORA erledigt es: recherchieren, E-Mails schreiben und senden, Ordner aufräumen, PDFs zusammenfassen.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Bevor NEXORA etwas verändert oder sendet, zeigt es dir genau, was passiert, und wartet auf dein OK.</span>
          </li>
          <li className="flex gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-accent-hi" aria-hidden />
            <span>Deine Daten bleiben auf deinem PC. Schlüssel und Passwörter werden nur verschlüsselt im Betriebssystem gespeichert.</span>
          </li>
        </ul>
      )
    },
    {
      title: 'KI-Schlüssel eintragen',
      body: <KeyStep onConfigured={setHasKey} />
    },
    {
      title: 'Du behältst die Kontrolle',
      body: (
        <div className="space-y-4">
          <div className="rounded-md border border-warning/50 bg-panel-2 p-4 text-sm" aria-label="Beispiel einer Bestätigung">
            <p className="hud-label mb-2 text-warning">Beispiel</p>
            <p className="font-semibold text-text">E-Mail senden</p>
            <p className="mt-1 text-text-2">Was passiert: Eine E-Mail an kunde@example.com wird gesendet. Du siehst Betreff und Text vorher.</p>
            <div className="mt-3 flex justify-end gap-2" aria-hidden>
              <span className="rounded border border-accent px-3 py-1 text-xs text-accent-hi">Ablehnen</span>
              <span className="rounded bg-accent px-3 py-1 text-xs text-white">Erlauben</span>
            </div>
          </div>
          <p className="flex gap-3 text-text-2">
            <Hand className="size-5 shrink-0 text-accent-hi" aria-hidden /> Du kannst jede Aufgabe jederzeit stoppen.
          </p>
          <p className="flex gap-3 text-text-2">
            <Undo2 className="size-5 shrink-0 text-accent-hi" aria-hidden /> Aufgeräumte Ordner lassen sich mit einem Klick zurücksetzen.
          </p>
          <p className="flex gap-3 text-text-2">
            <PlugZap className="size-5 shrink-0 text-accent-hi" aria-hidden /> Weitere Dienste (E-Mail-Konto, Kalender, Slack …) verbindest du jederzeit unter „Einstellungen → Verbindungen".
          </p>
        </div>
      )
    },
    {
      title: 'Deine Dienste verbinden',
      body: (
        <div className="space-y-3 text-sm text-text-2">
          <p className="flex items-center gap-2 text-text">
            <PlugZap className="size-5 text-accent-hi" aria-hidden /> NEXORA arbeitet mit über {CONNECTOR_CATALOG.length - 1} Diensten.
          </p>
          <p>Verbinde deine Dienste – danach kann NEXORA sie direkt im Gespräch nutzen (jede Aktion mit deiner Freigabe). Optional, du kannst es jederzeit nachholen.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CONNECTOR_CATEGORY_ORDER.filter((c) => c !== 'Sonstiges').map((cat) => {
              const n = CONNECTOR_CATALOG.filter((t) => t.category === cat).length
              return (
                <div key={cat} className="flex items-center justify-between rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-xs">
                  <span className="truncate text-text">{cat}</span>
                  <span className="ml-2 shrink-0 text-text-2">{n}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center pt-1">
            <button type="button" className="btn-secondary" onClick={() => { finish(); setScreen('settings') }}>
              <PlugZap className="size-4" aria-hidden /> Jetzt Dienste verbinden
            </button>
          </div>
          <p className="text-center text-xs">… oder mit „Weiter" erst später verbinden.</p>
        </div>
      )
    },
    {
      title: 'Loslegen',
      body: (
        <div className="space-y-3 text-text-2">
          <p className="flex items-center gap-2 text-text"><Sparkles className="size-5 text-accent-hi" aria-hidden /> Alles bereit.</p>
          <p>Schreib NEXORA einfach, was du brauchst – zum Beispiel „Fasse diese PDF zusammen" oder „Schreib eine E-Mail an …".</p>
          <p className="text-xs">
            Lieber erst gefahrlos üben? NEXORA legt einen Übungsordner mit Beispieldateien an, den du dann aufräumst (mit Freigabe, jederzeit rückgängig).
          </p>
          {!hasKey && <p className="text-xs text-warning">Hinweis: Ohne hinterlegten Schlüssel kannst du noch nicht mit NEXORA schreiben. Du kannst ihn jederzeit unter „Einstellungen" nachtragen.</p>}
        </div>
      )
    }
  ]
  const current = steps[step]!
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="onb-title" className="panel w-[560px] max-w-[94vw] p-7">
        <div className="mb-5 flex items-center gap-2" aria-label={`Schritt ${step + 1} von ${steps.length}`}>
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-panel-2'}`} />
          ))}
        </div>
        <h2 id="onb-title" className="mb-5 text-2xl font-semibold text-text">
          {current.title}
        </h2>
        <div className="min-h-44 text-sm text-text">{current.body}</div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-2">
          <button type="button" className="btn-ghost" onClick={step > 0 ? () => setStep(step - 1) : finish}>
            {step > 0 ? 'Zurück' : 'Überspringen'}
          </button>
          {!isLast ? (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              Weiter
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" disabled={busy || worker !== 'connected'} onClick={() => void startPractice()}>
                <FolderSync className="size-4" aria-hidden /> {worker === 'connected' ? 'Übungsordner' : 'startet …'}
              </button>
              <button type="button" className="btn-primary" onClick={() => void startChat()}>
                <MessageSquareText className="size-4" aria-hidden /> Mit NEXORA schreiben
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
