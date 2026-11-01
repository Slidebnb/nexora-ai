/*
 * „Kommandozentrale": Kartenanordnung portiert aus raheem-dotgit/cyberpunk-dashboard
 * (app/command-center/page.tsx, im README als MIT bezeichnet – siehe THIRD_PARTY_NOTICES.md). An unseren Stack
 * angepasst (React 19 + Tailwind 4 + Theme-Tokens statt Next.js/shadcn/neutral+orange).
 *
 * WICHTIG: Die Original-Vorlage zeigt erfundene Spionage-Dummy-Daten (Agenten, Missionen, Chat-Logs). Diese Ansicht
 * übernimmt NUR das Layout/den Look und füllt es ausschließlich mit ECHTEN NEXORA-Daten aus dem Zustand
 * (Vorgänge, Agenten, Ereignisse, Kosten). Es werden keine Werte erfunden.
 */
import { useNexora } from '../../state/store'
import { selectAgents, selectKpis, selectCostSeries, AGENT_STATE_LABEL, type AgentVisualState } from '../../state/selectors'
import { WireframeGlobe } from '../hud/WireframeGlobe'
import { formatUsd, formatTime } from '../../lib/format'
import type { NexoraEvent } from '@shared/events'

const DOT: Record<AgentVisualState, string> = {
  idle: 'bg-text-2',
  planning: 'bg-accent-hi',
  executing: 'bg-accent-hi',
  waiting: 'bg-warning',
  done: 'bg-success',
  failed: 'bg-danger'
}

const EVENT_TEXT: Record<string, string> = {
  run_created: 'Vorgang gestartet',
  plan_ready: 'Plan erstellt',
  step_started: 'Schritt begonnen',
  step_succeeded: 'Schritt erledigt',
  step_failed: 'Schritt fehlgeschlagen',
  approval_requested: 'Freigabe angefragt',
  approval_resolved: 'Freigabe entschieden',
  artifact_created: 'Ergebnis erstellt',
  run_succeeded: 'Vorgang erfolgreich',
  run_failed: 'Vorgang fehlgeschlagen',
  run_cancelled: 'Vorgang abgebrochen',
  cost_updated: 'Kosten aktualisiert',
  run_paused: 'Pausiert',
  run_resumed: 'Fortgesetzt'
}

function Title({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-text-2">{children}</h3>
}

function MiniCostChart({ series }: { series: { t: number; usd: number }[] }) {
  if (series.length < 2) {
    return <div className="flex h-40 items-center justify-center text-xs text-text-2">Noch keine Kostendaten.</div>
  }
  const max = Math.max(...series.map((p) => p.usd)) || 1
  const pts = series
    .map((p, i) => `${(i / (series.length - 1)) * 350},${150 - (p.usd / max) * 130}`)
    .join(' ')
  return (
    <div className="relative h-40">
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 opacity-20" aria-hidden>
        {Array.from({ length: 48 }).map((_, i) => (
          <div key={i} className="border border-line" />
        ))}
      </div>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 350 150" preserveAspectRatio="none" aria-hidden>
        <polyline points={pts} fill="none" stroke="var(--color-accent-hi)" strokeWidth="2" />
      </svg>
    </div>
  )
}

export function CommandCenter() {
  const data = useNexora((s) => s.data)
  const kpis = selectKpis(data)
  const agents = selectAgents(data)
  const costSeries = selectCostSeries(data)
  const events = (data.log as NexoraEvent[]).slice(-6).reverse()

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Vorgänge (echte Zählwerte + echte Agenten) */}
      <section className="panel p-4 lg:col-span-4" aria-label="Vorgänge">
        <Title>Vorgänge</Title>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-mono text-2xl font-bold text-text">{kpis.active}</div>
            <div className="text-xs text-text-2">Aktiv</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-success">{kpis.succeeded}</div>
            <div className="text-xs text-text-2">Erledigt</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-danger">{kpis.failed}</div>
            <div className="text-xs text-text-2">Fehlgeschlagen</div>
          </div>
        </div>
        <div className="space-y-2">
          {agents.length === 0 && <p className="text-xs text-text-2">Noch keine Agenten aktiv.</p>}
          {agents.slice(0, 6).map((a) => (
            <div key={a.agentId} className="flex items-center gap-3 rounded bg-panel-2 p-2">
              <span className={`size-2 shrink-0 rounded-full ${DOT[a.state]} ${a.state === 'executing' || a.state === 'waiting' ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-text">{a.name}</span>
                <span className="block text-xs text-text-2">{AGENT_STATE_LABEL[a.state]}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Aktivität (echte letzte Ereignisse) */}
      <section className="panel p-4 lg:col-span-4" aria-label="Aktivität">
        <Title>Aktivität</Title>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {events.length === 0 && <p className="text-xs text-text-2">Noch keine Aktivität.</p>}
          {events.map((e) => (
            <div key={e.id} className="rounded border-l-2 border-accent pl-3 text-xs">
              <div className="font-mono text-text-2">{formatTime(e.timestamp)}</div>
              <div className="text-text">{EVENT_TEXT[e.type] ?? e.type}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Status mit Wireframe-Kugel (Deko) + echte Kennzahlen */}
      <section className="panel flex flex-col items-center p-4 lg:col-span-4" aria-label="Status">
        <Title>Status</Title>
        <div className="relative mb-4 size-28">
          <WireframeGlobe opacity={0.5} />
        </div>
        <div className="w-full space-y-1 font-mono text-xs text-text-2">
          <div className="flex justify-between"><span>Offene Freigaben</span><span className="text-warning">{kpis.pendingApprovals}</span></div>
          <div className="flex justify-between"><span>Vorgänge gesamt</span><span className="text-text">{kpis.total}</span></div>
          <div className="flex justify-between"><span>Kosten gesamt</span><span className="text-accent-hi">{formatUsd(kpis.costUsd)}</span></div>
        </div>
      </section>

      {/* Kostenverlauf (echte Kostenreihe) */}
      <section className="panel p-4 lg:col-span-8" aria-label="Kostenverlauf">
        <Title>Kostenverlauf</Title>
        <MiniCostChart series={costSeries} />
      </section>

      {/* Ergebnisse (echte Zählwerte) */}
      <section className="panel p-4 lg:col-span-4" aria-label="Ergebnisse">
        <Title>Ergebnisse</Title>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-2"><span className="size-2 rounded-full bg-success" aria-hidden /> Erfolgreich</span>
            <span className="font-mono font-bold text-text">{kpis.succeeded}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-2"><span className="size-2 rounded-full bg-danger" aria-hidden /> Fehlgeschlagen</span>
            <span className="font-mono font-bold text-text">{kpis.failed}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-2"><span className="size-2 rounded-full bg-warning" aria-hidden /> Wartet auf Freigabe</span>
            <span className="font-mono font-bold text-text">{kpis.pendingApprovals}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
