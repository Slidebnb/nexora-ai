import { FileText, FolderOpen, X } from 'lucide-react'
import type { CreateTask, PickedFolder } from '@shared/ipc-contract'
import { useNexora, type ComposerDraft } from '../../state/store'
import type { WorkflowTemplate } from '../../data/workflows'
import { cleanError } from '../../lib/actions'

export interface FormResult {
  request: CreateTask | null
  /** Warum noch nicht gestartet werden kann. */
  missing?: string
}

/** „Name <mail@x.de>“, „Name; mail@x.de“ oder nur „mail@x.de“ – eine Zeile je Empfänger. */
export function parseRecipients(text: string): { recipients: { name: string; email: string }[]; invalid: string[] } {
  const recipients: { name: string; email: string }[] = []
  const invalid: string[] = []
  for (const raw of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = raw.match(/^(.*?)[\s;,]*<?([^\s<>;,]+@[^\s<>;,]+\.[A-Za-z]{2,})>?$/)
    if (m) recipients.push({ name: (m[1] ?? '').replace(/^["']|["']$/g, '').trim(), email: m[2]! })
    else invalid.push(raw)
  }
  return { recipients, invalid }
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
    case 'pdf_analysis': {
      if (d.files.length === 0) return { request: null, missing: 'Bitte PDF-Dateien wählen' }
      const caps = d.useCloudAi ? [...capabilities, 'ai.cloud' as const] : capabilities
      return { request: { workflow: 'pdf_analysis', fileIds: d.files.map((f) => f.fileId), useCloudAi: d.useCloudAi, capabilities: caps } }
    }
    case 'draft_emails': {
      const { recipients, invalid } = parseRecipients(d.recipients)
      if (!d.subject.trim()) return { request: null, missing: 'Bitte einen Betreff eingeben' }
      if (invalid.length) return { request: null, missing: `Ungültige Empfängerzeile: ${invalid[0]}` }
      if (recipients.length === 0) return { request: null, missing: 'Bitte Empfänger eingeben' }
      if (d.briefing.trim().length < 10) return { request: null, missing: 'Bitte ein Briefing eingeben (mind. 10 Zeichen)' }
      if (!d.outFolder) return { request: null, missing: 'Bitte einen Zielordner wählen' }
      const caps = d.useCloudAi ? [...capabilities, 'ai.cloud' as const] : capabilities
      return {
        request: { workflow: 'draft_emails', subject: d.subject.trim(), briefing: d.briefing.trim(), recipients, outFolderId: d.outFolder.folderId, useCloudAi: d.useCloudAi, capabilities: caps }
      }
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
    case 'pdf_analysis':
      return (
        <div className="flex min-h-16 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <PickButton
              label="PDFs wählen"
              onError={onError}
              onPick={async () => {
                const picked = await window.nexora.pickFiles('pdf')
                if (picked.length) set({ files: [...d.files, ...picked.filter((p) => !d.files.some((f) => f.path === p.path))].slice(0, 20) })
              }}
            />
            <span className="text-xs text-text-2">{d.files.length} Datei(en)</span>
          </div>
          <ul className="max-h-24 overflow-y-auto text-xs" data-testid="picked-files">
            {d.files.map((f) => (
              <li key={f.fileId} className="flex items-center gap-2 py-0.5">
                <FileText className="size-3.5 text-accent-hi" aria-hidden />
                <span className="truncate font-mono" title={f.path}>{f.name}</span>
                <button type="button" className="ml-auto text-text-2 hover:text-danger" aria-label={`${f.name} entfernen`} onClick={() => set({ files: d.files.filter((x) => x.fileId !== f.fileId) })}>
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-xs text-text-2">
            <input type="checkbox" checked={d.useCloudAi} onChange={(e) => set({ useCloudAi: e.target.checked })} className="mt-0.5 accent-[var(--color-accent)]" />
            <span>
              Zusätzlich KI-Zusammenfassung (Cloud). Vor dem Senden wird einzeln gefragt; es fallen API-Kosten an. Ohne Häkchen bleibt alles lokal.
            </span>
          </label>
        </div>
      )
    case 'draft_emails':
      return (
        <div className="flex min-h-16 flex-1 flex-col gap-2">
          <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Betreff" aria-label="Betreff" className="input text-sm" />
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <textarea
              value={d.recipients}
              onChange={(e) => set({ recipients: e.target.value })}
              placeholder={'Empfänger, einer pro Zeile\nAnna Muster <anna@firma.de>'}
              aria-label="Empfänger"
              className="input min-h-16 resize-none font-mono text-xs"
            />
            <textarea
              value={d.briefing}
              onChange={(e) => set({ briefing: e.target.value })}
              placeholder="Briefing: Worum geht es? Was soll in der Antwort stehen?"
              aria-label="Briefing"
              className="input min-h-16 resize-none text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <PickButton
              label="Zielordner wählen"
              onError={onError}
              onPick={async () => {
                const f = await window.nexora.pickFolder()
                if (f) set({ outFolder: f })
              }}
            />
            <span className="min-w-0 truncate font-mono text-xs text-text" title={d.outFolder?.path} data-testid="draft-folder">
              {d.outFolder ? d.outFolder.path : 'kein Zielordner'}
            </span>
          </div>
          <label className="flex items-start gap-2 text-xs text-text-2">
            <input type="checkbox" checked={d.useCloudAi} onChange={(e) => set({ useCloudAi: e.target.checked })} className="mt-0.5 accent-[var(--color-accent)]" />
            <span>Text per KI formulieren (Cloud, mit Freigabe und Kosten). Ohne Häkchen wird das Briefing übernommen.</span>
          </label>
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
