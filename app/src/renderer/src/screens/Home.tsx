import { ArrowRight, CheckCircle2, FileText, FolderOpen, FolderSync, Globe, Mail, Pause, Play, Repeat, Square, Undo2, XCircle } from 'lucide-react'
import { useNexora } from '../state/store'
import { selectActiveRuns, selectAgents, selectRuns } from '../state/selectors'
import { isTerminal, progressOf, type RunState } from '../state/runReducer'
import { WORKFLOWS } from '../data/workflows'
import { OrbitCore } from '../components/hud/OrbitCore'
import { ProgressBar } from '../components/common/ProgressBar'
import { DemoTag } from '../components/common/Panel'
import { canUndo, stopRun, togglePause, undoRun } from '../lib/actions'
import { formatTime } from '../lib/format'
import { TaskWizard } from '../components/home/TaskWizard'

const ICON: Record<string, typeof FolderSync> = { ordner: FolderSync, recherche: Globe, pdf: FileText, entwurf: Mail, wiederholen: Repeat }

/** Satz über den aktuellen Stand eines laufenden Vorgangs – ohne Fachbegriffe. */
function currentStep(run: RunState): string {
  if (run.paused) return 'Pausiert – klicke auf „Fortsetzen“, um weiterzumachen'
  if (run.status === 'waiting_approval') return 'Wartet auf deine Bestätigung'
  if (run.status === 'queued' || !run.planReady) return 'Bereitet vor …'
  const idx = run.steps.findIndex((s) => s.id === run.currentStepId)
  const step = run.steps[idx]
  if (step) return `Schritt ${idx + 1} von ${run.steps.length}: ${step.title}`
  return 'Arbeitet …'
}

function RunningCard({ run }: { run: RunState }) {
  const progress = progressOf(run)
  return (
    <article className="panel flex items-center gap-4 p-4" aria-label={`Läuft: ${run.title}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text">{run.title}</p>
          {run.source === 'demo' && <DemoTag />}
        </div>
        <p className={`mt-0.5 text-sm ${run.status === 'waiting_approval' || run.paused ? 'text-warning' : 'text-text-2'}`} aria-live="polite">
          {currentStep(run)}
        </p>
        <div className="mt-2">
          <ProgressBar value={progress} label={`Fortschritt ${run.title}`} tone={run.status === 'waiting_approval' ? 'warning' : 'accent'} />
        </div>
      </div>
      {run.source === 'live' && (
        <button type="button" className="btn-ghost" onClick={() => void togglePause(run).catch(() => undefined)}>
          {run.paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />} {run.paused ? 'Fortsetzen' : 'Pausieren'}
        </button>
      )}
      <button type="button" className="btn-ghost" onClick={() => void stopRun(run).catch(() => undefined)}>
        <Square className="size-4" aria-hidden /> Stoppen
      </button>
    </article>
  )
}

function DoneItem({ run }: { run: RunState }) {
  const data = useNexora((s) => s.data)
  const ok = run.status === 'succeeded'
  const artifact = [...data.artifacts].reverse().find((a) => a.runId === run.runId && a.uri?.startsWith('file:'))
  const sentence = ok ? (run.summary ?? run.verification) : run.status === 'cancelled' ? (run.error ?? 'Abgebrochen') : (run.error ?? 'Fehlgeschlagen')
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Erledigt" /> : <XCircle className={`mt-0.5 size-5 shrink-0 ${run.status === 'failed' ? 'text-danger' : 'text-text-2'}`} aria-label={run.status === 'failed' ? 'Fehlgeschlagen' : 'Abgebrochen'} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text">{run.title}</p>
          {run.source === 'demo' && <DemoTag />}
          <span className="ml-auto shrink-0 text-xs text-text-2">{run.endedAt ? formatTime(run.endedAt) : ''}</span>
        </div>
        {sentence && <p className="mt-0.5 text-sm text-text-2">{sentence}</p>}
        <div className="mt-1.5 flex gap-2">
          {artifact && run.source === 'live' && (
            <button type="button" className="btn-ghost -ml-2 text-xs" onClick={() => void window.nexora.revealArtifact(artifact.id)}>
              <FolderOpen className="size-3.5" aria-hidden /> Ergebnis anzeigen
            </button>
          )}
          {canUndo(data, run) && (
            <button type="button" className="btn-ghost text-xs" onClick={() => void undoRun(run).catch(() => undefined)}>
              <Undo2 className="size-3.5" aria-hidden /> Rückgängig machen
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

/** Startseite für Kunden: Aufgabe wählen, Fortschritt in Klartext, Ergebnisse. */
export function Home() {
  const data = useNexora((s) => s.data)
  const worker = useNexora((s) => s.worker)
  const demoMode = useNexora((s) => s.demoMode)
  const openWizard = useNexora((s) => s.setWizard)
  const setScreen = useNexora((s) => s.setScreen)
  const active = selectActiveRuns(data)
  const done = selectRuns(data).filter((r) => isTerminal(r.status) && r.workflow !== 'undo_organize').reverse().slice(0, 6)
  const agents = selectAgents(data)
  const cards = WORKFLOWS.filter((w) => w.id !== 'wiederholen')
  const ready = worker.state === 'connected' || demoMode

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-8 overflow-y-auto p-8">
      <header className="flex items-center gap-6">
        <div className="relative size-28 shrink-0" aria-hidden>
          <OrbitCore agents={agents} progress={active[0] ? progressOf(active[0]) : undefined} readouts={{ active: 0, pendingApprovals: 0, steps: '', cost: '' }} compact />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text">Was soll ich für dich erledigen?</h1>
          <p className="mt-1 text-text-2">
            {ready
              ? 'Wähle eine Aufgabe. Bevor NEXORA etwas verändert, fragt es dich – und du kannst alles rückgängig machen.'
              : worker.state === 'error'
                ? `Es gibt ein Problem beim Start: ${worker.message ?? 'unbekannt'}`
                : 'NEXORA startet gerade …'}
          </p>
        </div>
      </header>

      <section aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="sr-only">Aufgaben</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {cards.map((w) => {
            const Icon = ICON[w.id] ?? FolderSync
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => openWizard(w.id)}
                disabled={!ready}
                className="panel group flex flex-col items-start gap-3 p-5 text-left transition-colors hover:border-accent/60 hover:bg-panel-2 disabled:opacity-50"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-accent/15 shadow-[0_0_18px_rgba(244,63,103,0.18)]">
                  <Icon className="size-5 text-accent-hi" aria-hidden />
                </span>
                <span className="text-base font-semibold text-text">{w.simpleTitle}</span>
                <span className="flex-1 text-sm text-text-2">{w.simpleText}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-hi">
                  Starten <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
            )
          })}
        </div>
        <button type="button" className="btn-ghost mt-3 text-sm" onClick={() => setScreen('automations')}>
          <Repeat className="size-4" aria-hidden /> Gespeicherte Aufgaben wiederholen
        </button>
      </section>

      {active.length > 0 && (
        <section aria-labelledby="running-title">
          <h2 id="running-title" className="mb-3 text-lg font-semibold text-text">
            Läuft gerade
          </h2>
          <div className="grid gap-3">
            {active.map((r) => (
              <RunningCard key={r.runId} run={r} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="done-title" className="pb-8">
        <h2 id="done-title" className="mb-1 text-lg font-semibold text-text">
          Zuletzt erledigt
        </h2>
        {done.length === 0 ? (
          <p className="text-sm text-text-2">Noch nichts erledigt. Tipp: Probier es zuerst mit einem Testordner aus.</p>
        ) : (
          <ul className="panel px-5">
            {done.map((r) => (
              <DoneItem key={r.runId} run={r} />
            ))}
          </ul>
        )}
      </section>
      <TaskWizard />
    </div>
  )
}
