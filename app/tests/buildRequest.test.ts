import { describe, expect, it } from 'vitest'
import { buildRequest } from '../src/renderer/src/components/task/LiveForms'
import { WORKFLOWS } from '../src/renderer/src/data/workflows'
import type { ComposerDraft } from '../src/renderer/src/state/store'

const draft = (p: Partial<ComposerDraft> = {}): ComposerDraft => ({
  question: '', urls: '', briefing: '', recipients: '', subject: '', files: [], outFolder: null, useCloudAi: false, ...p
})
const wf = (id: string) => WORKFLOWS.find((w) => w.id === id)!

describe('buildRequest', () => {
  it('Ordner: verlangt einen gewählten Ordner und übergibt nur dessen ID', () => {
    expect(buildRequest(wf('ordner'), draft(), null).missing).toMatch(/Ordner/)
    const r = buildRequest(wf('ordner'), draft(), { folderId: 'f1', name: 'x', path: 'C:\\x' }).request
    expect(r).toEqual({ workflow: 'organize_folder', folderId: 'f1', capabilities: ['files.read', 'files.move'] })
  })

  it('Recherche: prüft Frage und Adressen', () => {
    expect(buildRequest(wf('recherche'), draft({ urls: 'https://a.de' }), null).missing).toMatch(/Frage/)
    expect(buildRequest(wf('recherche'), draft({ question: 'Preis?' }), null).missing).toMatch(/Adresse/)
    expect(buildRequest(wf('recherche'), draft({ question: 'Preis?', urls: 'ftp://x' }), null).missing).toMatch(/Ungültige/)
    const many = Array.from({ length: 11 }, (_, i) => `https://e${i}.de`).join('\n')
    expect(buildRequest(wf('recherche'), draft({ question: 'Preis?', urls: many }), null).missing).toMatch(/10/)
    const ok = buildRequest(wf('recherche'), draft({ question: ' Preis? ', urls: 'https://a.de\n\n https://b.de ' }), null).request
    expect(ok).toEqual({ workflow: 'web_research', question: 'Preis?', urls: ['https://a.de', 'https://b.de'], capabilities: ['web.read', 'files.export'] })
  })

  it('Vorlagen ohne Live-Ausführung liefern keine Anfrage', () => {
    expect(buildRequest(wf('wiederholen'), draft(), null).request).toBeNull()
  })
})
