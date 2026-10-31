import { useEffect, useRef } from 'react'
import { useNexora } from '../../state/store'
import { describeEvent, EVENT_TONE } from '../../lib/describeEvent'
import { cx, formatTime } from '../../lib/format'
import { EmptyState, Panel } from '../common/Panel'

/** Chronologisches Ereignisprotokoll (Terminal-Optik, aber nur echte bzw. als DEMO markierte Events). */
export function EventLog() {
  const log = useNexora((s) => s.data.log)
  const runs = useNexora((s) => s.data.runs)
  const endRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [log.length])

  return (
    <Panel title="Ereignisprotokoll" actions={<span className="font-mono text-[10px] text-text-2">{log.length} Events</span>} bodyClassName="overflow-y-auto">
      {log.length === 0 ? (
        <EmptyState>Protokoll leer.</EmptyState>
      ) : (
        <ol className="scanlines px-4 py-2 font-mono text-[11px] leading-5">
          {log.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="shrink-0 text-text-2">{formatTime(e.timestamp)}</span>
              <span className="w-10 shrink-0 text-text-2">#{e.seq}</span>
              {e.source === 'demo' && <span className="shrink-0 text-warning">[DEMO]</span>}
              <span className="w-36 shrink-0 truncate text-accent-hi/80">{e.type}</span>
              <span className={cx('truncate', EVENT_TONE[e.type] ?? 'text-text')}>{describeEvent(e, runs[e.runId]?.title)}</span>
            </li>
          ))}
          <li ref={endRef} aria-hidden />
        </ol>
      )}
    </Panel>
  )
}
