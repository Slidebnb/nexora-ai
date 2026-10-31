import { FileText, FolderOpen } from 'lucide-react'
import type { CreateTask, PickedFolder } from '@shared/ipc-contract'
import { useNexora, type ComposerDraft } from '../../state/store'
import type { WorkflowTemplate } from '../../data/workflows'
import { cleanError } from '../../lib/actions'

export interface FormResult {
  request: CreateTask | null
  /** Warum noch nicht gestartet werden kann. */
  missing?: string
}

function parseUrls(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Baut aus den Eingaben die Anfrage an den Worker (oder sagt, was fehlt). */
export function buildRequest(t: WorkflowTemplate, d: ComposerDraft, folder: PickedFolder | null): FormResult {
  const live = t.live
  if (!live) return { request: null, missing: 'nicht live verfügbar' }
  const capabilities = live.capabilities
  switch (live.workflow) {
    case 'organize_folder':
      return folder ? { request: { workflow: 'organize_folder', folderId: folder.folderId, capabilities } } : { request: null, missing: 'Bitte einen Ordner wählen' }
    case 'web_research': {
      const urls = parseUrls(d.urls)
      if (d.question.trim().length < 3) return { request: null, missing: 'Bitte eine Frage eingeben' }
      if (urls.length === 0) return { request: null, missing: 'Bitte mindestens eine Adresse eingeben' }
      if (urls.length > 10) return { request: null, missing: 'Höchstens 10 Adressen' }
      const bad = urls.find((u) => !/^https?:\/\/[^\s/]+/i.test(u))
      if (bad) return { request: null, missing: `Ungültige Adresse: ${bad}` }
      return { request: { workflow: 'web_research', question: d.question.trim(), urls, capabilities } }
    }
  }
}

function PickButton({ label, onPick, onError }: { label: string; onPick: () => Promise<void>; onError: (msg: string) => void }) {
  return (
    <button type="button" className="btn-secondary" onClick={() => void onPick().catch((e: unknown) => onError(cleanError(e)))}>
      <FolderOpen className="size-4" aria-hidden /> {label}
    </button>
  )
}

/** Eingabefelder je Live-Workflow. */
export function LiveForm({ template, onError }: { template: WorkflowTemplate; onError: (msg: string) => void }) {
  const d = useNexora((s) => s.composer)
  const set = useNexora((s) => s.setComposer)
  const folder = useNexora((s) => s.pickedFolder)
  const setFolder = useNexora((s) => s.setPickedFolder)

  switch (template.live?.workflow) {
    case 'organize_folder':
      return (
        <div className="flex min-h-16 flex-1 flex-col gap-2">
          <p className="text-sm text-text-2">{template.description}</p>
          <div className="flex items-center gap-2">
            <PickButton
              label="Ordner wählen"
              onError={onError}
              onPick={async () => {
                const f = await window.nexora.pickFolder()
                if (f) setFolder(f)
              }}
            />
            <span className="min-w-0 truncate font-mono text-xs text-text" title={folder?.path} data-testid="picked-folder">
              {folder ? folder.path : 'kein Ordner gewählt'}
            </span>
          </div>
        </div>
      )
    case 'web_research':
      return (
        <div className="flex min-h-16 flex-1 flex-col gap-2">
          <input
            value={d.question}
            onChange={(e) => set({ question: e.target.value })}
            placeholder="Frage, z. B. „Was kostet der günstigste Tarif pro Monat?“"
            aria-label="Recherchefrage"
            className="input text-sm"
          />
          <textarea
            value={d.urls}
            onChange={(e) => set({ urls: e.target.value })}
            placeholder={'Öffentliche Adressen, eine pro Zeile (max. 10)\nhttps://…'}
            aria-label="Adressen"
            className="input min-h-16 flex-1 resize-none font-mono text-xs"
          />
        </div>
      )
    default:
      return (
        <p className="flex flex-1 items-center gap-2 text-sm text-text-2">
          <FileText className="size-4" aria-hidden /> {template.description}
        </p>
      )
  }
}
