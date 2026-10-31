# ADR-004: Konnektoren über MCP

Stand: 2026-10-31

## Entscheidung
Kunden verbinden eigene Dienste mit NEXORA über das **Model Context Protocol (MCP)** – dasselbe offene
Format, das auch Claude für Konnektoren nutzt. NEXORA ist der MCP-Client. Keine fest einprogrammierten
Einzel­dienste; stattdessen ein offener Standard, den beliebige MCP-Server bedienen können.

## Umsetzung
- **Transport:** „Streamable HTTP“ (eine POST-Adresse; Antwort als JSON oder SSE). Handshake `initialize`
  → `notifications/initialized` → `tools/list` / `tools/call`.
- **Speicherung:** Name und Adresse in SQLite (Migration v3). Das **Zugangstoken** liegt ausschließlich im
  sicheren Speicher des Betriebssystems (Windows: DPAPI) und wird je Sitzung an den lokalen Worker übergeben –
  nie in der Datenbank, nie im Klartext, nie in Logs.

## Sicherheit
- **HTTPS-Pflicht** für entfernte Server; HTTP nur für lokale (127.0.0.1/localhost).
- **Freigabe vor jedem Werkzeugaufruf:** NEXORA kann nicht wissen, ob ein fremdes Werkzeug nur liest oder
  etwas verändert/sendet. Darum wird jeder Aufruf (Workflow `connector_action`, Berechtigung `connectors.use`)
  einzeln angezeigt und muss bestätigt werden. „Testen“ und „Werkzeuge anzeigen“ sind rein lesend.
- **Ergebnisse sind nicht vertrauenswürdig** (mögliche Prompt-Injection) und werden wie Web-/KI-Inhalte
  behandelt (redigiert, nie automatisch ausgeführt).

## Bewusst (noch) nicht
- **stdio-Transport** (lokaler Startbefehl eines MCP-Servers): startet einen Fremdprozess – erst mit klaren
  Schutzmaßnahmen. Vorerst nur HTTP-Konnektoren per Adresse.
- **Automatische Werkzeugauswahl durch die KI:** Aktuell ruft der Nutzer ein Werkzeug gezielt auf. Eine
  KI-gesteuerte Nutzung mehrerer Werkzeuge ist ein späterer, eigener Schritt (weiterhin mit Freigaben).
