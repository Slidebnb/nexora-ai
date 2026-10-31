import { useEffect, useState } from 'react'
import { Cpu, HardDrive, PanelRight, Pause, Square, WifiOff } from 'lucide-react'
import { SCREEN_LABEL, useNexora } from '../../state/store'
import { selectActiveRuns, selectKpis } from '../../state/selectors'
import { stopAllDemoRuns } from '../../demo/controller'
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
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  const hasDemoActive = demoMode && activeRuns.some((r) => r.source === 'demo')

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-base-2/80 px-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-[0.25em] text-text">NEXORA</h1>
        {/* Breadcrumb nach cyberpunk-dashboard (app/page.tsx) */}
        <span className="text-xs text-text-2 max-xl:hidden">
          COMMAND / <span className="text-accent-hi">{SCREEN_LABEL[screen].toUpperCase()}</span>
        </span>
      </div>

      <div className="ml-2 flex items-center gap-4 whitespace-nowrap text-xs text-text-2">
        <span className="inline-flex items-center gap-1.5" title="Der lokale Worker wird in Phase 2 angebunden.">
          <WifiOff className="size-3.5 text-text-2" aria-hidden /> Worker: nicht verbunden
        </span>
        <span className="inline-flex items-center gap-1.5" title="Es ist keine Cloud-Verarbeitung aktiv.">
          <HardDrive className="size-3.5" aria-hidden /> <span className="max-xl:hidden">Verarbeitung:</span> lokal
        </span>
        <span className="inline-flex items-center gap-1.5" title="Summe aus cost_updated-Events">
          <Cpu className="size-3.5" aria-hidden /> <span className="max-xl:hidden">API-Kosten:</span> {formatUsd(kpis.costUsd)}
          {demoMode && kpis.costUsd > 0 && <span className="text-warning">(simuliert)</span>}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="btn-ghost" disabled title="Pausieren folgt mit dem Worker (Phase 2)">
          <Pause className="size-4" aria-hidden /> <span className="max-xl:sr-only">Pause</span>
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!hasDemoActive}
          onClick={stopAllDemoRuns}
          title={hasDemoActive ? 'Alle laufenden Demo-Vorgänge stoppen' : 'Kein laufender Vorgang'}
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
