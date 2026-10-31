import { FileText, Link2, Sheet, Download } from 'lucide-react'
import type { ArtifactKind } from '@shared/events'
import { useNexora } from '../../state/store'
import { formatTime } from '../../lib/format'
import { DemoTag, EmptyState, Panel } from '../common/Panel'

const ICON: Record<ArtifactKind, typeof FileText> = { table: Sheet, file: FileText, link: Link2, export: Download }
const KIND: Record<ArtifactKind, string> = { table: 'Tabelle', file: 'Datei', link: 'Link', export: 'Export' }

export function ResultCards({ limit }: { limit?: number }) {
  const artifacts = useNexora((s) => s.data.artifacts)
  const runs = useNexora((s) => s.data.runs)
  const list = [...artifacts].reverse().slice(0, limit)

  return (
    <Panel title="Ergebnisse" bodyClassName="overflow-y-auto p-3">
      {list.length === 0 ? (
        <EmptyState>Noch keine Ergebnisse.</EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {list.map((a) => {
            const Icon = ICON[a.kind]
            const run = runs[a.runId]
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-md border border-line bg-panel-2/60 px-3 py-2">
                <Icon className="size-5 text-accent-hi" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{a.name}</p>
                  <p className="truncate text-[11px] text-text-2">
                    {KIND[a.kind]} · {run?.title ?? a.runId} · {formatTime(a.createdAt)}
                  </p>
                </div>
                {run?.source === 'demo' ? (
                  <DemoTag />
                ) : (
                  <span className="text-[11px] text-text-2" title="Öffnen folgt mit dem Worker">–</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
