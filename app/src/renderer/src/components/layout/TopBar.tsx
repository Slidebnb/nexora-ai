import { useEffect, useState } from 'react'
import { Cpu, HardDrive, Loader2, PanelRight, Pause, Play, Square, Wifi, WifiOff } from 'lucide-react'
import { SCREEN_LABEL, useNexora } from '../../state/store'
import { selectActiveRuns, selectKpis } from '../../state/selectors'
import { stopRun, togglePause } from '../../lib/actions'
import { formatUsd } from '../../lib/format'

const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function TopBar() {
  const data = useNexora((s) => s.data)
  const kpis = selectKpis(data)
  const activeRuns = selectActiveRuns(data)
  const demoMode = useNexora((s) => s.demoMode)
  const toggleRight = useNexora((s) => s.toggleRightPanel)
  const rightOpen = useNexora((s) => s.rightPanelOpen)
  const screen = useNexora((s) => s.screen)
  const worker = useNexora((s) => s.worker)
  const expert = useNexora((s) => s.expertMode)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  const hasActive = activeRuns.length > 0
  const liveActive = activeRuns.filter((r) => r.source === 'live')
  const allPaused = liveActive.length > 0 && liveActive.every((r) => r.paused)
  const WorkerIcon = worker.state === 'connected' ? Wifi : worker.state === 'starting' ? Loader2 : WifiOff
  const workerLabel = expert
    ? `Worker: ${{ connected: 'verbunden', starting: 'startet …', disconnected: 'nicht verbunden', error: 'Fehler' }[worker.state]}`
    : { connected: 'Bereit', starting: 'Startet …', disconnected: 'Nicht bereit', error: 'Problem beim Start' }[worker.state]

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-base-2/80 px-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-[0.25em] text-text">NEXORA</h1>
        {/* Breadcrumb nach cyberpunk-dashboard (app/page.tsx) */}
        {expert && (
          <span className="text-xs text-text-2 max-xl:hidden">
            COMMAND / <span className="text-accent-hi">{SCREEN_LABEL[screen].toUpperCase()}</span>
          </span>
        )}
      </div>

      <div className="ml-2 flex items-center gap-4 whitespace-nowrap text-xs text-text-2">
        <span
          className={`inline-flex items-center gap-1.5 ${worker.state === 'connected' ? 'text-success' : worker.state === 'error' ? 'text-danger' : ''}`}
          title={worker.message ?? 'Lokaler Worker (127.0.0.1)'}
        >
          <WorkerIcon className={`size-3.5 ${worker.state === 'starting' ? 'motion-safe:animate-spin' : ''}`} aria-hidden /> {workerLabel}
        </span>
        <span className="inline-flex items-center gap-1.5" title="Deine Daten bleiben auf deinem PC, außer du erlaubst ausdrücklich Cloud-KI.">
          <HardDrive className="size-3.5" aria-hidden /> {expert ? <><span className="max-xl:hidden">Verarbeitung:</span> lokal</> : 'Läuft auf deinem PC'}
        </span>
        {(expert || kpis.costUsd > 0) && (
        <span className="inline-flex items-center gap-1.5" title="Summe der von den KI-Anbietern gemeldeten Kosten">
          <Cpu className="size-3.5" aria-hidden /> <span className="max-xl:hidden">API-Kosten:</span> {formatUsd(kpis.costUsd)}
          {demoMode && kpis.costUsd > 0 && <span className="text-warning">(simuliert)</span>}
        </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={liveActive.length === 0}
          onClick={() => liveActive.filter((r) => Boolean(r.paused) === allPaused).forEach((r) => void togglePause(r).catch(() => undefined))}
          title={liveActive.length ? (allPaused ? 'Alle angehaltenen Aufgaben fortsetzen' : 'Alle laufenden Aufgaben anhalten') : 'Keine laufende Aufgabe'}
        >
          {allPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}{' '}
          <span className="max-xl:sr-only">{allPaused ? 'Fortsetzen' : 'Pause'}</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!hasActive}
          onClick={() => activeRuns.forEach((r) => void stopRun(r).catch(() => undefined))}
          title={hasActive ? 'Alle laufenden Vorgänge stoppen' : 'Kein laufender Vorgang'}
        >
          <Square className="size-4" aria-hidden /> <span className="max-xl:sr-only">Stopp</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={toggleRight}
          aria-pressed={rightOpen}
          title="Seitenleiste mit Agenten und Aktivität ein-/ausblenden"
        >
          <PanelRight className="size-4" aria-hidden />
          <span className="sr-only">Seitenleiste umschalten</span>
        </button>
        <span className="ml-2 font-mono text-sm tabular-nums text-text-2">{clock.format(now)}</span>
        <span className="ml-2 flex size-8 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-text-2" title="Profil (folgt mit Lizenzierung)">
          Du
        </span>
      </div>
    </header>
  )
}
