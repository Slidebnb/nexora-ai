import { describe, expect, it } from 'vitest'
import { parseCommand } from '../src/renderer/src/lib/intent'

const task = (t: string) => {
  const r = parseCommand(t)
  if (r.kind !== 'task') throw new Error(`keine Aufgabe erkannt: ${t}`)
  return r.intent
}

describe('Befehlszeile – lokale Erkennung', () => {
  it('erkennt die vier Aufgaben an Alltagssätzen', () => {
    expect(task('Räum meinen Download-Ordner auf').workflowId).toBe('ordner')
    expect(task('Bitte die Dateien auf dem Desktop sortieren').workflowId).toBe('ordner')
    expect(task('Vergleich die Preise der Stromanbieter').workflowId).toBe('recherche')
    expect(task('Fass mir die Rechnungen zusammen').workflowId).toBe('pdf')
    expect(task('Schreib einen E-Mail-Entwurf an die Kunden').workflowId).toBe('entwurf')
  })

  it('übernimmt Adressen und Frage in die Web-Recherche', () => {
    const i = task('Was kostet der Basistarif? https://a.de/tarif, https://b.de')
    expect(i.workflowId).toBe('recherche')
    expect(i.prefill.urls).toBe('https://a.de/tarif\nhttps://b.de')
    expect(i.prefill.question).toBe('Was kostet der Basistarif?')
  })

  it('übernimmt Empfänger in die Entwürfe', () => {
    const i = task('Erinnerung an anna@example.com und ben@example.org wegen Termin')
    expect(i.workflowId).toBe('entwurf')
    expect(i.prefill.recipients).toBe('anna@example.com\nben@example.org')
  })

  it('leitet Wiederholungen zu den Automationen und erfindet nichts', () => {
    expect(parseCommand('Mach das von gestern nochmal').kind).toBe('repeat')
    expect(parseCommand('Wie wird das Wetter morgen?').kind).toBe('unknown')
    expect(parseCommand('ok').kind).toBe('unknown')
  })
})
