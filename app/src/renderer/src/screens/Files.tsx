import { useState } from 'react'
import { Download, FileText, Layers, Link2, Sheet } from 'lucide-react'
import type { ArtifactKind } from '@shared/events'
import { useNexora } from '../state/store'
import { KIND, ResultCards } from '../components/feed/ResultCards'
import { SearchBox, StatCard, StatGrid } from '../components/common/Cyber'
import { cx } from '../lib/format'
import { ScreenHeader } from './ScreenHeader'

const KIND_ICON: Record<ArtifactKind, typeof FileText> = { table: Sheet, file: FileText, link: Link2, export: Download }

/** Ergebnisse im Aufbau des cyberpunk-dashboard „Intelligence Center“: Suche, Kennzahlen je Art, Liste. */
export function Files() {
  const artifacts = useNexora((s) => s.data.artifacts)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ArtifactKind | undefined>()
  const count = (k: ArtifactKind) => artifacts.filter((a) => a.kind === k).length
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <ScreenHeader title="Dateien" subtitle="Alle Ergebnisse deiner Vorgänge: Tabellen, Berichte, Entwürfe und Exporte." />
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_3fr]">
        <SearchBox value={query} onChange={setQuery} placeholder="Ergebnis oder Vorgang suchen …" label="Ergebnisse durchsuchen" />
        <StatGrid>
          <StatCard label="Alle Ergebnisse" value={artifacts.length} icon={Layers} />
          {(Object.keys(KIND_ICON) as ArtifactKind[]).map((k) => (
            <StatCard key={k} label={KIND[k]} value={count(k)} icon={KIND_ICON[k]} />
          ))}
        </StatGrid>
      </div>
      <div className="flex gap-1" role="group" aria-label="Art filtern">
        {[undefined, ...(Object.keys(KIND_ICON) as ArtifactKind[])].map((k) => (
          <button
            key={k ?? 'all'}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cx('rounded px-3 py-1 text-xs', kind === k ? 'bg-accent/20 text-accent-hi' : 'text-text-2 hover:bg-panel')}
          >
            {k ? KIND[k] : 'Alle'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResultCards query={query} kind={kind} />
      </div>
    </div>
  )
}
