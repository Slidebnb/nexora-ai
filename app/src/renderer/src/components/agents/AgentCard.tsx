import type { AgentView } from '../../state/selectors'
import { progressOf, isTerminal } from '../../state/runReducer'
import { formatDuration, useNow, cx } from '../../lib/format'
import { AgentStateBadge } from '../common/StatusBadge'
import { ProgressBar } from '../common/ProgressBar'
import { DemoTag } from '../common/Panel'

const RING: Record<AgentView['state'], string> = {
  idle: 'border-line',
  planning: 'border-accent-hi/50',
  executing: 'border-accent/60 shadow-[0_0_14px_rgba(244,63,103,0.18)]',
  waiting: 'border-warning/60',
  done: 'border-success/50',
  failed: 'border-danger/60'
}

export function AgentCard({ agent, detailed = false }: { agent: AgentView; detailed?: boolean }) {
  const run = agent.run
  const running = !!run && !isTerminal(run.status)
  const now = useNow(running)
  const step = run?.steps.find((s) => s.id === run.currentStepId)
  const duration = run ? (run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.createdAt) : 0
  const progress = run ? progressOf(run) : null
  const tone = agent.state === 'failed' ? 'danger' : agent.state === 'waiting' ? 'warning' : agent.state === 'done' ? 'success' : 'accent'

  return (
    <article className={cx('min-w-0 rounded-md border bg-panel-2/60 p-3 transition-colors', RING[agent.state])} aria-label={`Agent ${agent.name}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-text">{agent.name}</span>
          {run?.source === 'demo' && <DemoTag />}
        </div>
        <AgentStateBadge state={agent.state} />
      </div>
      {run && (
        <>
          <p className="mt-1 truncate text-xs text-text-2" title={run.title}>{run.title}</p>
          <p className="mt-2 truncate text-xs text-text" aria-live="polite">
            {step ? `▸ ${step.title}` : run.status === 'waiting_approval' ? '▸ Wartet auf deine Freigabe' : run.verification ?? run.error ?? ' '}
          </p>
          <div className="mt-2">
            <ProgressBar value={run.status === 'succeeded' ? (progress ?? 1) : isTerminal(run.status) ? (progress ?? 0) : progress} label={`Fortschritt ${agent.name}`} tone={tone} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-text-2">
            <span>{run.stepsTotal !== undefined ? `${run.stepsDone}/${run.stepsTotal} Schritte` : 'Schritte: unbekannt'}</span>
            <span>{formatDuration(duration)}</span>
          </div>
          {detailed && run.steps.length > 0 && (
            <ol className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
              {run.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={cx('w-4 text-center', s.status === 'succeeded' && 'text-success', s.status === 'failed' && 'text-danger', s.status === 'running' && 'text-accent-hi')} aria-hidden>
                    {s.status === 'succeeded' ? '✓' : s.status === 'failed' ? '✕' : s.status === 'running' ? '▸' : '·'}
                  </span>
                  <span className={s.status === 'pending' ? 'text-text-2' : 'text-text'}>{s.title}</span>
                  <span className="sr-only">({s.status})</span>
                  {s.error && <span className="ml-auto text-danger">{s.error}</span>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </article>
  )
}
