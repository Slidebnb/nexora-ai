import { describe, expect, it } from 'vitest'
import { buildRequest, parseRecipients } from '../src/renderer/src/components/task/LiveForms'
import { WORKFLOWS } from '../src/renderer/src/data/workflows'
import type { ComposerDraft } from '../src/renderer/src/state/store'

const draft = (p: Partial<ComposerDraft> = {}): ComposerDraft => ({
  question: '', urls: '', briefing: '', recipients: '', subject: '', files: [], outFolder: null, useCloudAi: false, useAiBrowser: false, useOcr: false, desktopWindow: '', desktopSteps: [], ...p
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
    expect(ok).toEqual({ workflow: 'web_research', question: 'Preis?', urls: ['https://a.de', 'https://b.de'], useCloudAi: false, capabilities: ['web.read', 'files.export'] })
  })

  it('Recherche: KI-Browser nur mit ausdrücklicher Wahl, dann mit Berechtigung ai.cloud', () => {
    const base = { question: 'Preis?', urls: 'https://a.de' }
    expect(buildRequest(wf('recherche'), draft({ ...base, useCloudAi: true }), null).request).toMatchObject({ useCloudAi: false, capabilities: ['web.read', 'files.export'] })
    expect(buildRequest(wf('recherche'), draft({ ...base, useAiBrowser: true }), null).request).toMatchObject({ useCloudAi: true, capabilities: ['web.read', 'files.export', 'ai.cloud'] })
  })

  it('PDF: verlangt Dateien; Cloud-KI fügt die Berechtigung ai.cloud hinzu', () => {
    expect(buildRequest(wf('pdf'), draft(), null).missing).toMatch(/PDF/)
    const files = [{ fileId: 'a', name: 'a.pdf', path: '/a.pdf' }]
    expect(buildRequest(wf('pdf'), draft({ files }), null).request).toEqual({ workflow: 'pdf_analysis', fileIds: ['a'], useCloudAi: false, useOcr: false, capabilities: ['pdf.read', 'files.export'] })
    expect(buildRequest(wf('pdf'), draft({ files, useCloudAi: true }), null).request?.capabilities).toContain('ai.cloud')
  })

  it('Entwürfe: Empfänger in mehreren Schreibweisen, Pflichtfelder', () => {
    const { recipients, invalid } = parseRecipients('Anna Muster <anna@firma.de>\nbob@x.org\n"Chef"; chef@firma.de\nkaputt')
    expect(recipients).toEqual([
      { name: 'Anna Muster', email: 'anna@firma.de' },
      { name: '', email: 'bob@x.org' },
      { name: 'Chef', email: 'chef@firma.de' }
    ])
    expect(invalid).toEqual(['kaputt'])
    const out = { folderId: 'o1', name: 'Out', path: '/out' }
    const ok = draft({ subject: 'Termin', recipients: 'a@b.de', briefing: 'Bitte Termin vorschlagen.', outFolder: out })
    expect(buildRequest(wf('entwurf'), { ...ok, outFolder: null }, null).missing).toMatch(/Zielordner/)
    expect(buildRequest(wf('entwurf'), { ...ok, recipients: 'nix' }, null).missing).toMatch(/Ungültige/)
    expect(buildRequest(wf('entwurf'), ok, null).request).toMatchObject({ workflow: 'draft_emails', outFolderId: 'o1', recipients: [{ name: '', email: 'a@b.de' }] })
  })

  it('Vorlagen ohne Live-Ausführung liefern keine Anfrage', () => {
    expect(buildRequest(wf('wiederholen'), draft(), null).request).toBeNull()
  })
})
