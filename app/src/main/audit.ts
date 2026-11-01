/*
 * Audit-Export: macht nachvollziehbar, was NEXORA auf diesem PC getan hat – je Aufgabe Start/Ende, Ergebnis,
 * jede Freigabe-Entscheidung, erzeugte Dateien und geschätzte KI-Kosten. Grundlage sind die echten Ereignisse
 * aus dem Worker (Demo-Läufe werden ausgelassen). Reine Funktion – das Schreiben übernimmt ipc.ts.
 */
import type { NexoraEvent } from '../shared/events'

const DECISION: Record<string, string> = { allow: 'erlaubt', deny: 'abgelehnt', cancel: 'abgebrochen' }
const HEADER = ['Start', 'Ende', 'Aufgabe', 'Agent', 'Ergebnis', 'Freigaben', 'Dateien', 'Kosten (USD)', 'Lauf-ID']

interface RunAudit {
  runId: string
  start: string
  end: string
  title: string
  agent: string
  result: string
  approvals: string[]
  files: string[]
  costUsd: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function collect(events: NexoraEvent[]): RunAudit[] {
  const runs = new Map<string, RunAudit>()
  const pending = new Map<string, { action: string; target: string }>()
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.source !== 'live') continue
    let r = runs.get(e.runId)
    if (!r) {
      r = { runId: e.runId, start: e.timestamp, end: '', title: '', agent: '', result: 'läuft / unterbrochen', approvals: [], files: [], costUsd: 0 }
      runs.set(e.runId, r)
    }
    const p = e.payload
    switch (e.type) {
      case 'run_created':
        r.title = str(p['title'])
        r.agent = str(p['agentName']) || e.agentId || ''
        break
      case 'approval_requested':
        pending.set(str(p['approvalId']), { action: str(p['action']), target: str(p['target']) })
        break
      case 'approval_resolved': {
        const req = pending.get(str(p['approvalId']))
        const decision = DECISION[str(p['decision'])] ?? str(p['decision'])
        r.approvals.push(`${req?.action || 'Freigabe'} → ${decision}${req?.target ? ` (${req.target})` : ''}`)
        break
      }
      case 'artifact_created':
        r.files.push(str(p['name']))
        break
      case 'cost_updated':
        if (typeof p['totalUsd'] === 'number') r.costUsd = p['totalUsd']
        break
      case 'run_succeeded':
        r.result = `erfolgreich: ${str(p['summary']) || str(p['verification'])}`
        r.end = e.timestamp
        break
      case 'run_failed':
        r.result = `fehlgeschlagen: ${str(p['error'])}`
        r.end = e.timestamp
        break
      case 'run_cancelled':
        r.result = `abgebrochen${str(p['reason']) ? `: ${str(p['reason'])}` : ''}`
        r.end = e.timestamp
        break
    }
  }
  return [...runs.values()]
}

/** CSV-Zelle: Excel-Formel-Einschleusung am Zellenanfang entschärfen, Trennzeichen/Anführungszeichen maskieren. */
function cell(v: string): string {
  let s = v.replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function local(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
}

export function buildAudit(
  events: NexoraEvent[],
  now = new Date(),
  usage: { chatUsd: number; voiceUsd: number } = { chatUsd: 0, voiceUsd: 0 }
): { markdown: string; csv: string; runs: number } {
  const runs = collect(events)
  const rows = runs.map((r) =>
    [local(r.start), local(r.end), r.title, r.agent, r.result, r.approvals.join(' | '), r.files.join(', '), String(r.costUsd), r.runId].map(cell).join(';')
  )
  // BOM, damit Excel Umlaute korrekt anzeigt; CRLF für Windows.
  const csv = '﻿' + [HEADER.join(';'), ...rows].join('\r\n') + '\r\n'

  const tasksUsd = runs.reduce((s, r) => s + r.costUsd, 0)
  const total = tasksUsd + usage.chatUsd + usage.voiceUsd
  const md: string[] = [
    '# NEXORA – Aktivitätsprotokoll',
    '',
    `Erstellt am ${now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · ${runs.length} Aufgabe(n) · geschätzte KI-Kosten gesamt: ${total.toFixed(4)} USD`,
    '',
    `Davon Aufgaben: ${tasksUsd.toFixed(4)} USD · Chat: ${usage.chatUsd.toFixed(4)} USD · Voicestudio: ${usage.voiceUsd.toFixed(4)} USD (Schätzung; abgerechnet wird direkt von deinem KI-Anbieter).`,
    '',
    'Enthält jede von NEXORA ausgeführte Aufgabe mit allen Freigabe-Entscheidungen. Verändernde oder sendende Aktionen liefen nur nach Freigabe. Demo-Läufe sind nicht enthalten.',
    ''
  ]
  for (const r of runs) {
    md.push(`## ${r.title || r.runId}`, '')
    md.push(`- **Start:** ${local(r.start)}${r.end ? ` · **Ende:** ${local(r.end)}` : ''}`)
    if (r.agent) md.push(`- **Agent:** ${r.agent}`)
    md.push(`- **Ergebnis:** ${r.result}`)
    md.push(`- **Freigaben:** ${r.approvals.length ? '' : 'keine nötig'}`)
    for (const a of r.approvals) md.push(`  - ${a}`)
    if (r.files.length) md.push(`- **Erzeugte Dateien:** ${r.files.join(', ')}`)
    if (r.costUsd) md.push(`- **Geschätzte KI-Kosten:** ${r.costUsd} USD`)
    md.push(`- Lauf-ID: \`${r.runId}\``, '')
  }
  return { markdown: md.join('\n'), csv, runs: runs.length }
}
