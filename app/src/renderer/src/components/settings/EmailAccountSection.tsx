/*
 * E-Mail-Konto zum Senden (SMTP). Der Kunde hinterlegt sein Postfach einmal; danach kann NEXORA auf Wunsch
 * wirklich E-Mails senden – jeder Versand wird vorher einzeln freigegeben. Das Passwort wird ausschließlich im
 * sicheren Speicher des Betriebssystems gehalten (nie im Renderer, nie in der Datenbank); diese Maske zeigt es nie an.
 */
import { useCallback, useEffect, useState } from 'react'
import { Mail, Send, Trash2, CheckCircle2 } from 'lucide-react'
import type { SmtpStatus } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

type Security = 'ssl' | 'starttls' | 'none'

// Kleine Starthilfe für bekannte Anbieter. Nur Vorbelegung – der Kunde kann alles ändern.
const PRESETS: { id: string; label: string; host: string; port: number; security: Security }[] = [
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'ssl' },
  { id: 'outlook', label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, security: 'starttls' },
  { id: 'web', label: 'WEB.DE', host: 'smtp.web.de', port: 587, security: 'starttls' },
  { id: 'gmx', label: 'GMX', host: 'mail.gmx.net', port: 587, security: 'starttls' }
]

export function EmailAccountSection() {
  const worker = useNexora((s) => s.worker)
  const connected = worker.state === 'connected'
  const [current, setCurrent] = useState<SmtpStatus>(null)
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [security, setSecurity] = useState<Security>('starttls')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddr, setFromAddr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = useCallback(() => {
    if (!connected) return
    window.nexora.getEmailAccount().then((s) => {
      setCurrent(s)
      if (s) {
        setHost(s.host)
        setPort(s.port)
        setSecurity(s.security)
        setUser(s.user)
        setFromAddr(s.fromAddr)
      }
    }, (e: unknown) => setError(cleanError(e)))
  }, [connected])
  useEffect(() => load(), [load])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setHost(p.host)
    setPort(p.port)
    setSecurity(p.security)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setTestResult(null)
    try {
      const status = await window.nexora.setEmailAccount({ host: host.trim(), port, security, user: user.trim(), password, fromAddr: fromAddr.trim() })
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
      setHost('')
      setPort(587)
      setSecurity('starttls')
      setUser('')
      setPassword('')
      setFromAddr('')
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel p-5" aria-labelledby="email-title">
      <h2 id="email-title" className="hud-label flex items-center gap-2">
        <Mail className="size-4 text-accent-hi" aria-hidden /> E-Mail-Konto (zum Senden)
      </h2>
      <p className="mt-2 text-sm text-text-2">
        Hinterlege dein Postfach, damit NEXORA auf Wunsch wirklich E-Mails senden kann. Bevor eine E-Mail rausgeht,
        fragt NEXORA dich jedes Mal einzeln. Das Passwort wird verschlüsselt im Betriebssystem gespeichert und hier nie angezeigt.
      </p>
      {!connected && <p className="mt-3 text-sm text-warning">NEXORA startet noch – das E-Mail-Konto lässt sich einrichten, sobald der Hintergrunddienst bereit ist.</p>}
      {current && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="size-3.5" aria-hidden /> Konto hinterlegt: {current.user} über {current.host}:{current.port}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      {connected && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Anbieter-Vorlagen">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn-ghost text-xs" onClick={() => applyPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <form className="mt-3 grid gap-2" onSubmit={save}>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-text-2">
                Server (SMTP)
                <input className="input text-sm" placeholder="smtp.beispiel.de" aria-label="SMTP-Server" value={host} onChange={(e) => setHost(e.target.value)} maxLength={255} required />
              </label>
              <label className="grid gap-1 text-xs text-text-2">
                Port
                <input className="input text-sm" type="number" min={1} max={65535} aria-label="Port" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} required />
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
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-text-2">
                Benutzername
                <input className="input text-sm" placeholder="name@beispiel.de" aria-label="Benutzername" value={user} onChange={(e) => setUser(e.target.value)} maxLength={320} required />
              </label>
              <label className="grid gap-1 text-xs text-text-2">
                Absender-Adresse
                <input className="input text-sm" type="email" placeholder="name@beispiel.de" aria-label="Absender-Adresse" value={fromAddr} onChange={(e) => setFromAddr(e.target.value)} maxLength={320} required />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-text-2">
              Passwort {current && <span className="text-text-2/60">(leer lassen = unverändert; erneut eingeben zum Ändern)</span>}
              <input className="input font-mono text-sm" type="password" autoComplete="off" placeholder={current ? '••••••••' : 'App-Passwort oder Postfach-Passwort'} aria-label="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={1024} required={!current} />
            </label>
            <p className="text-xs text-text-2">Tipp: Für Gmail/Outlook ist meist ein „App-Passwort“ nötig (nicht dein normales Login-Passwort).</p>

            {testResult && <p className={`text-xs ${testResult.ok ? 'text-success' : 'text-warning'}`}>{testResult.message}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {current && (
                <button type="button" className="btn-ghost text-sm hover:text-danger" disabled={busy} onClick={() => void remove()}>
                  <Trash2 className="size-4" aria-hidden /> Konto entfernen
                </button>
              )}
              <button type="button" className="btn-secondary" disabled={busy || !current} onClick={() => void test()} title={current ? 'Verbindung prüfen' : 'Erst speichern, dann prüfen'}>
                E-Mail-Verbindung testen
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !host.trim() || !user.trim() || !fromAddr.trim() || (!current && !password)}>
                <Send className="size-4" aria-hidden /> Speichern
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  )
}
