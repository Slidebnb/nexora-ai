import type { Capability } from '@shared/ipc-contract'

/** Die fünf MVP-Workflows laut Masterplan §6. `live` ist gesetzt, sobald der Worker sie echt ausführt. */
export interface WorkflowTemplate {
  id: string
  title: string
  /** Kundenfreundlicher Titel und Nutzen-Satz für die Startseite */
  simpleTitle: string
  simpleText: string
  description: string
  capabilities: string[]
  /** Szenario für den DEMO-Modus, falls vorhanden. */
  demoScenarioId?: string
  livePhase: string
  /** Hinweis, wo die Funktion live genutzt wird, wenn sie kein eigenes Formular hat. */
  liveVia?: string
  live?: { workflow: 'organize_folder' | 'web_research' | 'pdf_analysis' | 'draft_emails' | 'desktop_routine'; capabilities: Capability[] }
}

export const WORKFLOWS: WorkflowTemplate[] = [
  {
    id: 'ordner',
    title: 'Ordner-Organisator',
    simpleTitle: 'Ordner aufräumen',
    simpleText: 'Sortiert Dateien in passende Unterordner. Vorher siehst du alles, danach ist Rückgängig möglich.',
    description: 'Testordner analysieren, Sortiervorschlag zeigen, nach Freigabe verschieben. Backup und Undo.',
    capabilities: ['Dateien lesen', 'Dateien verschieben (mit Freigabe)'],
    demoScenarioId: 'ordner',
    livePhase: 'Phase 2',
    live: { workflow: 'organize_folder', capabilities: ['files.read', 'files.move'] }
  },
  {
    id: 'recherche',
    title: 'Web-Recherche',
    simpleTitle: 'Webseiten vergleichen',
    simpleText: 'Liest bis zu 10 Webseiten zu deiner Frage und erstellt eine Tabelle mit allen Quellen.',
    description: '5–10 öffentliche Websites besuchen, Vergleichstabelle mit Quell-URLs und Zeitstempel, CSV-Export.',
    capabilities: ['Web lesen (eigenes Browserprofil)', 'Datei exportieren'],
    demoScenarioId: 'recherche',
    livePhase: 'Phase 2',
    live: { workflow: 'web_research', capabilities: ['web.read', 'files.export'] }
  },
  {
    id: 'pdf',
    title: 'PDF-Analyse',
    simpleTitle: 'PDFs zusammenfassen',
    simpleText: 'Wertet deine PDFs aus und erstellt eine Übersicht – direkt auf deinem PC.',
    description: 'Ausgewählte PDFs lokal auslesen, Zusammenfassung und Tabelle mit Dateiverweisen. OCR optional.',
    capabilities: ['Ausgewählte Dateien lesen'],
    livePhase: 'Phase 3',
    live: { workflow: 'pdf_analysis', capabilities: ['pdf.read', 'files.export'] }
  },
  {
    id: 'entwurf',
    title: 'Entwurf statt Versand',
    simpleTitle: 'E-Mail-Entwürfe schreiben',
    simpleText: 'Macht aus deinen Stichpunkten fertige Entwürfe. Gesendet wird nichts – das machst du selbst.',
    description: 'Aus Briefings E-Mail-Entwürfe erstellen. Versand nur nach ausdrücklicher Bestätigung.',
    capabilities: ['Eingaben lesen', 'Entwürfe speichern (mit Freigabe)'],
    demoScenarioId: 'entwurf',
    livePhase: 'Phase 3',
    live: { workflow: 'draft_emails', capabilities: ['drafts.write', 'files.write'] }
  },
  {
    id: 'desktop',
    title: 'Desktop-Ablauf',
    simpleTitle: 'Programm bedienen',
    simpleText: 'Zeig NEXORA einmal, was in einem Programm zu tun ist – Felder ausfüllen, Knöpfe drücken. Danach mit einem Klick wiederholbar.',
    description: 'Schritte in einem Windows-Programmfenster aufzeichnen (per Auswahl) und nach Freigabe wiedergeben. Texteingaben werden zurückgelesen.',
    capabilities: ['Programmfenster lesen', 'Programm bedienen (mit Freigabe)'],
    livePhase: 'Phase 5',
    live: { workflow: 'desktop_routine', capabilities: ['desktop.read', 'desktop.control'] }
  },
  {
    id: 'wiederholen',
    title: 'Wiederholbarer Workflow',
    simpleTitle: 'Aufgabe wiederholen',
    simpleText: 'Eine erledigte Aufgabe als Vorlage speichern und mit einem Klick erneut starten.',
    description: 'Einen erfolgreich gelaufenen, genehmigten Vorgang als Vorlage speichern und erneut ausführen.',
    capabilities: ['wie Ursprungsvorgang'],
    livePhase: 'Phase 3',
    liveVia: 'Aktivitäten → „Als Vorlage“, dann unter Automationen ausführen oder planen'
  }
]
