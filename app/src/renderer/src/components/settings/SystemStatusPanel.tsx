/*
 * Systemzustand – Masterplan-Modul „SystemStatus: echte Worker-/Browser-/Modellverbindung“.
 * BarGauge, DataRow und der Bogen-Anzeiger sind aus jenman `SystemPanel.tsx` portiert
 * (MIT, Copyright (c) 2025 Shaik Davood, siehe THIRD_PARTY_NOTICES.md). Geändert: NEXORA-Farbvariablen,
 * keine framer-motion-Abhängigkeit, und es werden ausschließlich gemessene Werte angezeigt
 * (die Vorlage zeigte feste bzw. zufällige Werte wie „HULL 98“).
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react'
import type { SystemStatus } from '@shared/ipc-contract'
import { useNexora } from '../../state/store'
import { cleanError } from '../../lib/actions'

const GB = 1024 ** 3

function levelColor(pct: number, warn: number, danger: number): string {
  return pct >= danger ? 'var(--color-danger)' : pct >= warn ? 'var(--color-warning)' : 'var(--color-success)'
}

/** Segmentierte Balkenanzeige (portiert aus jenman `BarGauge`). */
export function BarGauge({ label, value, max, unit, warn = 75, danger = 90 }: { label: string; value: number; max: number; unit: string; warn?: number; danger?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = levelColor(pct, warn, danger)
  const segs = 30
  const lit = Math.round(pct / (100 / segs))
  return (
    <div className="flex flex-col gap-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="flex justify-between text-xs">
        <span className="text-text-2">{label}</span>
        <span style={{ color }}>
          {value.toFixed(1)} {unit} von {max.toFixed(1)} {unit}
        </span>
      </div>
      <div className="flex h-[6px] gap-[2px]" aria-hidden>
        {Array.from({ length: segs }, (_, i) => {
          const on = i < lit
          const c = on ? (i >= segs * (danger / 100) ? 'var(--color-danger)' : i >= segs * (warn / 100) ? 'var(--color-warning)' : 'var(--color-success)') : 'var(--color-line)'
          return <div key={i} style={{ flex: 1, borderRadius: 1, background: c, boxShadow: on ? `0 0 4px ${c}` : 'none' }} />
        })}
      </div>
    </div>
  )
}

/** Bogen-Anzeiger (portiert aus jenman, dort für feste Fantasiewerte genutzt). */
export function ArcGauge({ label, pct }: { label: string; pct: number }) {
  const TAU = Math.PI * 2
  const r = 22
  const size = 54
  const start = 112.5 // 0.625π in Grad
  const value = Math.max(0, Math.min(100, pct))
  const col = levelColor(value, 75, 90)
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(value)} %`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" strokeDasharray={`${TAU * 0.75 * r} ${TAU * 0.25 * r + 1}`} strokeLinecap="round" transform={`rotate(${start} ${size / 2} ${size / 2})`} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3" strokeDasharray={`${(value / 100) * TAU * 0.75 * r} 9999`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${col})` }} transform={`rotate(${start} ${size / 2} ${size / 2})`} />
        <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="11" fontWeight="bold">
          {Math.round(value)}%
        </text>
      </svg>
      <span className="text-[10px] text-text-2">{label}</span>
    </div>
  )
}

/** Zeile Bezeichnung/Wert (portiert aus jenman `DataRow`). */
export function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-xs text-text-2">{label}</span>
      <span className="text-right font-mono text-xs text-text">{value}</span>
    </div>
  )
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
      <span>{children}</span>
    </li>
  )
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`
}

export function SystemStatusPanel() {
  const worker = useNexora((s) => s.worker)
  const expertMode = useNexora((s) => s.expertMode)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const connected = worker.state === 'connected'

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await window.nexora.getSystemStatus())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (connected) void load()
  }, [connected, load])

  const disk = status?.disk
  const diskPct = disk && disk.total > 0 ? (disk.used / disk.total) * 100 : 0

  return (
    <section className="panel p-5" aria-labelledby="system-title" data-testid="system-status">
      <div className="flex items-center justify-between gap-2">
        <h2 id="system-title" className="hud-label">Systemzustand</h2>
        <button type="button" className="btn-ghost text-xs" onClick={() => void load()} disabled={!connected || busy}>
          <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Neu prüfen
        </button>
      </div>

      {!connected && <p className="mt-3 text-sm text-warning">NEXORA startet noch – der Systemzustand erscheint, sobald der Hintergrunddienst bereit ist.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      {status && disk && (
        <>
          <ul className="mt-3 grid gap-1.5">
            <Check ok>Hintergrunddienst läuft (seit {formatUptime(status.worker.uptimeSeconds)})</Check>
            <Check ok={status.ocr.available}>{status.ocr.available ? 'Texterkennung für eingescannte PDFs ist verfügbar' : 'Texterkennung für eingescannte PDFs ist nicht installiert (normale PDFs funktionieren trotzdem)'}</Check>
            <Check ok={status.browserUse.installed}>{status.browserUse.installed ? 'KI-Browser für Web-Recherche ist installiert' : 'KI-Browser nicht installiert – Web-Recherche nutzt die einfache Seitenabfrage'}</Check>
            <Check ok={status.ai.anthropic || status.ai.openai}>
              {status.ai.anthropic || status.ai.openai
                ? `KI-Schlüssel hinterlegt: ${[status.ai.anthropic && 'Anthropic', status.ai.openai && 'OpenAI'].filter(Boolean).join(', ')}`
                : 'Kein KI-Schlüssel hinterlegt – Aufgaben ohne KI funktionieren trotzdem'}
            </Check>
            <Check ok={disk.free > 1 * GB}>{disk.free > 1 * GB ? 'Genug freier Speicherplatz' : 'Wenig freier Speicherplatz'}</Check>
          </ul>

          <div className="mt-4 flex items-center gap-4">
            <ArcGauge label="Speicher belegt" pct={diskPct} />
            <div className="flex-1">
              <BarGauge label="Festplatte (NEXORA-Datenordner)" value={disk.used / GB} max={disk.total / GB} unit="GB" />
            </div>
          </div>

          {expertMode && (
            <div className="mt-4">
              <DataRow label="Worker-Version" value={`${status.worker.version}${status.worker.frozen ? ' (Paket)' : ' (Entwicklung)'}`} />
              <DataRow label="Python / System" value={`${status.worker.python} · ${status.worker.platform}`} />
              <DataRow label="Datenbank" value={`Schema v${status.database.schemaVersion} · ${(status.database.bytes / 1024).toFixed(0)} KB`} />
              <DataRow label="Läufe / Ereignisse / Vorlagen" value={`${status.database.runs} / ${status.database.events} / ${status.database.templates}`} />
              <DataRow label="Texterkennung" value={status.ocr.version ?? '–'} />
              <DataRow label="browser-use" value={status.browserUse.version ?? '–'} />
              <DataRow label="Workflows" value={status.workflows.join(', ')} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
