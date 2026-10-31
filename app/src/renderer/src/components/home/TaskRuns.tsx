/*
 * Fortschritt und Ergebnisse laufender/erledigter Aufgaben – wird im Chat nur angezeigt, wenn gerade
 * etwas läuft oder kürzlich etwas erledigt wurde. Sonst bleibt der Chat leer und ruhig.
 * (Aus der früheren Startseite herausgelöst, damit es im Chat-first-Aufbau weiterlebt.)
 */
import { CheckCircle2, FolderOpen, Pause, Play, Square, Undo2, XCircle } from 'lucide-react'
import { useNexora } from '../../state/store'
import { selectActiveRuns, selectRuns } from '../../state/selectors'
import { isTerminal, progressOf, type RunState } from '../../state/runReducer'
import { ProgressBar } from '../common/ProgressBar'
import { DemoTag } from '../common/Panel'
import { canUndo, stopRun, togglePause, undoRun } from '../../lib/actions'
import { formatTime } from '../../lib/format'

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
          <ProgressBar value={progressOf(run)} label={`Fortschritt ${run.title}`} tone={run.status === 'waiting_approval' ? 'warning' : 'accent'} />
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

export function TaskRuns() {
  const data = useNexora((s) => s.data)
  const active = selectActiveRuns(data)
  const done = selectRuns(data)
    .filter((r) => isTerminal(r.status) && r.workflow !== 'undo_organize')
    .reverse()
    .slice(0, 4)
  if (active.length === 0 && done.length === 0) return null
  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <section aria-labelledby="running-title">
          <h2 id="running-title" className="mb-2 text-sm font-semibold text-text">Läuft gerade</h2>
          <div className="grid gap-2">
            {active.map((r) => (
              <RunningCard key={r.runId} run={r} />
            ))}
          </div>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="done-title">
          <h2 id="done-title" className="mb-1 text-sm font-semibold text-text">Zuletzt erledigt</h2>
          <ul className="panel px-5">
            {done.map((r) => (
              <DoneItem key={r.runId} run={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
