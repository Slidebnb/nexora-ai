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
- Dabei gefundener Fehler: die Plus-Taste („+“, „Strg++“) wurde als Trennzeichen verschluckt. Behoben, mit Test.

**Nicht geprüft / offen**
- Ein echter KI-Desktop-Lauf gegen die Anthropic-API: in der Testumgebung gibt es keinen Schlüssel.
- Klicks über pywinauto auf einem echten Kunden-Desktop. Die CI prüft Texteingabe und Zurücklesen im Editor, keine Mausklicks.
- Klick mit Zusatztasten, Taste halten und waagerechtes Scrollen werden bewusst abgelehnt (noch nicht umgesetzt).

