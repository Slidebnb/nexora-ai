import { useNexora } from '../../state/store'
import { describeEvent, EVENT_TONE } from '../../lib/describeEvent'
import { cx, formatTime } from '../../lib/format'
import { EmptyState, Panel } from '../common/Panel'

/** Die letzten relevanten Events, neueste oben. Kosten-Updates werden ausgeblendet. */
export function ActivityFeed({ limit = 30 }: { limit?: number }) {
  const data = useNexora((s) => s.data)
  const items = data.log.filter((e) => e.type !== 'cost_updated').slice(-limit).reverse()

  return (
    <Panel title="Live-Aktivität" bodyClassName="overflow-y-auto">
      {items.length === 0 ? (
        <EmptyState>Noch keine Aktivität. Ereignisse erscheinen hier, sobald ein Vorgang läuft.</EmptyState>
      ) : (
        <ul className="divide-y divide-line" aria-live="polite">
          {items.map((e) => {
            const run = data.runs[e.runId]
            return (
              <li key={e.id} className="px-4 py-2 text-xs">
                <div className="flex items-center gap-2 font-mono text-[10px] text-text-2">
                  <span>{formatTime(e.timestamp)}</span>
                  <span className="truncate">{run?.agentName ?? e.agentId ?? '–'}</span>
                  {e.source === 'demo' && <span className="text-warning">DEMO</span>}
                </div>
                <p className={cx('mt-0.5 break-words', EVENT_TONE[e.type] ?? 'text-text')}>{describeEvent(e, run?.title)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
