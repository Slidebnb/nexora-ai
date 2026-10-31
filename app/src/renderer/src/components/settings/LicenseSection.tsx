import { useEffect, useState } from 'react'
import { BadgeCheck, KeySquare } from 'lucide-react'
import type { LicenseStatus } from '@shared/ipc-contract'
import { cleanError } from '../../lib/actions'

const STATE_LABEL: Record<LicenseStatus['state'], string> = {
  unconfigured: 'Entwicklungsversion',
  trial: 'Testzeitraum',
  active: 'Aktiv',
  expired: 'Bestätigung abgelaufen',
  trial_over: 'Testzeitraum beendet'
}
const FEATURE_LABEL: Record<string, string> = { workflows: 'echte Aufgaben', schedules: 'Zeitpläne', cloud_ai: 'Cloud-KI' }

function daysLeft(iso?: string): string {
  if (!iso) return ''
  const d = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)
  return d > 0 ? `noch ${d} Tag${d === 1 ? '' : 'e'}` : ''
}

export function LicenseSection() {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.nexora.getLicenseStatus().then(setStatus, (e: unknown) => setError(cleanError(e)))
  }, [])

  const run = async (fn: () => Promise<LicenseStatus>) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await fn())
      setKey('')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel p-5" aria-labelledby="lic-title">
      <h2 id="lic-title" className="hud-label">Lizenz</h2>
      {status && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" data-testid="license-status">
          <BadgeCheck className={`size-5 ${status.state === 'active' ? 'text-success' : status.state === 'trial' || status.state === 'unconfigured' ? 'text-accent-hi' : 'text-warning'}`} aria-hidden />
          <span className="font-medium text-text">
            {STATE_LABEL[status.state]}
            {status.plan ? ` · ${status.plan}` : ''}
          </span>
          <span className="text-text-2">{daysLeft(status.expiresAt)}</span>
          {status.keyHint && <span className="font-mono text-xs text-text-2">Schlüssel …{status.keyHint}</span>}
        </div>
      )}
      {status?.message && <p className="mt-1 text-xs text-text-2">{status.message}</p>}
      {status && (
        <p className="mt-1 text-xs text-text-2">
          Enthalten: {status.features.length ? status.features.map((f) => FEATURE_LABEL[f] ?? f).join(', ') : 'nur Demo-Modus'}
        </p>
      )}
      {status && status.state !== 'unconfigured' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => window.nexora.activateLicense(key.trim()))
          }}
        >
          <KeySquare className="mt-2 size-4 text-text-2" aria-hidden />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="NXR-XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Lizenzschlüssel" className="input flex-1 font-mono text-sm" disabled={busy} />
          <button type="submit" className="btn-primary" disabled={busy || !key.trim()}>
            Aktivieren
          </button>
          {status.state === 'active' && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(() => window.nexora.clearLicense())}>
              Von diesem Gerät entfernen
            </button>
          )}
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      <p className="mt-3 text-xs text-text-2">
        Bezahlung und Rechnungen laufen über Stripe auf der NEXORA-Website. Die App speichert keine Zahlungsdaten; die Lizenz wird lokal
        gespeichert und funktioniert 14 Tage auch ohne Internet.
      </p>
    </section>
  )
}
