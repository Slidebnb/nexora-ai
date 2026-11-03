import { useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { ApprovalDecision } from '@shared/events'
import { useNexora } from '../../state/store'
import { selectPendingApprovals } from '../../state/selectors'
import type { ApprovalState } from '../../state/runReducer'
import { cleanError, respondApproval } from '../../lib/actions'
import { formatTime } from '../../lib/format'
import { DemoTag } from '../common/Panel'

interface ApprovalCardProps {
  approval: ApprovalState
  runTitle?: string
  onRespond: (decision: ApprovalDecision) => void
  autoFocus?: boolean
}

/** Zeigt konkret, was passieren soll. Standardfokus liegt auf „Ablehnen“. */
export function ApprovalCard({ approval, runTitle, onRespond, autoFocus }: ApprovalCardProps) {
  const denyRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (autoFocus) denyRef.current?.focus()
  }, [autoFocus])

  return (
    <article className="rounded-md border border-warning/50 bg-panel p-4" aria-label={`Freigabe: ${approval.action}`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 text-warning" aria-hidden />
        <h3 className="font-semibold text-text">{approval.action}</h3>
        {approval.source === 'demo' && <DemoTag />}
        <span className="ml-auto font-mono text-[11px] text-text-2">{formatTime(approval.requestedAt)}</span>
      </div>
      {runTitle && <p className="mt-1 text-xs text-text-2">Vorgang: {runTitle}</p>}
      <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-text-2">Wo</dt>
        <dd className="min-w-0">
          {/* Pfade: groß nur der Name („Downloads“), der volle Pfad klein darunter zum Nachprüfen */}
          {/^([A-Za-z]:\\|\/)/.test(approval.target) ? (
            <>
              <span className="block text-sm font-medium text-text">„{approval.target.split(/[\\/]/).filter(Boolean).pop() ?? approval.target}“</span>
              <span className="block break-all font-mono text-[11px] text-text-2">{approval.target}</span>
            </>
          ) : (
            <span className="break-all text-sm text-text">{approval.target}</span>
          )}
        </dd>
        <dt className="text-text-2">Was genau</dt>
        <dd className="text-text">{approval.data}</dd>
        <dt className="text-text-2">Was passiert</dt>
        <dd className="text-text">{approval.impact}</dd>
      </dl>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => onRespond('cancel')}>
          Vorgang abbrechen
        </button>
        <button ref={denyRef} type="button" className="btn-secondary" onClick={() => onRespond('deny')}>
          Ablehnen
        </button>
        <button type="button" className="btn-primary" onClick={() => onRespond('allow')}>
          Erlauben
        </button>
      </div>
    </article>
  )
}

/** Modal über allen Bereichen, solange Freigaben offen sind. */
export function ApprovalCenter() {
  const data = useNexora((s) => s.data)
  const pending = selectPendingApprovals(data)
  const first = pending[0]
  const [error, setError] = useState<string | null>(null)
  if (!first) return null

  const respond = (decision: ApprovalDecision) => {
    setError(null)
    respondApproval(first, decision).catch((e: unknown) => setError(cleanError(e)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-labelledby="approval-title" className="w-[560px] max-w-[92vw]">
        <h2 id="approval-title" className="hud-label mb-2 text-warning">
          NEXORA fragt dich vorher {pending.length > 1 && `(1 von ${pending.length})`}
        </h2>
        <ApprovalCard approval={first} runTitle={data.runs[first.runId]?.title} onRespond={respond} autoFocus />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
