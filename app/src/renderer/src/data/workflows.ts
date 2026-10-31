import type { Capability } from '@shared/ipc-contract'

/** Die fünf MVP-Workflows laut Masterplan §6. `live` ist gesetzt, sobald der Worker sie echt ausführt. */
export interface WorkflowTemplate {
  id: string
  title: string
  description: string
  capabilities: string[]
  /** Szenario für den DEMO-Modus, falls vorhanden. */
  demoScenarioId?: string
  livePhase: string
  live?: { workflow: 'organize_folder' | 'web_research' | 'pdf_analysis' | 'draft_emails'; capabilities: Capability[] }
}

export const WORKFLOWS: WorkflowTemplate[] = [
  {
    id: 'ordner',
    title: 'Ordner-Organisator',
    description: 'Testordner analysieren, Sortiervorschlag zeigen, nach Freigabe verschieben. Backup und Undo.',
    capabilities: ['Dateien lesen', 'Dateien verschieben (mit Freigabe)'],
    demoScenarioId: 'ordner',
    livePhase: 'Phase 2',
    live: { workflow: 'organize_folder', capabilities: ['files.read', 'files.move'] }
  },
  {
    id: 'recherche',
    title: 'Web-Recherche',
    description: '5–10 öffentliche Websites besuchen, Vergleichstabelle mit Quell-URLs und Zeitstempel, CSV-Export.',
    capabilities: ['Web lesen (eigenes Browserprofil)', 'Datei exportieren'],
    demoScenarioId: 'recherche',
    livePhase: 'Phase 2',
    live: { workflow: 'web_research', capabilities: ['web.read', 'files.export'] }
  },
  {
    id: 'pdf',
    title: 'PDF-Analyse',
    description: 'Ausgewählte PDFs lokal auslesen, Zusammenfassung und Tabelle mit Dateiverweisen. OCR optional.',
    capabilities: ['Ausgewählte Dateien lesen'],
    livePhase: 'Phase 3',
    live: { workflow: 'pdf_analysis', capabilities: ['pdf.read', 'files.export'] }
  },
  {
    id: 'entwurf',
    title: 'Entwurf statt Versand',
    description: 'Aus Briefings E-Mail-Entwürfe erstellen. Versand nur nach ausdrücklicher Bestätigung.',
    capabilities: ['Eingaben lesen', 'Entwürfe speichern (mit Freigabe)'],
    demoScenarioId: 'entwurf',
    livePhase: 'Phase 3',
    live: { workflow: 'draft_emails', capabilities: ['drafts.write', 'files.write'] }
  },
  {
    id: 'wiederholen',
    title: 'Wiederholbarer Workflow',
    description: 'Einen erfolgreich gelaufenen, genehmigten Vorgang als Vorlage speichern und erneut ausführen.',
    capabilities: ['wie Ursprungsvorgang'],
    livePhase: 'Phase 3'
  }
]
