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

**Nächster Schritt**
Pilot nach `docs/PILOT.md`. Phase 5 (Recorder/Replay, weitere Integrationen, Teamfunktionen …) laut Masterplan erst nach positiver Beta.
