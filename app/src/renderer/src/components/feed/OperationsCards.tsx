/*
 * Vorgänge als Karten mit Fortschrittsbalken – Layout portiert aus raheem-dotgit/cyberpunk-dashboard
 * (app/operations/page.tsx, im README als MIT bezeichnet, siehe THIRD_PARTY_NOTICES.md). An unseren Stack
 * angepasst (React 19 + Tailwind 4 + Theme-Tokens statt Next.js/shadcn/neutral+orange).
 *
 * WICHTIG: Die Vorlage zeigt erfundene Spionage-Operationen (Name, Priorität, Standort, Agentenzahl, Ziele). Diese
 * Karten nutzen ausschließlich ECHTE Vorgangsdaten (Titel, Status, Fortschritt, Schritte, Kosten). Felder ohne echtes
 * Gegenstück (Priorität/Standort/Ziele) werden weggelassen, nicht erfunden.
 */
import type { RunState } from '../../state/runReducer'
import { progressOf } from '../../state/runReducer'
import { RunStatusBadge } from '../common/StatusBadge'
import { DemoTag } from '../common/Panel'
import { cx, formatTime, formatUsd } from '../../lib/format'

export function OperationsCards({ runs, onOpen, expert }: { runs: RunState[]; onOpen: (runId: string) => void; expert: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-label="Vorgänge als Karten">
      {runs.map((r) => {
        const p = progressOf(r)
        const pct = p === null ? null : Math.round(p * 100)
        return (
          <button
            key={r.runId}
            type="button"
            onClick={() => onOpen(r.runId)}
            className="panel flex flex-col gap-3 p-4 text-left transition-colors hover:border-accent/60"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-text" title={r.title}>{r.title}</div>
                {expert && <div className="truncate font-mono text-[11px] text-text-2">{r.agentName ?? r.agentId ?? r.workflow ?? ''}</div>}
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <RunStatusBadge status={r.status} />
                {r.source === 'demo' && <DemoTag />}
              </span>
            </div>

            {(r.verification || r.error) && (
              <p className={cx('line-clamp-2 text-xs', r.error ? 'text-danger' : 'text-text-2')} title={r.error ?? r.verification}>
                {r.error ?? r.verification}
              </p>
            )}

            <div className="space-y-1 text-xs text-text-2">
              <div className="flex justify-between"><span>Gestartet</span><span className="font-mono">{formatTime(r.createdAt)}</span></div>
              <div className="flex justify-between"><span>Schritte</span><span className="font-mono">{r.stepsTotal !== undefined ? `${r.stepsDone}/${r.stepsTotal}` : `${r.stepsDone}`}</span></div>
              {expert && <div className="flex justify-between"><span>Kosten</span><span className="font-mono">{formatUsd(r.costUsd)}</span></div>}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-text-2">Fortschritt</span>
                <span className="font-mono text-text">{pct !== null ? `${pct} %` : '–'}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className={cx('h-2 rounded-full transition-all', r.status === 'failed' ? 'bg-danger' : r.status === 'succeeded' ? 'bg-success' : 'bg-accent')}
                  style={{ width: `${pct !== null ? pct : r.status === 'succeeded' ? 100 : 0}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
