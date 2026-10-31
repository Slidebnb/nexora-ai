/*
 * Vorgangsdetails im Aufbau des Detail-Dialogs aus cyberpunk-dashboard `app/operations/page.tsx`
 * (MIT laut README, siehe THIRD_PARTY_NOTICES.md): Kopf, Status, Fortschritt, Kennfelder, Liste.
 * Inhalte ausschließlich aus echten Events (Schritte, Freigaben, Ergebnisse).
 */
import { CheckCircle2, Circle, FolderOpen, Loader2, XCircle } from 'lucide-react'
import { useNexora } from '../../state/store'
import { progressOf, type RunState, type StepStatus } from '../../state/runReducer'
import { DetailModal, Field } from '../common/Cyber'
import { RunStatusBadge } from '../common/StatusBadge'
import { ProgressBar } from '../common/ProgressBar'
import { cx, formatDuration, formatTime, formatUsd } from '../../lib/format'

const STEP_ICON: Record<StepStatus, { icon: typeof Circle; tone: string }> = {
  pending: { icon: Circle, tone: 'text-text-2' },
  running: { icon: Loader2, tone: 'text-accent-hi' },
  succeeded: { icon: CheckCircle2, tone: 'text-success' },
  failed: { icon: XCircle, tone: 'text-danger' }
}

const DECISION: Record<string, string> = { allow: 'Erlaubt', deny: 'Abgelehnt', cancel: 'Abgebrochen' }

export function RunDetail({ run, onClose }: { run: RunState; onClose: () => void }) {
  const allApprovals = useNexora((s) => s.data.approvals)
  const allArtifacts = useNexora((s) => s.data.artifacts)
  const expert = useNexora((s) => s.expertMode)
  const approvals = Object.values(allApprovals).filter((a) => a.runId === run.runId)
  const artifacts = allArtifacts.filter((a) => a.runId === run.runId)
  return (
    <DetailModal title={run.title} subtitle={expert ? run.runId : undefined} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-3">
        <RunStatusBadge status={run.status} />
        {run.paused && <span className="text-xs text-warning">pausiert</span>}
      </div>
      <ProgressBar value={progressOf(run)} label={`Fortschritt ${run.title}`} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {expert && <Field label="Agent">{run.agentName ?? run.agentId ?? '–'}</Field>}
        <Field label="Gestartet">{formatTime(run.createdAt)}</Field>
        <Field label="Dauer">{run.endedAt ? formatDuration(Date.parse(run.endedAt) - Date.parse(run.createdAt)) : 'läuft'}</Field>
        {expert && <Field label="Kosten">{formatUsd(run.costUsd)}</Field>}
      </div>
      {(run.summary || run.verification || run.error) && (
        <Field label={run.error ? 'Fehler' : 'Ergebnis und Prüfung'}>
          <p className={run.error ? 'text-danger' : ''}>{run.error ?? run.summary}</p>
          {run.verification && <p className="mt-1 text-xs text-text-2">Prüfung: {run.verification}</p>}
        </Field>
      )}

      <Field label={`Schritte (${run.stepsDone}${run.stepsTotal !== undefined ? ` von ${run.stepsTotal}` : ''})`}>
        {run.steps.length === 0 ? (
          <p className="text-text-2">Noch kein Plan.</p>
        ) : (
          <ol className="space-y-1.5">
            {run.steps.map((st) => {
              const { icon: Icon, tone } = STEP_ICON[st.status]
              return (
                <li key={st.id} className="flex items-start gap-2">
                  <Icon className={cx('mt-0.5 size-4 shrink-0', tone, st.status === 'running' && 'motion-safe:animate-spin')} aria-hidden />
                  <span>
                    {st.title}
                    {(st.summary || st.error) && <span className={cx('block text-xs', st.error ? 'text-danger' : 'text-text-2')}>{st.error ?? st.summary}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </Field>

      {approvals.length > 0 && (
        <Field label="Freigaben">
          <ul className="space-y-1.5">
            {approvals.map((a) => (
              <li key={a.id} className="rounded border border-line px-3 py-2">
                <span className="font-medium">{a.action}</span> – {a.target}
                <span className={cx('ml-2 text-xs', a.decision === 'deny' ? 'text-danger' : a.decision ? 'text-success' : 'text-warning')}>
                  {a.decision ? (DECISION[a.decision] ?? a.decision) : 'offen'}
                </span>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {artifacts.length > 0 && (
        <Field label="Ergebnisse">
          <ul className="space-y-1">
            {artifacts.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="truncate">{a.name}</span>
                {run.source === 'live' && a.uri?.startsWith('file:') && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => void window.nexora.revealArtifact(a.id)}>
                    <FolderOpen className="size-3.5" aria-hidden /> Anzeigen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {expert && run.protocolErrors.length > 0 && <p className="text-xs text-danger">Protokollfehler: {run.protocolErrors.join('; ')}</p>}
    </DetailModal>
  )
}
