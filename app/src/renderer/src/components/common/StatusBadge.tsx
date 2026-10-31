import { Ban, CheckCircle2, CircleDashed, CircleDot, Hourglass, Loader2, PauseCircle, XCircle } from 'lucide-react'
import type { RunStatus } from '@shared/events'
import { AGENT_STATE_LABEL, type AgentVisualState } from '../../state/selectors'
import { cx } from '../../lib/format'

const RUN: Record<RunStatus, { label: string; icon: typeof CheckCircle2; tone: string; spin?: boolean }> = {
  queued: { label: 'In Warteschlange', icon: CircleDashed, tone: 'text-text-2' },
  running: { label: 'Läuft', icon: Loader2, tone: 'text-accent-hi', spin: true },
  waiting_approval: { label: 'Wartet auf Freigabe', icon: Hourglass, tone: 'text-warning' },
  succeeded: { label: 'Erfolgreich', icon: CheckCircle2, tone: 'text-success' },
  failed: { label: 'Fehlgeschlagen', icon: XCircle, tone: 'text-danger' },
  cancelled: { label: 'Abgebrochen', icon: Ban, tone: 'text-text-2' }
}

const AGENT: Record<AgentVisualState, { icon: typeof CheckCircle2; tone: string; spin?: boolean }> = {
  idle: { icon: PauseCircle, tone: 'text-text-2' },
  planning: { icon: CircleDot, tone: 'text-accent-hi' },
  executing: { icon: Loader2, tone: 'text-accent', spin: true },
  waiting: { icon: Hourglass, tone: 'text-warning' },
  done: { icon: CheckCircle2, tone: 'text-success' },
  failed: { icon: XCircle, tone: 'text-danger' }
}

/** Status immer als Icon + Text, nie nur über Farbe. */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN[status]
  const Icon = s.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', s.tone)}>
      <Icon className={cx('size-3.5', s.spin && 'motion-safe:animate-spin')} aria-hidden />
      {s.label}
    </span>
  )
}

export function AgentStateBadge({ state }: { state: AgentVisualState }) {
  const s = AGENT[state]
  const Icon = s.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', s.tone)}>
      <Icon className={cx('size-3.5', s.spin && 'motion-safe:animate-spin')} aria-hidden />
      {AGENT_STATE_LABEL[state]}
    </span>
  )
}
