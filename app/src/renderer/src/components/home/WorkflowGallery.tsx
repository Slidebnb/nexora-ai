/*
 * Galerie fertiger Aufgaben (Workflows). Zeigt die mitgelieferten Workflows als schöne, benannte Karten –
 * ein Klick öffnet den passenden Assistenten (Wizard). Ersetzt die früheren kleinen Chips im leeren Chat,
 * damit Kunden sofort sehen, was NEXORA fertig für sie erledigen kann.
 */
import { FileText, FolderSync, Globe, Mail, Monitor } from 'lucide-react'
import { WORKFLOWS } from '../../data/workflows'
import { useNexora } from '../../state/store'

const ICON: Record<string, typeof Mail> = {
  ordner: FolderSync,
  recherche: Globe,
  pdf: FileText,
  entwurf: Mail,
  desktop: Monitor
}

export function WorkflowGallery() {
  const openWizard = useNexora((s) => s.setWizard)
  const items = WORKFLOWS.filter((w) => w.id !== 'wiederholen')
  return (
    <div className="mx-auto mt-2 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2" data-testid="task-chips" aria-label="Fertige Aufgaben">
      {items.map((w) => {
        const Icon = ICON[w.id] ?? FolderSync
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => openWizard(w.id)}
            className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:border-accent/60 hover:bg-panel-2"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-hi">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{w.simpleTitle}</span>
              <span className="mt-0.5 block text-xs leading-snug text-text-2">{w.simpleText}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
