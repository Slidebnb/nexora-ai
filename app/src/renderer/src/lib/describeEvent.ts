import type { NexoraEvent } from '@shared/events'

/** Menschenlesbare Beschreibung eines Events für Feed und Protokoll. Nur Daten aus dem Event. */
export function describeEvent(e: NexoraEvent, runTitle?: string): string {
  const p = e.payload
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '')
  switch (e.type) {
    case 'run_created':
      return `Vorgang erstellt: ${str('title')}`
    case 'plan_ready':
      return `Plan bereit (${Array.isArray(p['steps']) ? p['steps'].length : '?'} Schritte)`
    case 'step_started':
      return `Schritt gestartet: ${str('title') || e.stepId}`
    case 'step_succeeded':
      return `Schritt erfolgreich: ${e.stepId}${str('summary') ? ` – ${str('summary')}` : ''}`
    case 'step_failed':
      return `Schritt fehlgeschlagen: ${e.stepId} – ${str('error')}`
    case 'approval_requested':
      return `Freigabe angefordert: ${str('action')} → ${str('target')}`
    case 'approval_resolved':
      return `Freigabe ${({ allow: 'erteilt', deny: 'abgelehnt', cancel: 'abgebrochen' } as Record<string, string>)[str('decision')] ?? str('decision')}`
    case 'artifact_created':
      return `Ergebnis erstellt: ${str('name')}`
    case 'run_succeeded':
      return `Vorgang erfolgreich${runTitle ? `: ${runTitle}` : ''} – ${str('verification')}`
    case 'run_failed':
      return `Vorgang fehlgeschlagen: ${str('error')}`
    case 'run_cancelled':
      return `Vorgang abgebrochen${str('reason') ? `: ${str('reason')}` : ''}`
    case 'cost_updated':
      return `Kosten aktualisiert: ${typeof p['totalUsd'] === 'number' ? p['totalUsd'].toFixed(3) : '?'} USD`
  }
}

export const EVENT_TONE: Partial<Record<NexoraEvent['type'], string>> = {
  step_failed: 'text-danger',
  run_failed: 'text-danger',
  approval_requested: 'text-warning',
  run_succeeded: 'text-success',
  artifact_created: 'text-accent-hi',
  run_cancelled: 'text-text-2'
}
