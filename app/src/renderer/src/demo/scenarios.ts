import type { ArtifactKind } from '@shared/events'

/**
 * Synthetische Abläufe für den DEMO-Modus. Sie führen keine echten Aktionen aus.
 * Jeder Schritt dauert `ms` Millisekunden (vor Geschwindigkeitsfaktor).
 */
export interface DemoStep {
  id: string
  title: string
  ms: number
  /** Simulierter Fehler dieses Schritts; der Ablauf läuft danach weiter. */
  fails?: string
  /** Vor diesem Schritt wird eine Freigabe angefordert. */
  approval?: { action: string; target: string; data: string; impact: string }
  costUsd?: number
}

export interface DemoScenario {
  id: string
  title: string
  agentId: string
  agentName: string
  steps: DemoStep[]
  artifact: { kind: ArtifactKind; name: string }
  verification: string
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'ordner',
    title: 'Testordner „Downloads-Demo“ sortieren',
    agentId: 'agent-sortierer',
    agentName: 'Sortierer',
    steps: [
      { id: 'scan', title: 'Ordnerinhalt einlesen (48 Dateien)', ms: 1400, costUsd: 0.002 },
      { id: 'plan', title: 'Sortiervorschlag erstellen', ms: 1800, costUsd: 0.011 },
      {
        id: 'move',
        title: 'Dateien in Unterordner verschieben',
        ms: 2200,
        approval: {
          action: 'Dateien verschieben',
          target: 'C:\\Users\\Demo\\Downloads-Demo',
          data: '48 Dateien → 5 Unterordner (Bilder, PDFs, Tabellen, Archive, Sonstiges)',
          impact: 'Ordnerstruktur ändert sich. Backup und Undo-Liste werden vorher angelegt.'
        }
      },
      { id: 'verify', title: 'Ergebnis prüfen (Anzahl und Prüfsummen)', ms: 1200, costUsd: 0.001 }
    ],
    artifact: { kind: 'table', name: 'Sortierprotokoll.csv' },
    verification: 'DEMO: simulierte Prüfung, es wurden keine echten Dateien bewegt.'
  },
  {
    id: 'recherche',
    title: '6 Anbieter-Websites vergleichen',
    agentId: 'agent-rechercheur',
    agentName: 'Rechercheur',
    steps: [
      { id: 'w1', title: 'Quelle 1 lesen', ms: 1300, costUsd: 0.006 },
      { id: 'w2', title: 'Quelle 2 lesen', ms: 1100, costUsd: 0.006 },
      { id: 'w3', title: 'Quelle 3 lesen', ms: 1500, fails: 'Seite nicht erreichbar (simuliert)' },
      { id: 'w4', title: 'Quelle 4 lesen', ms: 1200, costUsd: 0.006 },
      { id: 'table', title: 'Vergleichstabelle mit Quell-URLs erstellen', ms: 1600, costUsd: 0.014 }
    ],
    artifact: { kind: 'export', name: 'Anbietervergleich.csv' },
    verification: 'DEMO: 3 von 4 Quellen ausgewertet, 1 Quelle fehlgeschlagen (simuliert).'
  },
  {
    id: 'entwurf',
    title: 'Antwortentwürfe aus Briefing erstellen',
    agentId: 'agent-schreiber',
    agentName: 'Schreiber',
    steps: [
      { id: 'read', title: 'Briefing lesen', ms: 1000, costUsd: 0.003 },
      { id: 'draft', title: '3 Antwortentwürfe formulieren', ms: 2000, costUsd: 0.019 },
      {
        id: 'save',
        title: 'Entwürfe im Postfach ablegen (kein Versand)',
        ms: 1200,
        approval: {
          action: 'E-Mail-Entwürfe speichern',
          target: 'Postfach „Demo“ / Ordner Entwürfe',
          data: '3 Entwürfe an 3 Empfänger',
          impact: 'Es wird NICHTS versendet. Entwürfe können danach geprüft oder gelöscht werden.'
        }
      }
    ],
    artifact: { kind: 'file', name: 'Entwuerfe.txt' },
    verification: 'DEMO: 3 Entwürfe simuliert, kein Versand.'
  }
]
