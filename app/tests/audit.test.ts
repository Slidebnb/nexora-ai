import { describe, expect, it } from 'vitest'
import type { NexoraEvent } from '../src/shared/events'
import { buildAudit } from '../src/main/audit'

let seq = 0
function ev(runId: string, type: NexoraEvent['type'], payload: Record<string, unknown>, extra: Partial<NexoraEvent> = {}): NexoraEvent {
  seq++
  return {
    id: `e${seq}`,
    seq,
    runId,
    taskId: `task-${runId}`,
    timestamp: `2026-11-01T10:${String(seq).padStart(2, '0')}:00Z`,
    type,
    status: 'running',
    agentId: 'agent-dateien',
    source: 'live',
    payload,
    ...extra
  }
}

const events: NexoraEvent[] = [
  ev('run-a', 'run_created', { title: 'Ordner „Downloads" aufräumen', agentName: 'Dateien', workflow: 'organize_folder' }),
  ev('run-a', 'approval_requested', { approvalId: 'ap1', action: 'Dateien verschieben', target: 'C:\\Downloads', data: '7 Dateien', impact: 'x' }),
  ev('run-a', 'approval_resolved', { approvalId: 'ap1', decision: 'allow' }),
  ev('run-a', 'artifact_created', { artifactId: 'f1', kind: 'file', name: 'Undo-Protokoll.json' }),
  ev('run-a', 'run_succeeded', { verification: '7/7 verschoben', summary: '7 Dateien sortiert' }),
  ev('run-b', 'run_created', { title: '=HYPERLINK("x")', agentName: 'Dokumente', workflow: 'ask_files' }),
  ev('run-b', 'approval_requested', { approvalId: 'ap2', action: 'Frage mit KI beantworten', target: 'C:\\Unterlagen', data: 'y', impact: 'z' }),
  ev('run-b', 'approval_resolved', { approvalId: 'ap2', decision: 'deny' }),
  ev('run-b', 'cost_updated', { totalUsd: 0.0123 }),
  ev('run-b', 'run_failed', { error: 'Du hast das Senden abgelehnt; nichts gesendet' }),
  ev('run-demo', 'run_created', { title: 'Demo-Lauf' }, { source: 'demo' })
]

describe('Audit-Export (#4)', () => {
  const audit = buildAudit(events, new Date('2026-11-01T12:00:00Z'))

  it('fasst echte Läufe zusammen und lässt Demo-Läufe weg', () => {
    expect(audit.runs).toBe(2)
    expect(audit.markdown).not.toContain('Demo-Lauf')
  })

  it('CSV: eine Zeile je Lauf mit Ergebnis, Freigaben, Dateien und Kosten', () => {
    const lines = audit.csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Start;Ende;Aufgabe;Agent;Ergebnis;Freigaben;Dateien;Kosten (USD);Lauf-ID')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('erfolgreich')
    expect(lines[1]).toContain('Dateien verschieben → erlaubt')
    expect(lines[1]).toContain('Undo-Protokoll.json')
    expect(lines[2]).toContain('fehlgeschlagen')
    expect(lines[2]).toContain('Frage mit KI beantworten → abgelehnt')
    expect(lines[2]).toContain('0.0123')
  })

  it('schützt CSV vor Formel-Einschleusung (Excel)', () => {
    expect(audit.csv).not.toMatch(/;"?=HYPERLINK/)
    expect(audit.csv).toContain("'=HYPERLINK")
  })

  it('Markdown nennt Zeitpunkt, Anzahl und je Lauf die Freigabe-Entscheidungen', () => {
    expect(audit.markdown).toContain('# NEXORA – Aktivitätsprotokoll')
    expect(audit.markdown).toContain('2 Aufgabe(n)')
    expect(audit.markdown).toContain('Ordner „Downloads" aufräumen')
    expect(audit.markdown).toContain('abgelehnt')
  })

  it('nennt zusätzlich die Kosten von Chat und Voicestudio und rechnet sie in die Gesamtsumme ein', () => {
    const withUsage = buildAudit(events, new Date('2026-11-01T12:00:00Z'), { chatUsd: 0.5, voiceUsd: 0.25 })
    expect(withUsage.markdown).toContain('Chat: 0.5000 USD')
    expect(withUsage.markdown).toContain('Voicestudio: 0.2500 USD')
    expect(withUsage.markdown).toContain('gesamt: 0.7623 USD')
  })
})
