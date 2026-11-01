# PROGRESS

## Phase 0: Rechte- und Architektur-Audit (2026-10-31)

**Implementiert**
- Vier Repos geklont (shallow) und Commits gepinnt (siehe `docs/SOURCE_AUDIT.md`)
- Lizenz-, Dependency- und Sicherheitsbefunde je Repo dokumentiert
- `docs/ARCHITECTURE.md`, `docs/ADR-001.md`, `THIRD_PARTY_NOTICES.md` angelegt
- Eigenes privates Repository `Slidebnb/nexora-ai` angelegt, Dokumente übernommen

**Teststatus**
- Fremdrepos: weder gebaut noch getestet (bewusst, nur statische Sichtung)
- NEXORA: noch kein Code vorhanden, daher keine Tests

**Offen**
- Lizenzklärung evil-ai-viz / cyberpunk-dashboard (fehlende LICENSE) sowie clawbridge (Apache vs. MIT)
- Telemetrie-Defaults von browser-use vor Phase 2 prüfen
- Marken- und Domainprüfung „NEXORA AI“

**Nächster Schritt** → siehe Phase 1

## Phase 1: UI-Shell (2026-10-31) ✅ abgeschlossen, Windows-Test offen

**Implementiert** (`app/`)
- Electron 45 + electron-vite 6, React 19, Vite 8, Tailwind 4, TypeScript 7, zustand, recharts, lucide-react (Versionen exakt gepinnt)
- Sicherheit: `contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP (Header + Meta-Tag), Popups/Navigation/Berechtigungen gesperrt, IPC-Allowlist mit zod und Absenderprüfung
- Event-Vertrag (`src/shared/events.ts`) und Reducer: Fortschritt nur aus Events, indeterminiert ohne Plan, Erfolg nur mit Verifikation, Replay-sicher, Demo und Live strikt getrennt
- Oberfläche: Sidebar mit 6 Bereichen (Dashboard, Agenten, Automationen, Aktivitäten, Dateien, Einstellungen), Statusleiste (Worker-Status wahrheitsgemäß „nicht verbunden“), Orbit-Kern (Canvas), KPI-Raster, Aufgabenfeld mit den 5 MVP-Vorlagen, Agentenkarten mit 6 Zuständen, Live-Aktivität, Ereignisprotokoll, Ergebnisse, Kostendiagramm, Verlauf mit Filter
- Freigabe-Center: Aktion, Ziel, Daten, Auswirkung; Erlauben, Ablehnen oder Abbrechen; Standardfokus auf „Ablehnen“
- Demo-Modus: dauerhaftes DEMO-Banner, 3 Szenarien (Ordner, Recherche mit simuliertem Fehler, Entwürfe), echte Freigabe-Pausen; beim Beenden werden alle Demo-Daten entfernt
- API-Schlüssel (Anthropic/OpenAI): nur verschlüsselt via `safeStorage` im Main-Prozess, der Renderer erhält nur „hinterlegt ja/nein“, kein Klartext-Fallback
- Barrierearmut: Status immer als Icon + Text, `prefers-reduced-motion` (Orbit statisch), Animation pausiert bei verstecktem Fenster
- Mindestfenster 1024×640; die rechte Seitenleiste ist umschaltbar, bei wenig Höhe scrollt das Dashboard vertikal

**Teststatus** (alle Befehle in `app/`)
- `pnpm test`: 44/44 Unit-Tests grün (Sicherheit, Reducer, Selektoren, Demo-Player, Store, Schlüsselspeicher, Freigabe-Karte, Fortschrittsbalken)
- `pnpm build`: Typecheck + Produktions-Build grün; Renderer-Bundle 719 kB (minifiziert)
- `pnpm e2e` (Linux, Xvfb): 8/8 Schritte grün. Start, alle 6 Bereiche, Demo-Freigabe-Ablauf, Schrittfehler, Kostendiagramm, kein Überlauf und keine Überlappung bei 1024×640, Demo-Ende löscht Demo-Daten, keine Konsolenfehler
- Während der Tests gefunden und behoben: CSP griff bei `file://` nicht; Protokollfehler bei abgelehnter Freigabe; Layout-Überlauf in der rechten Spalte; Überlappung bei kleinen Fenstern; Kostendiagramm mit 0 px Höhe; Bundle nicht minifiziert
- **Nicht getestet:** Start unter Windows, `pnpm dev`, `safeStorage` mit echter DPAPI (unter Linux/Xvfb ohne Schlüsselbund ist sichere Speicherung „nicht verfügbar“, was korrekt angezeigt wird)

**Offen**
- Windows-Test durch Nutzer (siehe `app/README.md`)
- Pause-Button erst mit Worker funktionsfähig (derzeit deaktiviert mit Hinweis)
- recharts per Lazy-Load abtrennen, falls Startzeit unter Windows auffällt
- Themes Cyan/Violet/Minimal; Export der Verlaufstabelle (CSV)

**Nachtrag (ADR-002):** HUD-Komponenten aus jenman, evil-ai-viz und cyberpunk-dashboard portiert (Herkunftsvermerke je Datei, `THIRD_PARTY_NOTICES.md`).

## Phase 2: Echte Engine (2026-10-31) ✅

**Implementiert** (`worker/`, `app/src/main/worker/`)
- Python-Worker (FastAPI, Python 3.12, uv): nur 127.0.0.1, Bearer-Einmal-Token je App-Start, Anfragen mit Browser-Origin abgelehnt, Host-Prüfung, WebSocket-Authentifizierung über die erste Nachricht
- SQLite mit versionierten Migrationen (aktuell v2); Event-Bus mit fortlaufender seq und Replay ohne Lücke; Schwärzung aller Payloads und Logs
- Sicherheitsrichtlinie aus ClawBridge portiert (Apache-2.0) und verschärft: kein Permissive-Modus
- Electron: WorkerSupervisor (READY-Zeile, begrenzte Neustarts, Worker beendet sich bei App-Ende), WorkerHub, Event-Stream mit Replay-Cursor; API-Schlüssel werden nur im Speicher an den Worker übergeben
- Wiederanlauf: Vorgänge, die bei einem Absturz liefen, werden ehrlich als fehlgeschlagen markiert

**Abnahme laut Masterplan:** „mindestens ein Ende-zu-Ende realer Test, Fehlerfälle/Abbruch reproduzierbar“ ✅ (siehe Teststatus)

## Phase 3: Nutzen und Freigaben (2026-10-31) ✅ (mit offenen Punkten)

| MVP-Workflow | Status | Freigaben | Ergebnis / Prüfung |
|---|---|---|---|
| 1 Ordner-Organisator | ✅ live | vor dem Verschieben; Undo ebenfalls mit Freigabe | Sortierplan.csv, Undo-Protokoll; jede Datei geprüft |
| 2 Web-Recherche | ✅ live (Direktabruf); browser-use optional | nur lesend → keine | Recherche.csv mit Quell-URL und Zeitstempel, erneut eingelesen |
| 3 PDF-Analyse | ✅ live (lokal); KI optional | vor dem Senden an die Cloud | PDF-Analyse.csv + PDF-Bericht.md, jede Datei referenziert |
| 4 Entwurf statt Versand | ✅ live | vor dem Speichern; bei KI zusätzlich vor dem Senden | .eml mit X-Unsent, Empfänger/Betreff geprüft, **kein Versand** |
| 5 Wiederholbarer Workflow | ✅ live | alle Freigaben bei jedem Lauf erneut | versionierte Vorlagen, Zeitplan bei geöffneter App |

Außerdem: Berechtigungen je Aufgabe mit ausdrücklicher Zustimmung (Cloud-KI nur mit `ai.cloud`), SSRF-Schutz, Schutz vor CSV-Formel- und E-Mail-Header-Injection, Markierung von Prompt-Injection, „Im Explorer anzeigen“ für Ergebnisse, echter Worker-Status in der Oberfläche.

**Teststatus** (alle Befehle wiederholbar)
- `worker/`: `uv run pytest` → 48 Tests grün (Sicherheit, alle Workflows, Freigaben, Abbruch, Undo, Migration, Prozess-Lebenszyklus)
- `app/`: `pnpm test` → 49 Unit-Tests grün; `pnpm build` grün
- `app/`: `pnpm e2e` (Linux/Xvfb, echter Worker, echte Dateien) → 16 Schritte grün, darunter: Freigabe vor jeder Änderung, Verschieben und Undo auf der Platte geprüft, Ablehnen ändert nichts, Recherche gegen lokalen Testserver, PDF-Analyse mit generierten PDFs, .eml-Entwürfe auf der Platte geprüft, Vorlage speichern/planen/ausführen, keine Konsolenfehler, keine verwaisten Prozesse
- Durch Tests gefundene und behobene Fehler, unter anderem: Freigabe kam nie an (null-Felder im Event), verwaiste Worker bei offener WebSocket-Verbindung, Ordnerwahl ging beim Bereichswechsel verloren, irreführende 404-Meldung, „zuletzt ausgeführt“ nach bloßem Planen

**Nicht getestet / offen**
- **Windows:** Start, Pfade, DPAPI-Speicher, Explorer-Anzeige – alles nur unter Linux geprüft
- **Echte KI-Aufrufe:** Anthropic/OpenAI und browser-use nur gegen nachgebildete Anbieter getestet (kein API-Schlüssel in der Testumgebung)
- **Kosten:** browser-use liefert USD-Kosten; bei PDF/Entwürfen werden nur Token gezählt (Preisliste je Modell fehlt noch)
- **Pause** zwischen Schritten (der Button wurde entfernt, statt eine Pause vorzutäuschen)
- **OCR** für Scan-PDFs (bewusst optional, nicht aktiviert)
- **Desktop-Automation** (pywinauto/UI Automation): im Architekturziel vorgesehen, kein MVP-Workflow benötigt sie bisher
- Ein einmaliger, nicht reproduzierbarer E2E-Fehlschlag bei einer Freigabe (3 Wiederholungen grün). Als Absicherung lädt die Oberfläche den Stand nach, wenn der Worker „bereits entschieden“ meldet.

## Phase 4: Beta-Vertrieb (2026-10-31) – technisch vorbereitet, Abnahme durch Menschen offen

**Implementiert**
- **Installer:** PyInstaller-Sidecar (kein Python beim Kunden nötig), electron-builder/NSIS pro Benutzer ohne Admin, eigenes Icon, Lizenztexte im Installationsordner
- **CI** (`.github/workflows/ci.yml`): Linux (Worker-, Lizenz-, Unit-Tests, E2E) und Windows (Tests, Sidecar, E2E, Installer, Start der gepackten App, Installer als Artefakt)
- **Lizenz/Billing-Prototyp:** `license-server/` (Stripe Checkout, Webhook mit Signatur und Idempotenz, Geräte-Limits, Kundenportal, Ed25519-Token); App mit Offline-Lizenzprüfung, 14 Tage Test, Funktionsprüfung im Main-Prozess. Ohne eigenen Schlüssel läuft sie als „Entwicklungsversion“ ohne Sperre
- **Strategie** (`docs/ADR-003.md`): Code-Signatur über CI-Secrets, Auto-Update bewusst noch aus, **keine Telemetrie** in dieser Version
- **Unterlagen:** Rechtstext-Entwürfe (`docs/legal/`, zur anwaltlichen Prüfung), `docs/SUPPORT.md`, `docs/PILOT.md` (Windows-Abnahme-Checkliste, Messgrößen), `docs/MARKETING.md` (3 Videoskripte, Landingpage, Funnel)

**Teststatus**
- Gepackte App unter Linux: eingebauter Worker startet, echter Vorgang erfolgreich (`tests/e2e/packaged.mjs`)
- Lizenzdienst: 7 Tests; App: 55 Unit-Tests (inkl. echter Ed25519-Signaturen, gefälschte Token werden abgelehnt)
- Windows-CI: hat zwei echte Fehler gefunden (CSP-Warnung, Test-Race), beide behoben. Das Ergebnis des aktuellen Laufs steht auf der Actions-Seite des Repos

**Offen (braucht dich bzw. echte Menschen/Konten)**
- Abnahme auf einem **frischen Windows-PC** nach `docs/PILOT.md`
- **Code-Signing-Zertifikat** kaufen und als GitHub-Secrets hinterlegen
- **Stripe-Konto**, Produkte/Preise anlegen, Lizenzdienst hosten (HTTPS), Signaturschlüssel erzeugen und den öffentlichen Schlüssel in `app/src/main/license.ts` eintragen
- **Rechtstexte** anwaltlich prüfen lassen; Marken- und Domainprüfung „NEXORA AI“
- Pilot mit 10–20 Nutzern durchführen und auswerten

## Kundenfreundliche Oberfläche (2026-10-31) ✅

**Implementiert**
- **Startseite „Was soll ich für dich erledigen?“:** vier große Aufgabenkarten (Ordner aufräumen, Webseiten vergleichen, PDFs zusammenfassen, E-Mail-Entwürfe schreiben) mit je einem Satz zum Nutzen; „Gespeicherte Aufgaben wiederholen“
- **Geführter Assistent** je Aufgabe: Auswählen → Erlauben → Starten, ohne Fachbegriffe
- **„Läuft gerade“** in Klartext („Schritt 2 von 4: …“, „Wartet auf deine Bestätigung“), **„Zuletzt erledigt“** mit kurzem Ergebnissatz aus echten Zahlen, „Ergebnis anzeigen“ und „Rückgängig machen“
- Freigabe-Fenster mit „Wo / Was genau / Was passiert“, Statusleiste „Bereit · Läuft auf deinem PC“
- **Expertenansicht** (Einstellungen → Ansicht): technisches Kontrollzentrum mit Ereignisprotokoll, Event-Stream, Kennzahlen und HUD; standardmäßig aus

**Teststatus:** E2E 18 Schritte grün (korrigiert, zuvor fälschlich 19), darunter der komplette Kundenweg auf der Startseite mit Prüfung auf der Festplatte; gepackte App startet mit dem neuen Ablauf; Worker 49 und Unit 55 Tests grün.

## Erststart, Hinweise, Themen (2026-10-31) ✅

**Implementiert**
- **Onboarding** beim ersten Start (3 Schritte) mit **Übungsordner** in „Dokumente“ (Beispieldateien enthalten nur einen Hinweistext, nichts wird überschrieben). Danach öffnet direkt „Ordner aufräumen“: erster echter Erfolg ohne Risiko
- **Windows-Benachrichtigungen**, wenn NEXORA im Hintergrund ist: bei Bestätigungsbedarf, Fertig und Fehler (abschaltbar)
- **Farbthemen** Crimson, Cyan, Violett, Minimal (Masterplan §5), auch in den Canvas-Effekten
- **Datenbank-Sicherung** vor jeder Strukturänderung (`nexora.db.bak-v<alte Version>`)

**Teststatus:** E2E 20 Schritte grün (korrigiert, zuvor fälschlich 21; inkl. Erststart bis zum Erfolg und Themenwechsel), Unit 57, Worker 49 (inkl. Sicherung vor Migration).
**Nicht automatisiert getestet:** Windows-Benachrichtigungen (benötigen ein Fenster ohne Fokus auf einem echten Desktop) – bitte beim Windows-Test prüfen.

## Feinschliff MVP (2026-10-31) ✅

**Implementiert**
- **Echte Pause/Fortsetzen:** hält an sicheren Haltepunkten (zwischen Dateien/Quellen, nach Freigaben), nie mitten in einer Dateioperation; Knöpfe auf der Startseite und in der Statusleiste
- **Optionale Texterkennung (OCR)** für gescannte PDFs: lokal mit Tesseract (vom Nutzer installiert), ehrliche Meldung, wenn es fehlt
- **Kleineres Startpaket:** 774,92 kB → 419,41 kB (gemessen mit `pnpm build`); Diagramm und Expertenansicht laden bei Bedarf

**Teststatus:** Worker 55 Tests (inkl. echter OCR einer gescannten PDF, Pause/Abbruch), Unit 58, E2E 21 Schritte (korrigiert, zuvor fälschlich 22; inkl. Pause während einer langsamen Webseite), gepackte App grün. OCR auch über die gebündelte Programmdatei geprüft (10 erkannte Wörter in der Test-PDF).

**Offen:** Ein einmaliger Fehlschlag von `test_websocket_requires_auth_and_replays` (1 von 11 Läufen, danach 10 grün) ist nicht reproduziert und wird in der CI beobachtet.

**Nächster Schritt**
Pilot nach `docs/PILOT.md`. Phase 5 (Recorder/Replay, weitere Integrationen, Teamfunktionen …) laut Masterplan erst nach positiver Beta.

## Systemzustand und Verbindungstest (2026-10-31) ✅

Masterplan-Module „SystemStatus: echte Worker-/Browser-/Modellverbindung“ und „ModelSettings: Test-Verbindung“.

**Implementiert**
- Worker `GET /api/system`: Version, Laufzeit, Datenbank (Schema, Größe inkl. WAL-Datei, Anzahl Läufe/Ereignisse/Vorlagen), Festplatte, Texterkennung, browser-use, hinterlegte Schlüssel. Alles gemessen, nichts geschätzt.
- Worker `POST /api/ai/test`: prüft den Schlüssel über die Modellliste des Anbieters. Das kostet keine Tokens.
- Einstellungen → „Systemzustand“ in Alltagssprache, Details nur in der Expertenansicht. Die Anzeigen sind aus jenman `SystemPanel` portiert. Dazu kommt der Knopf „Verbindung testen“ je hinterlegtem Schlüssel.
- **Sicherheitskorrektur Web-Recherche:** Bisher wählte die Einstellung „auto“ den KI-Browser still, sobald browser-use installiert und ein Schlüssel hinterlegt war. Seiteninhalte gingen dann ohne Berechtigung „ai.cloud“ und ohne Freigabe an den KI-Anbieter. Jetzt gilt:
  - „auto“ ruft immer lokal direkt ab.
  - Den KI-Browser gibt es nur über ein ausdrückliches Häkchen. Das Häkchen erscheint nur, wenn browser-use installiert ist (im Installer nicht enthalten).
  - Der KI-Browser braucht die Berechtigung „ai.cloud“ und eine Freigabe vor dem Start. Wird abgelehnt, ruft NEXORA ohne KI ab.
  - Zwei Regressionstests; beide schlagen mit dem alten Code fehl (geprüft).
- Veraltete Texte in den Einstellungen („folgt in Phase 2“) ersetzt.

**Teststatus:** Worker 60 Tests, Unit 59, E2E 22 Schritte (neu: Systemzustand mit Werten aus der echten Datenbank), Typprüfung grün.

## Restliche Masterplan-Repos übernommen (2026-10-31) ✅ mit offenen Punkten

**jenman**
- `CommandInterface` → Befehlszeile auf der Startseite.
  - Ein Satz öffnet die passende Aufgabe und füllt sie vor (Adressen, Empfänger).
  - Die Erkennung läuft lokal mit Regeln, ohne KI und ohne vorgefertigte Antworten.

**cyberpunk-dashboard**
- agent-network → Agentenliste mit echten Zählwerten und einem Detail-Dialog.
- operations → Kennzahlen und Vorgangsdetails (Schritte, Freigaben, Ergebnisse).
- intelligence → Ergebnissuche mit Filter nach Art.

**ClawBridge (Desktop, Masterplan Phase 5)**
- Wahrnehmung und Element-Abgleich: Windows UI Automation über pywinauto (BSD-3).
- Recorder/Replay als „Programm bedienen → Schritte zeigen“:
  - Aufgezeichnet wird per Auswahl in NEXORA, ohne globalen Tastatur-Hook.
  - Wiedergegeben wird nach einer Freigabe mit der vollständigen Schrittliste.
  - Jede Texteingabe wird zurückgelesen.
  - Passwortfelder sind gesperrt, NEXORA bedient sich nicht selbst.
- Computer Use als „Programm bedienen → KI machen lassen“:
  - Werkzeug `computer_toolset_20260801`.
  - Gesendet werden nur Fotos eines freigegebenen Fensters.
  - Jede Aktion wird einzeln freigegeben.
  - Gesperrte Tastenkombinationen wie Win+R oder Alt+F4 werden nie ausgeführt.
  - Am Ende steht ein Abschlussbild zur Prüfung durch den Nutzer.

**Geprüft**
- Worker: 72 Tests.
  - Desktop-Logik mit einem Test-Backend.
  - Computer Use mit nachgestellter API: Ablauf, Ablehnung, Sperren, Kosten aus der Nutzung, `toolset_name` in jedem Ergebnis.
  - Echter Editor-Test unter Windows (CI).
- Unit: 65 Tests. E2E: 25 Schritte (Linux und Windows).
- Gebündelter Worker unter Windows: pywinauto lädt (CI-Lauf 25).
- Echter Editor-Test unter Windows **ausgeführt, nicht übersprungen** (CI-Lauf 26, `pytest -rs`): 68 bestanden, 5 übersprungen. Die übersprungenen Tests sind nur für andere Systeme gedacht oder brauchen OCR, Symlinks bzw. den gebauten Sidecar.
- Dabei gefundener Fehler: die Plus-Taste („+“, „Strg++“) wurde als Trennzeichen verschluckt. Behoben, mit Test.

**Nicht geprüft / offen**
- Ein echter KI-Desktop-Lauf gegen die Anthropic-API: in der Testumgebung gibt es keinen Schlüssel.
- Klicks über pywinauto auf einem echten Kunden-Desktop. Die CI prüft Texteingabe und Zurücklesen im Editor, keine Mausklicks.

## Masterauftrag: letzte Code-Lücken geschlossen (2026-10-31)

- KI-Desktop-Modus kann jetzt auch:
  - mit Umschalt/Strg/Alt klicken und scrollen (Windows-Taste bleibt gesperrt),
  - Sonder- und Zusatztasten bis 10 s halten,
  - waagerecht scrollen.
  - Jede dieser Aktionen wird vorher einzeln freigegeben.
- Ausweichmodell des Anbieters: Lehnt das Modell eine Anfrage ab, wählt der Anbieter ein passendes Ersatzmodell (`fallbacks: "default"`). Unterstützt das Konto das nicht, sendet NEXORA einmal ohne erneut.
- Tests: Worker 74 (davon 2 neu für diese Fälle).

Damit ist der Code-Teil des Masterplans umgesetzt. Was nur der Inhaber erledigen kann, steht in `docs/AUDIT.md` unter „Offene Punkte“: Rechtstexte prüfen lassen, Stripe-Konto, Lizenzschlüssel, Code-Signing-Zertifikat, Pilot-Zielwerte und der Test mit eigenem API-Schlüssel auf einem echten Windows-PC.

## Seltener Testfehler geklärt (2026-10-31)

- Ursache des seltenen Fehlschlags von `test_websocket_requires_auth_and_replays`: ein `CancelledError`
  beim Schließen der WebSocket-Verbindung im Starlette-Testclient – ein Zeitfenster im Test, nicht im Produkt.
- Behoben: Der Test trennt die Verbindung ausdrücklich und wartet, bis der Server das Abo entfernt hat.
- Zusätzlich: Wartezeitlimit der Tests von 10 auf 20 Sekunden erhöht, damit ausgelastete CI-Rechner keine
  Fehlalarme mehr durch Zeitüberschreitung auslösen (ein solcher trat bei 40 parallelen Testläufen einmal in `test_organizer` auf).
- Nachweis: 40 Durchläufe der gesamten Worker-Tests; der ursprüngliche WebSocket-Fehler trat nicht mehr auf.

## Weitere Visualisierungen aus evil-ai-viz (2026-10-31)

Auf Kundenwunsch die restlichen **rein dekorativen** Visualisierungen übernommen, in NEXORA-Optik:
- RadarSweep, WireframeGlobe (Drahtgitter-Globus), NeuralNetwork, GlitchOverlay – im Experten-Dashboard als Deko-Ebenen.
- Theme-Farben statt Grün/Cyan, gemeinsamer Animations-Loop (Pause bei verstecktem Fenster, bei reduced motion aus).
- Die **irreführenden Beschriftungen** der Vorlagen wurden entfernt (z. B. „THREAT RADAR“, „NEURAL ARCHITECTURE v7.3 / SELF-IMPROVING“, „GLOBAL NETWORK / NODES“), weil sie einen Status vortäuschen, den es nicht gibt – das widerspräche „nichts erfinden“.
- Dabei gefundener Fehler: Bei sehr kleiner Fläche wurde ein Kreis mit negativem Radius gezeichnet (Konsolenfehler). Behoben (Radar/Globus zeichnen erst ab ausreichender Größe); vom E2E-Konsolenfehler-Test bestätigt.
- Nicht übernommen (Überwachung oder Täuschung, kein „Aussehen“): Keylogger, Fingerprinting, Zwischenablage/Maus-Mitschnitt, Fake-Terminal/-Dialoge/-Benachrichtigungen, „compromised“-Weltkarte, BootSequence mit erfundenen Dienst-/Scan-Zeilen.

**Teststatus:** Unit 65, E2E 26 Schritte (inkl. Konsolenfehler-Prüfung), Typprüfung grün.

## Kundenansicht weiter vereinfacht (2026-10-31)

- „Aktivitäten“ zeigt Kunden nur noch **Vorgang / Status / Ergebnis**. Die technischen Spalten
  (Agent, Schritte, Start, Dauer, Kosten) erscheinen nur in der Expertenansicht.
- Vorgangsdetails: „Agent“ und „Kosten“ nur noch in der Expertenansicht; interne IDs und
  Protokollfehler bereits vorher ausgeblendet.
- Standard bleibt: einfache Startseite; das technische Kontrollzentrum nur bei eingeschalteter Expertenansicht.

Nächste Schritte (mit dem Inhaber abgestimmt): (1) Sprachmodus einfach & lokal (Mikrofon → Befehlszeile,
Antwort mit der System-Stimme), (2) Konnektoren über MCP (wie in Claude), mit Freigabe vor verändernden Aktionen.

## Sprachmodus einfach & lokal (2026-10-31) ✅

- Mikrofon-Knopf in der Befehlszeile: Gesprochenes wird zu Text und öffnet die passende Aufgabe
  (gleiche lokale Erkennung wie beim Tippen – keine KI, keine erfundenen Antworten).
- NEXORA antwortet mit der System-Stimme (speechSynthesis, vollständig lokal); abschaltbar über den Lautsprecher-Knopf.
- Ehrlich zu den Grenzen: Die Spracherkennung nutzt die Web-Speech-API des Browsers. Ist sie nicht verfügbar
  oder braucht sie gerade eine Verbindung, erscheint eine klare Meldung und man tippt weiter. Von NEXORA aus
  wird nichts an fremde Dienste gesendet; es fallen keine API-Kosten an.
- Tests: Unit 68 (inkl. useVoice: ehrliche Meldung ohne Erkennung, deutsche Sprachausgabe, erkannter Text),
  E2E 26 (Mikrofon-Knopf vorhanden).

Nächster Schritt: Konnektoren über MCP (wie in Claude), mit Freigabe vor verändernden Aktionen – größeres Projekt, Aufbau folgt.

## Konnektoren über MCP (2026-10-31) ✅ Grundfunktion

- Kunde fügt in den Einstellungen unter „Verbindungen“ einen Dienst per Adresse hinzu (optional mit Token),
  testet ihn und sieht dessen Werkzeuge. NEXORA ist MCP-Client (wie Claude; offener Standard).
- Token nur im sicheren Speicher (DPAPI), nie in der Datenbank. HTTPS-Pflicht für entfernte Dienste.
- Ein Werkzeug auszuführen ist ein Workflow mit Berechtigung „connectors.use“ UND einer Freigabe je Aufruf.
- Tests: Worker 84 (MCP-Client 5, Konnektoren über API 5), Unit 68, E2E 27 (echter MCP-Testserver: hinzufügen,
  testen „1 Werkzeug“, Werkzeuge anzeigen, entfernen). Architektur in docs/ADR-004-konnektoren-mcp.md.

Offen / nächster Schritt: Werkzeugaufruf aus der Oberfläche (Argument-Formular, Expertenansicht) und später
eine KI-gesteuerte Nutzung – jeweils weiter mit Freigaben. stdio-Transport bewusst noch nicht.

## Neuausrichtung: Chat als Herzstück (2026-10-31) ✅

Auf klares Nutzer-Feedback („unübersichtlich, man kann nicht mit NEXORA schreiben, obwohl API-Key hinterlegt“):
- **Echter Chat als Startseite.** Du schreibst, NEXORA antwortet **live gestreamt** über deinen hinterlegten
  Schlüssel (Anthropic oder OpenAI – automatisch gewählt). Der Schlüssel bleibt im Hauptprozess, nie im Renderer.
  Streaming und API-Aufruf laufen im Main-Prozess (`src/main/chat.ts`), Live-Tippen über den Push-Kanal `chat:delta`.
- **Einrichtung:** Ohne Schlüssel zeigt der Chat einen klaren Hinweis mit Knopf zu den Einstellungen.
- **Aufgeräumt:** Für Kunden zeigt die Seitenleiste nur noch Start, Dateien, Einstellungen; die technischen
  Bereiche (Agenten, Automationen, Aktivitäten) nur in der Expertenansicht.
- **Sprachmodus** ist in den Chat umgezogen (Mikrofon + System-Stimme).
- **Aufgaben** (Ordner, PDF, E-Mail, Programm bedienen) sind als Vorschläge im leeren Chat erreichbar; läuft eine
  Aufgabe, erscheinen Fortschritt/Ergebnis/Rückgängig direkt im Chat (sonst bleibt er leer und ruhig).
- Tests: Unit 68, E2E 27 Schritte – inkl. echtem Chat-Test (nachgebauter Stream-Anbieter): Nachricht → live
  gestreamte Antwort; Kundennavigation ohne technische Bereiche.

**Offen / als Nächstes (mit dir abgestimmt):** „Reden + Aktionen mit Freigabe“ – die KI soll aus dem Chat heraus
Aufgaben vorschlagen/ausführen können (Werkzeug-Aufrufe inkl. der Konnektoren), jede Änderung weiterhin erst nach
deiner Freigabe. Modellwahl pro Anbieter in den Einstellungen folgt.

## NEXORA wird ein Agent – Stufe 1: Werkzeug-Nutzung im Chat (2026-10-31) ✅

Die KI kann jetzt aus dem Gespräch heraus **selbst ein echtes Werkzeug aufrufen** und aus dem Ergebnis antworten.
- Erstes Werkzeug: **web_recherche** (nur lesend, sicher). Fragt der Nutzer nach aktuellen Infos oder nennt Seiten,
  ruft die KI das Werkzeug mit Frage + Adressen auf; der Worker führt die Recherche aus; die KI fasst zusammen.
- Agent-Ablauf im Hauptprozess (`src/main/chat.ts`): mehrstufige Werkzeug-Schleife (Anthropic Tool-Use und
  OpenAI Function-Calling), Schlüssel bleibt im Main. `hub.runToCompletion` startet eine Aufgabe und wartet auf das
  Ergebnis; Freigaben erscheinen dabei normal in der Oberfläche (die Schleife wartet auf die Entscheidung).
- E2E 28: echter Agent-Test – Nachricht „Recherchiere den Tarif auf …" → KI startet die Recherche selbst →
  antwortet „Laut den Quellen kostet der Tarif ab 9,99 Euro im Monat." Der Vorgang erscheint in „Zuletzt erledigt".

**Sicherheit:** Die Recherche ist nur lesend. Weitere Werkzeuge (Ordner/Dateien, E-Mail-Entwürfe, „Programm bedienen",
Konnektoren) kommen als nächste Stufen – jede verändernde/sendende Aktion läuft über die bestehende Freigabe des Workers.

**Nächste Stufen zum vollständigen Agenten:**
1. Weitere Werkzeuge anbinden (PDF, E-Mail-Entwurf, Ordner aufräumen mit nativer Ordnerwahl, Konnektor-Werkzeuge) – mit Freigabe.
2. Werkzeug-Schritte im Chat sichtbarer machen (eigene „arbeitet …"-Zeilen statt nur Text).
3. Modellwahl je Anbieter in den Einstellungen.

## Agent Stufe 2: Aktionen mit Freigabe + Konnektoren (2026-10-31) ✅

Der Agent hat jetzt mehrere Werkzeuge, die er aus dem Chat selbst nutzt:
- **email_entwurf** (schreibend): Die KI erstellt E-Mail-Entwürfe aus dem Gespräch. Es wird nichts gesendet,
  nur .eml-Dateien gespeichert – und das Speichern wird vom Nutzer **freigegeben** (Worker-Workflow draft_emails).
- **konnektoren_auflisten** / **konnektor_aufrufen**: Die KI sieht die verbundenen Dienste und ruft deren
  Werkzeuge auf – jeder Aufruf wird einzeln freigegeben (Worker-Workflow connector_action).
- web_recherche (Stufe 1) bleibt.

E2E 29: echter Agent-Entwurf – „Schreib einen E-Mail-Entwurf an …" → KI ruft das Werkzeug auf → Freigabe →
„1 Entwurf gespeichert – nichts wurde gesendet.". Unit 68.

**Noch offen:** Ordner aufräumen/PDF als Agent-Werkzeuge (brauchen native Datei-/Ordnerwahl), Werkzeug-Schritte
im Chat deutlicher anzeigen, Modellwahl je Anbieter. Der Kern „NEXORA ist ein Agent" steht: die KI entscheidet
selbst, nutzt echte Werkzeuge und hält sich an die Freigaben.

## Live-Sprachmodus mit animiertem Orb (2026-10-31) ✅

- Vollbild-Sprachmodus (Knopf „Sprachmodus" im Chat): animierter Orb, der beim Zuhören und Sprechen lebt.
- Freisprech-Schleife: einmal „Sprechen" tippen → frei reden → NEXORA antwortet laut (System-Stimme) und
  führt dabei dieselben Agent-Werkzeuge aus wie im Chat → hört danach automatisch weiter zu.
- Ehrliche Meldung, wenn die Spracherkennung (Web-Speech-API) nicht verfügbar ist.
- E2E 30: Sprachmodus öffnet (Orb sichtbar) und schließt wieder. Unit 68.

**Ehrliche Einordnung / nächste Stufen zur vollständigen Vision des Inhabers:**
- Der aktuelle Sprachmodus nutzt die Browser-Spracherkennung + System-Stimme. **Echte Telefon-Latenz
  (durchgehendes Echtzeit-Gespräch)** käme über eine Realtime-Sprach-API (z. B. OpenAI Realtime) – eigener, größerer Ausbau.
- **Echtes Senden statt Entwürfe:** E-Mails/Nachrichten wirklich über die verbundenen Dienste des Nutzers senden
  (statt nur Entwürfe) – über die Konnektoren, jede Sendung mit Freigabe. Braucht die Anbindung des E-Mail-Dienstes.
- **Visuelle Konnektor-Einrichtung:** eine Galerie zum Auswählen und Verbinden von Diensten (statt nur Adresse eintragen).
- **Sichtbare Agent-Schritte** im Chat/Sprachmodus (eigene „arbeitet …"-Karten).

## Visuelle Konnektor-Galerie (2026-10-31) ✅

- Einstellungen → „Verbindungen" → „Dienst verbinden": Karten für E-Mail, Kalender, Dateien/Cloud, Chat/Messaging
  und „Eigener Dienst". Klick füllt die Verbinden-Maske vor und erklärt, wo die MCP-Adresse des Dienstes herkommt.
- Ehrlich: Es gibt keine universelle Adresse je Dienst, daher führt jede Karte zur Eingabe der echten MCP-Adresse
  (kein automatisches Fake-Verbinden). Verbinden/Testen/Werkzeuge/Entfernen wie zuvor; Token verschlüsselt (DPAPI).
- E2E 30 (Galerie-Karte wählen → verbinden → testen → Werkzeuge → entfernen). Unit 68.

Offen Richtung „alles erledigen": echtes Senden über verbundene Dienste (mit Freigabe), Echtzeit-Sprache (OpenAI Realtime),
geführte Komplett-Einrichtung, sichtbare Agent-Schritte.

## Echtes E-Mail-Senden statt Entwürfe (2026-11-01) ✅

Auf Wunsch des Inhabers („Ich möchte keine Entwürfe haben"): NEXORA kann jetzt **wirklich E-Mails senden** – über
ein eigenes E-Mail-Konto (SMTP), jede Sendung einzeln freigegeben.
- **Einstellungen → „E-Mail-Konto (zum Senden)":** Server, Port, Verschlüsselung (SSL/STARTTLS/keine), Benutzer,
  Absender und Passwort. Vorlagen für Gmail/Outlook/WEB.DE/GMX füllen Server/Port/Verschlüsselung vor.
  „Verbindung testen" prüft die Anmeldung, ohne eine E-Mail zu senden.
- **Sicherheit:** Das Passwort liegt ausschließlich verschlüsselt im Betriebssystem (DPAPI/safeStorage), wird pro
  Sitzung nur an den lokalen Worker übergeben und **nie** im Renderer oder in der Datenbank gehalten; die Maske
  zeigt es nie an. Nur der Kontostatus (ohne Passwort) geht an die Oberfläche.
- **Agent-Werkzeug „email_senden":** Die KI kann aus dem Gespräch heraus eine echte E-Mail senden. Vor **jedem**
  Versand erscheint die gewohnte Freigabe mit Empfängern, Betreff und Textvorschau (Worker-Workflow `send_email`,
  Fähigkeit `email.send`). Ohne hinterlegtes Konto meldet das Werkzeug das ehrlich und sendet nichts.
- **Worker:** `workflows/send_email.py` (SMTP über smtplib, SSL/STARTTLS, Header-Injektion wird blockiert,
  Teilerfolg „N von M gesendet" wird ehrlich gemeldet), Testendpunkt `/api/email/test` (verify ohne Versand).
  Der Versand ist über ein eingespeistes Sender-Objekt vollständig testbar (keine echten Netzverbindungen im Test).
- Tests: Worker 91 (+7 send_email: Freigabe-vor-Versand, Ablehnung, kein Konto, Teilfehler, Testendpunkt,
  Header-Injektion blockiert, ungültige Konfiguration), Unit 73 (+5: SMTP-Konto verschlüsselt/entfernen/ohne
  OS-Verschlüsselung, Status ohne Passwort, email:set-Schema). Typecheck grün.

Der E-Mail-Entwurf (`email_entwurf`, speichert .eml) bleibt als Alternative bestehen; neu ist das echte Senden daneben.

## Sichtbare Agent-Schritte im Chat (2026-11-01) ✅

Wenn NEXORA im Gespräch ein Werkzeug nutzt, sieht man das jetzt als eigene **„arbeitet …"-Karte** – nicht mehr nur
als flüchtige Textzeile, die mit der Antwort verschwindet.
- Jeder Werkzeug-Start (Recherche, E-Mail-Entwurf/-Versand, Konnektor) erscheint als kleine Karte mit laufendem
  Symbol („Recherchiert im Web …", „Sendet eine E-Mail (nach Freigabe) …" …). Die aktive Karte dreht sich, fertige
  Schritte bleiben als nachvollziehbare Spur über der Antwort stehen.
- Technisch: Der Push-Kanal `chat:delta` trägt jetzt entweder ein Textstück (`delta`) **oder** einen Schritt (`step`).
  Der Chat sammelt Schritte getrennt vom Antworttext (`steps[]` je Nachricht), daher verschwinden sie beim Eintreffen
  der finalen Antwort nicht mehr.
- Tests: Unit 73, Typecheck grün. Der bestehende E2E-Agent-Test bleibt gültig (prüft den Schritttext „Recherchiert im
  Web", jetzt in der Schrittkarte).

## Visuelle Dienste-Sammlung („Connection wie bei Claude") (2026-11-01) ✅

Auf Wunsch des Inhabers: die Einrichtung kommt später; jetzt zählt die **benutzerfreundliche, visuelle Sammlung** der
Dienste, die Kunden verbinden können – ähnlich der Konnektor-Übersicht in Claude.
- **Erweiterte Galerie (Einstellungen → „Verbindungen"):** benannte Dienste in Kategorien – E-Mail & Kalender
  (Gmail, Outlook/Microsoft 365, Google-/Outlook-Kalender), Dateien & Cloud (Google Drive, OneDrive, Dropbox),
  Chat & Team (Slack, Teams, Discord), Produktivität (Notion, Trello, Asana, Linear), Entwicklung (GitHub, GitLab),
  Vertrieb & CRM (HubSpot, Salesforce) und „Eigener Dienst".
- **Suche:** Textfeld „Dienst suchen" filtert die Sammlung live; passende Dienste erscheinen gruppiert nach Kategorie.
- Klick auf eine Karte öffnet die Verbinden-Maske, vorbelegt mit Name und dienstspezifischem Hinweis, wo die
  MCP-Adresse herkommt. Verbinden/Testen/Werkzeuge/Entfernen wie zuvor; Token verschlüsselt (DPAPI).
- **Ehrlich:** kein automatisches „Fake-Verbinden" – jede Karte ist eine Starthilfe zur echten MCP-Adresse; es werden
  **keine fremden Markenlogos** ausgeliefert, die Symbole sind neutrale Platzhalter. Diese Sammlung wird später in die
  geführte Einrichtung eingebettet.
- Nebenbei behoben: Der „Verbindung testen"-Knopf des E-Mail-Kontos heißt jetzt **„E-Mail-Verbindung testen"**, damit
  er nicht mit dem KI-Verbindungstest kollidiert (eindeutiger Name, stabiler E2E-Test).
- Tests: Unit 73, Typecheck grün. Bestehender E2E-Konnektor-Test bleibt gültig (Karte „Eigener Dienst" → verbinden →
  testen → Werkzeuge → entfernen).

## Agent-Werkzeuge: Ordner aufräumen & PDF lesen im Chat (2026-11-01) ✅

Der Chat-Agent kann jetzt auch die beiden letzten Kern-Workflows selbst nutzen – damit sind alle Aufgaben aus dem
Gespräch heraus erreichbar.
- **„ordner_aufraeumen":** NEXORA räumt einen Ordner auf (sortiert Dateien nach Typ). Der Nutzer wählt den Ordner im
  **nativen Fenster** selbst; **jede Verschiebung** wird einzeln freigegeben (Worker-Workflow `organize_folder`,
  Fähigkeiten `files.read`/`files.move`).
- **„pdf_lesen":** NEXORA liest die im nativen Fenster gewählten PDF-Dateien und fasst sie zusammen (nur lesend,
  Worker-Workflow `pdf_analysis`, Fähigkeiten `pdf.read`/`files.export`; ohne Cloud-KI, keine OCR).
- Beide Werkzeuge nehmen keine Argumente – der Pfad wird nie von der KI bestimmt, sondern vom Nutzer im Dialog
  gewählt (sicherer). Ohne Lizenz-Fähigkeit „Echte Aufgaben" melden sie das ehrlich und tun nichts.
- Der Agent hat damit: web_recherche, email_entwurf, email_senden, ordner_aufraeumen, pdf_lesen, konnektoren_auflisten,
  konnektor_aufrufen. Die Schritte erscheinen als sichtbare „arbeitet …"-Karten im Chat.
- Tests: Unit 73, Typecheck grün (die zugrunde liegenden Workflows sind im Worker getestet). Ehrlich: Der native
  Datei-/Ordnerdialog ist – wie der bestehende Auswahlpfad – nicht per E2E automatisiert.

## Kundenfreundlicher Fähigkeiten-Start im Chat (2026-11-01) ✅

Damit Kunden sofort sehen, wie man NEXORA bedient (frühere Kritik: „man wusste nicht, wie man es bedient"):
- Der leere Chat zeigt jetzt **klickbare Beispiel-Anfragen** für jede echte Fähigkeit: Web-Recherche, E-Mail schreiben,
  E-Mail wirklich senden, Ordner aufräumen, PDF zusammenfassen, verbundene Dienste zeigen.
- Ein Klick **füllt das Eingabefeld** mit einem Beispielsatz (sendet nicht sofort) und setzt den Fokus – so lernt der
  Kunde beiläufig, wie man mit NEXORA spricht, und kann den Satz vor dem Senden anpassen.
- Die bisherigen „fertige Aufgabe"-Chips (Assistent/Wizard) bleiben darunter erhalten. Rein additiv.
- Tests: Unit 73, Typecheck grün. Bestehender E2E-Chat-Test bleibt gültig (Eingabefeld „Nachricht an NEXORA"
  unverändert).

Damit sind die Agent-Fähigkeiten im Chat vollständig und kundenfreundlich sichtbar. Bewusst noch offen als eigene,
größere Vorhaben: Echtzeit-Sprache (OpenAI Realtime; braucht echten Schlüssel + Mikrofon, daher separat und ehrlich
testbar aufzusetzen) und die geführte Komplett-Einrichtung (laut Wunsch zuletzt, bindet die Dienste-Sammlung ein).

## Sichtbare Agent-Schritte auch im Sprachmodus (2026-11-01) ✅

Der Sprachmodus zeigt jetzt dieselben **„arbeitet …"-Schritte** wie der Chat – der Kunde sieht beim Reden, was NEXORA
gerade tut, nicht nur die gesprochene Antwort.
- Der Sprachmodus abonniert `chat:delta` und sammelt die Schritte zur laufenden Anfrage (Abgleich über die
  Anfrage-ID), zeigt sie als kleine Karten unter dem Orb; die aktive Karte dreht sich beim Nachdenken.
- Freigaben (z. B. vor dem E-Mail-Versand) erscheinen weiterhin als normaler Freigabe-Dialog – auch im Sprachmodus,
  da derselbe Agent/Worker-Pfad läuft.
- Konsistent zum Chat: gleiche Schrittbeschriftungen, gleiches Symbol.
- Tests: Unit 73, Typecheck grün. Der bestehende E2E-Sprachmodus-Test (Orb öffnet/schließt) bleibt gültig.

## Geführte Komplett-Einrichtung (Erststart) (2026-11-01) ✅

Die Begrüßung beim ersten Start ist jetzt eine echte **geführte Einrichtung** in vier Schritten – der Kunde ist danach
sofort startklar (behebt „man wusste nicht, wie man anfängt / man konnte nicht schreiben").
1. **Willkommen:** was NEXORA für dich tut (schreiben/sprechen → erledigen), Freigaben, Daten bleiben lokal.
2. **KI-Schlüssel eintragen (NEU, der Kern):** Anbieter wählen (Anthropic/OpenAI), Schlüssel eingeben, „Speichern &
   prüfen" (Testverbindung). Erst dadurch kann man überhaupt mit NEXORA schreiben. Der Schlüssel wird nur verschlüsselt
   im Betriebssystem gespeichert, nie in der Oberfläche angezeigt. Überspringbar (mit ehrlichem Hinweis).
3. **Kontrolle/Freigaben:** Beispiel „E-Mail senden" mit Erlauben/Ablehnen; Hinweis, dass weitere Dienste (E-Mail-Konto,
   Kalender, Slack …) unter „Einstellungen → Verbindungen" (der visuellen Dienste-Sammlung) verbunden werden.
4. **Loslegen:** zwei Wege – **„Mit NEXORA schreiben"** (direkt in den Chat) oder **„Übungsordner"** (gefahrlos üben).
- Tests: Unit 73, Typecheck grün. E2E-Erststart-Test an den neuen Ablauf angepasst (ein Schritt mehr: KI-Schlüssel wird
  im Test übersprungen; Abschluss über „Übungsordner").

## Ordner-Wächter (Grundfähigkeit) (2026-11-01) ✅ Backend

Differenzierer #2: `organize_folder` kann jetzt als **Wächter** laufen – optionaler Parameter `newer_than_hours`
sortiert nur Dateien ein, die jünger als N Stunden sind (sonst wie bisher alle). Als wiederkehrender Zeitplan ergibt
das einen praktischen Ordner-Wächter („sortiere alles Neue der letzten 24 h"), ohne Dauer-Daemon.
- Chirurgisch am vorhandenen Organizer umgesetzt (kein neuer Workflow, keine Duplizierung): Zeitfilter nach `scan`,
  Titel-Zusatz, Input-Feld (1–8760 h). Freigabe/Undo/Journal unverändert.
- Worker-Test `test_watcher_only_sorts_recent_files`: alte Dateien werden übersprungen, nur die aktuelle einsortiert.
  Worker 92 (+1), 1 skip.
- **Ehrlich / offen:** Das ist die Backend-Fähigkeit. Für die Kundennutzung fehlt noch die UI-Anbindung (Option „nur
  neue Dateien" im Ordner-Assistenten + als Zeitplan-Vorlage speichern). Ein **echter Ereignis-Wächter** (sofort bei
  neuer Datei) bräuchte zusätzlich einen Datei-Watcher im Worker – bewusst nicht in diesem Schritt (Simplicity First).

## Lokales KI-Modell (Ollama) – Datenschutz-Differenzierer (2026-11-01) ✅

NEXORA kann die KI jetzt **komplett lokal** über Ollama laufen lassen – ohne Cloud, ohne Schlüssel. Das ist der stärkste
Datenschutz-Hebel gegenüber Cloud-Tools (Zapier/Make/n8n) und Cloud-Chatbots.
- Neuer KI-Anbieter **„ollama"** (lokal). Spricht denselben OpenAI-kompatiblen Endpunkt wie OpenAI, nur auf
  `127.0.0.1` und **ohne Authorization-Header**. Ist das lokale Modell aktiv, hat es Vorrang vor Anthropic/OpenAI und
  **braucht keine Cloud-KI-Lizenz** (es ist ja lokal).
- **Einstellungen → „Lokales KI-Modell (Ollama)":** aktivieren, Modellname (Standard `llama3.1`), Adresse
  (Standard `http://127.0.0.1:11434/v1/chat/completions`), Speichern. Konfiguration liegt in den App-Einstellungen
  (kein Secret nötig).
- Sauber getrennt: `PROVIDERS` (Schlüssel-Anbieter: anthropic/openai) vs. `CHAT_PROVIDERS` (+ ollama) und neuer Typ
  `SecretProvider`; `SecretStatus.configured` bleibt auf die Schlüssel-Anbieter beschränkt.
- **Ehrlich:** Werkzeug-/Aktionsnutzung gelingt am besten mit werkzeugfähigen Modellen (z. B. llama3.1); nicht jedes
  lokale Modell kann Werkzeuge. End-to-end hier NICHT testbar (kein lokaler Ollama-Server in dieser Umgebung) – Unit 81,
  Typecheck grün; der Code nutzt denselben getesteten OpenAI-kompatiblen Agent-Pfad.
- Roadmap der Differenzierer: als Nächstes Audit-Export (#4), Ordner-Wächter (#2), BYOK/Kosten sichtbar (#5),
  „Frag deine Dateien" (#3).

## Kombinierte Abläufe sichtbar gemacht (2026-11-01) ✅

Rückmeldung des Inhabers: einzelne Werkzeuge wirken „zu wenig". NEXORAs eigentliche Stärke – der Agent **verkettet
die Werkzeuge im Gespräch selbst** – wird jetzt sichtbar und einfach nutzbar gemacht (statt neuer technischer Bausteine).
- Neue Tipp-Kategorie **„Kombinierte Abläufe"** (zuoberst): Recherche→E-Mail-Entwurf, Recherche→E-Mail senden,
  Ordner aufräumen→PDFs zusammenfassen, PDF lesen→Kernpunkte per E-Mail, Dienst abfragen→E-Mail. Ein Klick füllt den
  passenden Ein-Satz-Auftrag; NEXORA erledigt mehrere Schritte nacheinander (sendende Schritte weiter mit Freigabe).
- Chat-Ansage klarer: „Sag einfach dein Ziel in einem Satz – NEXORA erledigt alle nötigen Schritte, auch mehrere."
- System-Prompt ergänzt: Der Agent kombiniert Werkzeuge selbstständig (z. B. web_recherche → email_entwurf).
- Tests: Unit 81, Typecheck grün.

**Bewusst NICHT übernommen (Grenze gehalten):** Aus evil-ai-viz die schädlichen Teile – Keylogger, Clipboard-/WebRTC-
Abgriff, Geräte-Fingerprinting, Tipp-Biometrie, Standort-Tracking sowie Fake-Terminal/Fake-OS-Dialoge/„compromised"-
Karte/erfundene Scans. Das wäre Spyware (DSGVO-widrig, store-unfähig) und täuschende Fake-Daten; schädigt die Endkunden.
Die harmlosen dekorativen Visualisierungen von evil-ai-viz sind bereits übernommen (mit echten Daten).

## Operations-Karten aus cyberpunk-dashboard portiert (2026-11-01) ✅

Auf Anweisung: die operations-Kartenoptik (Karten-Grid mit Fortschrittsbalken) aus raheem-dotgit/cyberpunk-dashboard
(@8ec7ec7 master, `app/operations/page.tsx`) übernommen und an unseren Stack portiert. Neue Komponente
`components/feed/OperationsCards.tsx`; in „Aktivitäten" als **Umschaltung Tabelle ↔ Karten** eingebunden.
- Karten zeigen pro Vorgang: Titel, Status-Badge, Ergebnis/Fehler, Start, Schritte, Kosten (Experten) und einen
  **Fortschrittsbalken** (aus `progressOf`). Klick öffnet die Vorgangsdetails.
- **Ehrlich:** Die Vorlage zeigt erfundene Spionage-Operationen (Priorität/Standort/Agentenzahl/Ziele). Diese Felder
  wurden **weggelassen, nicht erfunden**; es werden nur echte Vorgangsdaten angezeigt. Attribution in
  `THIRD_PARTY_NOTICES.md`.
- Hinweis zu den anderen beiden Repo-Ansichten: **agent-network** ist bereits als `Agents.tsx` (Roster-Tabelle mit
  echten Daten) portiert; **intelligence** (klassifizierte Reports mit Bedrohungsstufen) hat kein echtes
  NEXORA-Gegenstück und wurde bewusst NICHT 1:1 übernommen (würde erfundene Daten erfordern).
- Tests: Unit 81, Typecheck grün.

## Kommandozentrale-Optik aus cyberpunk-dashboard portiert (2026-11-01) ✅

Auf ausdrückliche Anweisung des Inhabers: die command-center-Kartenanordnung aus raheem-dotgit/cyberpunk-dashboard
(@8ec7ec7 master, `app/command-center/page.tsx`) **übernommen und an unseren Stack portiert** (React 19 + Tailwind 4
+ Theme-Tokens statt Next.js/shadcn/neutral+orange). Neue Komponente `components/kpi/CommandCenter.tsx`, ersetzt im
Dashboard die schlichte `KpiGrid`-Zeile.
- Karten: Vorgänge (aktiv/erledigt/fehlgeschlagen + Agentenliste), Aktivität (letzte Ereignisse), Status (Wireframe-
  Kugel + Freigaben/Kosten), Kostenverlauf (Gitter + Linie), Ergebnisse.
- **Ehrlich (zwingend):** Die Vorlage zeigt erfundene Spionage-Dummy-Daten (Agenten „VENGEFUL SPIRIT", Missionen,
  Chat-Logs, feste Zahlen). Diese wurden **vollständig durch echte Zustandsdaten ersetzt** (`selectKpis`,
  `selectAgents`, `selectCostSeries`, echte Ereignisse) – es werden keine Werte erfunden. Attribution in
  `THIRD_PARTY_NOTICES.md` (Repo/Commit, „im README als MIT bezeichnet, keine LICENSE-Datei").
- `orbit-panel` und restliches Dashboard unverändert (E2E gültig). Tests: Unit 81, Typecheck grün.
- **Lizenz-Hinweis (ehrlich):** Das Repo hat keine LICENSE-Datei, nur „MIT" im README. Übernahme auf Anweisung des
  Inhabers; Empfehlung weiterhin: schriftliche Zustimmung des Autors archivieren.

## Konnektoren-Katalog stark erweitert + ausgelagert (2026-11-01) ✅

Auf Wunsch des Inhabers („sehr viele Konnektoren, schön, auch im Onboarding"): Der Dienste-Katalog wurde von ~18 auf
**~42 Dienste in 10 Kategorien** erweitert und nach `data/connectors.ts` ausgelagert, damit ihn Einstellungen **und**
(als nächster Schritt) das Onboarding gemeinsam nutzen.
- Kategorien: E-Mail & Kalender, Dateien & Cloud, Chat & Team, Produktivität & Aufgaben, Entwicklung, Vertrieb & CRM,
  Marketing & Social, Finanzen & Commerce, Wissen & Support, Sonstiges (Gmail, Outlook, Drive, Slack, Teams, Notion,
  Jira, GitHub, HubSpot, Salesforce, Stripe, Shopify, Zendesk, Airtable … + „Eigener Dienst").
- `ConnectorsSection` nutzt jetzt den ausgelagerten Katalog (Suche + Kategorie-Gruppierung unverändert).
- **Ehrlich:** keine fremden Markenlogos (neutrale thematische Symbole); kein „Fake-Verbinden" – ein Klick öffnet die
  Verbinden-Maske (MCP-Adresse/Token). Echtes Ein-Klick-OAuth bräuchte den unter „Weg 3" zurückgestellten Server.
- Tests: Unit **81** (+4 Katalog-Integrität: ≥40 Dienste, eindeutige IDs, gültige Kategorien, „Eigener Dienst"),
  Typecheck grün.
- **Onboarding-Integration erledigt:** Neuer Erststart-Schritt „Deine Dienste verbinden" zeigt die Kategorien samt
  Dienste-Anzahl („über 40 Dienste") und bietet „Jetzt Dienste verbinden" (führt zu Einstellungen → Verbindungen) oder
  „Weiter" zum späteren Verbinden. E2E-Erststart-Test um diesen Schritt ergänzt. Unit 81, Typecheck grün.
- **Offen/nächster Schritt:** „Tipps"-Framing im Chat (statt technischer Workflow-Begriffe) weiter schärfen.

## Workflows deutlich erweitert: „Fertige Aufgaben"-Sammlung (2026-11-01) ✅

Die sichtbare Workflow-/Aufgaben-Sammlung wurde von 6 flachen Beispielen auf **~20 kuratierte, kategorisierte
„Fertige Aufgaben"** erweitert – mit Suchfeld und Gruppierung (Recherche & Web, E-Mail, Dateien & PDF, PC steuern,
Verbundene Dienste).
- **Ehrlich:** Jedes Rezept bildet auf eine **bereits vorhandene, echte** Agent-Fähigkeit ab (web_recherche,
  email_entwurf/email_senden, ordner_aufraeumen, pdf_lesen, offene_fenster/computer_steuern,
  konnektoren_auflisten/konnektor_aufrufen). Es werden keine Fähigkeiten vorgetäuscht, die NEXORA nicht hat.
- Klick füllt das Eingabefeld (sendet nicht automatisch); verändernde/sendende Aktionen laufen weiterhin über Freigabe.
- Neue Dateien: `data/recipes.ts`, `components/home/RecipeGallery.tsx`; ersetzt die frühere kleine Beispiel-Liste im
  leeren Chat (die geführten 5 Wizard-Workflows in `WorkflowGallery` bleiben daneben bestehen).
- Tests: Unit **77** (+4: Rezept-Integrität – ≥18 Einträge, eindeutige IDs, gültige Kategorien, alle Kategorien belegt),
  Typecheck grün.

## Beeindruckende Live-Visualisierung während der Agent arbeitet (2026-11-01) ✅

Vision-Säule „beeindruckende Live-Visualisierung": Während NEXORA eine Antwort/Aufgabe bearbeitet, zeigt der
Chat-Header jetzt einen dezenten, lebendigen **„Agent-Puls"** (Equalizer-Balken in der Akzentfarbe) – NEXORA wirkt
aktiv und lebendig, ohne die klare Oberfläche zu stören.
- Neue Komponente `components/home/AgentPulse.tsx`; CSS-Animation (`.agent-eq` / `@keyframes nexora-eq`) in styles.css.
- Erscheint nur während `streaming`; rein dekorativ (aria-hidden) mit Screenreader-Status „NEXORA arbeitet"; respektiert
  `prefers-reduced-motion` (Balken werden statisch). Passt zu den bestehenden Visualisierungen (Orb im Sprachmodus,
  drehende Schrittkarten).
- Tests: Unit 73, Typecheck grün.

## Fertige Workflows als Ein-Klick-Galerie (2026-11-01) ✅

Vision-Säule „fertige Workflows": Die mitgelieferten Workflows erscheinen im leeren Chat jetzt als schöne,
benannte **Karten mit Symbol, Titel und Nutzen-Satz** (Ordner aufräumen, Webseiten vergleichen, PDFs zusammenfassen,
E-Mail-Entwürfe, Programm bedienen) statt als kleine Chips. Ein Klick öffnet den passenden Assistenten.
- Neue Komponente `components/home/WorkflowGallery.tsx`; nutzt die vorhandenen `WORKFLOWS`-Daten und den Wizard.
- Rein additiv/ersetzend im leeren Chat; `data-testid="task-chips"` und die Titel bleiben erhalten (E2E gültig).
- Tests: Unit 73, Typecheck grün.

## Echte Computeraktionen im Chat: NEXORA bedient Programme (2026-11-01) ✅

Vision-Säule „echte Computeraktionen": Der Chat-Agent kann jetzt ein echtes Programm auf dem PC bedienen – über die
bereits vorhandene, getestete Desktop-Automation des Workers, jetzt als Chat-Werkzeug.
- **„offene_fenster"** (nur lesend): listet die offenen Programmfenster, damit der Agent das richtige Fenster wählt.
- **„computer_steuern" ({fenster, ziel})**: bedient das Programm Schritt für Schritt Richtung Ziel über den
  Worker-Workflow `desktop_ai` (Fähigkeiten `desktop.read`/`desktop.control`/`ai.cloud`). **Vor jeder einzelnen Aktion**
  holt der Worker eine Freigabe – wie überall sonst. Eigene NEXORA-Fenster sind ausgeschlossen (is_own_window).
- Mehrstufiger, sicherer Ablauf (erst Fenster sehen, dann gezielt bedienen) statt blinder Steuerung; Schritte
  erscheinen als sichtbare „arbeitet …"-Karten in Chat und Sprachmodus.
- **Ehrlich:** Die eigentliche Desktop-Steuerung läuft nur auf einem echten (Windows-)Desktop mit Cloud-KI; die
  Einbindung nutzt denselben getesteten Freigabe-/Worker-Mechanismus wie die übrigen Werkzeuge, ist hier (Linux/headless)
  aber nicht end-to-end automatisiert testbar. Unit 73, Typecheck grün.

## Weg 3: BYOK maximal bequem + UI-Politur (2026-11-01) ✅

Entscheidung des Inhabers: vorerst **kein Server/Hosting**, dafür den vorhandenen BYOK-Weg so einfach wie möglich und
die Oberfläche polieren.
- **Onboarding (Schlüssel-Schritt):** pro Anbieter eine Schritt-für-Schritt-Anleitung und ein „Schlüssel holen"-Knopf,
  der die richtige Anbieterseite im echten Browser öffnet. Neuer, eng begrenzter IPC-Kanal `shell:openExternal`
  (nur https, nur Allowlist-Hosts – console.anthropic.com, platform.openai.com, docs/help – im Main geprüft).
- **UI-Politur (via UI/UX-Checkliste):** Die Style-Grundlage war bereits solide (Design-Tokens, globales
  `prefers-reduced-motion`, Fokusringe, Disabled-States, 4 Themes). Gezielt ergänzt: `color-scheme: dark` (native
  Auswahllisten/Scrollbars/Autofill passend zum dunklen Theme) und `cursor: pointer` für Schaltflächen/Tabs
  (Chromium-Standard für `<button>` ist sonst der Pfeil). Risikoarm, global wirksam.
- Tests: Unit 73, Typecheck grün.

**CEO-Statusnotiz:** Alle kundenseitigen Systeme sind damit umgesetzt: Chat-Herzstück, vollständiger Agent (Recherche,
E-Mail-Entwurf/-Versand, Ordner, PDF, Konnektoren), sichtbare Schritte in Chat + Sprachmodus, Freigaben überall,
visuelle Dienste-Sammlung, geführte Einrichtung. **Bewusst zurückgestellt** bleibt die Echtzeit-Sprache (OpenAI
Realtime): Sie braucht einen echten OpenAI-Schlüssel, ein Mikrofon und Live-Audio und ist in der CI/headless nicht
ehrlich verifizierbar – sie wird als eigenes, sauber testbares Vorhaben gebaut statt als ungetesteter Brocken. Offen
für die Markteinführung bleiben die menschliche Windows-Abnahme und die vom Kunden selbst einzutragenden Schlüssel.

