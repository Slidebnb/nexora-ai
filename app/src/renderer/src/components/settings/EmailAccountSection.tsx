/*
 * E-Mail-Konto zum Senden. Kunden geben nur E-Mail-Adresse und Passwort ein: NEXORA erkennt den Anbieter an der
 * Adresse und füllt Server, Port und Verschlüsselung selbst aus (lib/emailProviders). Nur für eigene Domains
 * („Anderer Anbieter“) erscheinen die Serverfelder. Jeder Versand wird vorher einzeln freigegeben. Das Passwort
 * liegt ausschließlich im sicheren Speicher des Betriebssystems; diese Maske zeigt es nie an.
 */
import { useCallback, useEffect, useState } from 'react'
import { Mail, Send, Trash2, CheckCircle2 } from 'lucide-react'
import type { SmtpStatus } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'
import { detectEmailProvider, EMAIL_PROVIDERS, type Security } from '../../lib/emailProviders'

const OTHER = 'other'

export function EmailAccountSection() {
  const worker = useNexora((s) => s.worker)
  const connected = worker.state === 'connected'
  const [current, setCurrent] = useState<SmtpStatus>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // '' = automatisch aus der Adresse erkennen; sonst gewählter Anbieter oder „other“
  const [choice, setChoice] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [security, setSecurity] = useState<Security>('starttls')
  const [user, setUser] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const detected = detectEmailProvider(email)
  const providerId = choice || detected?.id || ''
  const provider = EMAIL_PROVIDERS.find((p) => p.id === providerId) ?? null
  const manual = providerId === OTHER || (!provider && email.includes('@') && email.split('@')[1]?.includes('.'))
  // Effektive Serverangaben: vom Anbieter oder aus den manuellen Feldern
  const eff = provider ? { host: provider.host, port: provider.port, security: provider.security } : { host: host.trim(), port, security }
  const login = user.trim() || email.trim()

  const load = useCallback(() => {
    if (!connected) return
    window.nexora.getEmailAccount().then((s) => {
      setCurrent(s)
      if (s) {
        setEmail(s.fromAddr)
        const p = detectEmailProvider(s.fromAddr)
        const matches = p && p.host === s.host && p.port === s.port
        setChoice(matches ? '' : OTHER)
        setHost(s.host)
        setPort(s.port)
        setSecurity(s.security)
        setUser(s.user === s.fromAddr ? '' : s.user)
      }
    }, (e: unknown) => setError(cleanError(e)))
  }, [connected])
  useEffect(() => load(), [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setTestResult(null)
    try {
      const status = await window.nexora.setEmailAccount({ ...eff, user: login, password, fromAddr: email.trim() })
      setCurrent(status)
      setPassword('')
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setTestResult(null)
    try {
      setTestResult(await window.nexora.testEmailAccount())
    } catch (err) {
      setTestResult({ ok: false, message: cleanError(err) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    setTestResult(null)
    try {
      await window.nexora.clearEmailAccount()
      setCurrent(null)
      setEmail('')
      setPassword('')
      setChoice('')
      setHost('')
      setPort(587)
      setSecurity('starttls')
      setUser('')
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const canSave = !busy && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !!eff.host && (current !== null || password.length > 0)

  const serverFields = (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-text-2">
          Postausgangsserver
          <input className="input text-sm" placeholder="smtp.beispiel.de" aria-label="SMTP-Server" value={host} onChange={(e) => setHost(e.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1 text-xs text-text-2">
          Port
          <input className="input text-sm" type="number" min={1} max={65535} aria-label="Port" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
        </label>
      </div>
      <label className="grid gap-1 text-xs text-text-2">
        Verschlüsselung
        <select className="input text-sm" aria-label="Verschlüsselung" value={security} onChange={(e) => setSecurity(e.target.value as Security)}>
          <option value="ssl">SSL/TLS (meist Port 465)</option>
          <option value="starttls">STARTTLS (meist Port 587)</option>
          <option value="none">Keine (nicht empfohlen)</option>
        </select>
      </label>
    </div>
  )

  return (
    <section className="panel p-5" aria-labelledby="email-title">
      <h2 id="email-title" className="hud-label flex items-center gap-2">
        <Mail className="size-4 text-accent-hi" aria-hidden /> E-Mails senden
      </h2>
      <p className="mt-2 text-sm text-text-2">
        Trage dein Postfach ein, damit NEXORA auf Wunsch E-Mails für dich senden kann. Vor jeder E-Mail fragt NEXORA dich.
        Dein Passwort wird verschlüsselt gespeichert und hier nie angezeigt.
      </p>
      {!connected && <p className="mt-3 text-sm text-warning">NEXORA startet noch – gleich kannst du hier dein Postfach eintragen.</p>}
      {current && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="size-3.5" aria-hidden /> Eingerichtet: {current.fromAddr}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      {connected && (
        <form className="mt-3 grid gap-3" onSubmit={save}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-text-2">
              Deine E-Mail-Adresse
              <input className="input text-sm" type="email" placeholder="name@beispiel.de" aria-label="E-Mail-Adresse" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required />
            </label>
            <label className="grid gap-1 text-xs text-text-2">
              Passwort {current && <span className="text-text-2/60">(leer lassen = unverändert)</span>}
              <input className="input font-mono text-sm" type="password" autoComplete="off" placeholder={current ? '••••••••' : 'Passwort deines Postfachs'} aria-label="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={1024} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="E-Mail-Anbieter">
            <span className="mr-1 text-xs text-text-2">Anbieter:</span>
            {[...EMAIL_PROVIDERS.map((p) => ({ id: p.id, label: p.label })), { id: OTHER, label: 'Anderer Anbieter' }].map((p) => {
              const active = providerId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setChoice(active && choice ? '' : p.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-accent text-accent-hi' : 'border-line text-text-2 hover:text-text'}`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          {detected && !choice && <p className="text-xs text-success">Erkannt: {detected.label} – die Servereinstellungen füllt NEXORA automatisch aus.</p>}
          {provider && <p className="text-xs text-text-2">Tipp: {provider.hint}</p>}

          {manual ? (
            <div className="rounded-md border border-line p-3">
              <p className="mb-2 text-xs text-text-2">Diese Angaben findest du in der Hilfe deines E-Mail-Anbieters (Stichwort „SMTP“ oder „Postausgang“).</p>
              {serverFields}
            </div>
          ) : (
            <details className="text-xs text-text-2">
              <summary className="cursor-pointer select-none hover:text-text">Erweiterte Angaben (nur nötig, wenn dein Anbieter etwas anderes verlangt)</summary>
              <label className="mt-2 grid gap-1">
                Benutzername, falls er sich von der E-Mail-Adresse unterscheidet
                <input className="input text-sm" placeholder={email || 'name@beispiel.de'} aria-label="Benutzername" value={user} onChange={(e) => setUser(e.target.value)} maxLength={320} />
              </label>
            </details>
          )}

          {testResult && <p className={`text-xs ${testResult.ok ? 'text-success' : 'text-warning'}`}>{testResult.message}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {current && (
              <button type="button" className="btn-ghost text-sm hover:text-danger" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="size-4" aria-hidden /> Konto entfernen
              </button>
            )}
            <button type="button" className="btn-secondary" disabled={busy || !current} onClick={() => void test()} title={current ? 'Prüfen, ob NEXORA dein Postfach erreicht (es wird nichts gesendet)' : 'Erst speichern, dann prüfen'}>
              E-Mail-Verbindung testen
            </button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              <Send className="size-4" aria-hidden /> Speichern
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
