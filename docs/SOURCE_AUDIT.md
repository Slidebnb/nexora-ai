# SOURCE_AUDIT — Phase 0

Stand: 2026-10-31 · Methode: `git clone --depth 1` jedes Repos, manuelle Sichtung der Dateien, Manifeste und Lizenztexte.
**Nicht durchgeführt:** Builds, Tests oder Laufzeitprüfungen der Fremdrepos. Alle Funktionsaussagen beruhen auf Codelektüre, nicht auf verifizierten Funktionstests.

## Gepinnte Commits

| Repo | Commit | Datum | Dateien | Code-LOC (ts/tsx/py/js) |
|---|---|---|---|---|
| ChatDSJ/evil-ai-viz | `cf22a870b9209478be90739f70118b89caa8bb29` | 2026-03-08 | 217 | ~31 700 |
| Davood121/jenman | `5a19ab9af84cc3fbc6efc38efc98d9db25034bc1` | 2026-07-27 | 97 | ~7 400 |
| raheem-dotgit/cyberpunk-dashboard | `8ec7ec7d07c51d07a99f9d10cae39201c945b346` | 2026-03-16 | 90 | ~8 300 |
| NickRomanek/clawbridge | `a8a06c214e497c51ae5a677e142698bba437b8e0` | 2026-03-13 | 127 | ~28 000 |

## Lizenzbefund (wichtigster Punkt)

| Repo | LICENSE-Datei | Angabe im README | Bewertung |
|---|---|---|---|
| evil-ai-viz | **keine** | „MIT — Do whatever you want…“ | ⚠️ Kein Lizenztext und kein Copyright-Halter. Ein MIT-Hinweis nur im README ist rechtlich unklar. **Code nicht kopieren**, bis der Autor eine LICENSE ergänzt oder schriftlich zustimmt. Nur als Ideenquelle nutzen und eigenständig neu implementieren. |
| jenman | MIT, „Copyright (c) 2025 Shaik Davood“ | MIT | ✅ Übernahme möglich, Copyright- und Lizenzhinweis müssen mitgeliefert werden. Bilder `jarvis-orb-ref.png` und `tech-bg.png` haben eine ungeklärte Herkunft und werden **nicht übernommen**. |
| cyberpunk-dashboard | **keine** | „MIT License“ | ⚠️ Wie evil-ai-viz: kein Lizenztext, kein Copyright-Halter. Mit v0.app generiert (`generator: 'v0.app'`). **Nur Informationsarchitektur als Inspiration**, keine Codekopie. |
| clawbridge | **zwei widersprüchliche:** `LICENSE` = Apache-2.0, `LICENSE.txt` = MIT („Copyright (c) 2026 RomaTek AI“) mit zusätzlichem „AI Automation Disclaimer“ | „Apache License 2.0“ | ⚠️ Lizenzlage widersprüchlich. Der CLA erlaubt dem Maintainer Relizenzierung. Im Fall einer Übernahme beide Texte und den Disclaimer mitliefern und Apache-2.0 §4 einhalten (Änderungen kennzeichnen). Ein Klärungs-Issue beim Maintainer wird empfohlen. |

Konsequenz: Phase 1 enthält **keinen kopierten Fremdcode**. Alle UI-Komponenten werden eigenständig geschrieben. Der jenman-Code (MIT) dient als Referenz. Kopierte Fragmente sind nur mit Eintrag in `THIRD_PARTY_NOTICES.md` erlaubt.

## A. evil-ai-viz

- **Zweck:** Kunst-/Satireprojekt „überwachende KI“. Vite + React 19 + Tailwind 4 + Convex (Auth/Tracking). Paketname `convex-vite-starter`. Toolchain bun/biome.
- **Plan-Pfade geprüft:** `MatrixRain.tsx` (90 Z.), `FakeTerminal.tsx` (288), `WorldMap.tsx` (308), `DataFlowLines.tsx` (159), `CodeFragments.tsx` (159), `HexStream.tsx` (74), `ScanLines.tsx` (56; Schreibweise abweichend vom Plan). Alle vorhanden.
- **Nutzbar als Idee:** Canvas-Loop-Muster (`useCanvas.ts`), Scanline-Overlay, Datenfluss-Linien, Hex-Stream als dekorative Ebene.
- **Verwerfen:** über 50 Viz-Dateien mit Fingerprinting und Überwachung (`DeviceFingerprint`, `ClipboardInterceptor`, `KeyloggerOverlay`, `WebRTCProbe`, `TabCloseInterceptor`, `FakeOSDialog` …). `useVisitorInfo.ts` ruft `ip-api.com` (unverschlüsselt per http) und `ipapi.co` für IP-Geolokation auf. `WorldMap` zeigt „compromised“-Städte. `FakeTerminal` erzeugt Inhalte per `Math.random` (15 Aufrufe). Convex komplett.
- **Risiken:** Lizenz (s. o.), Datenschutz (DSGVO) beim Tracking, Fake-Metriken.
- **Aufwand:** gering, da nur Neuimplementierung von 3–4 dekorativen Canvas-Ebenen (je etwa 50–150 Z.).

## B. jenman

- **Zweck:** Replit-generiertes „J.A.R.V.I.S.“-HUD. pnpm-Workspace mit `artifacts/jarvis` (Vite/React 19.1/Tailwind 4/framer-motion) und `artifacts/api-server` (nur Health-Route).
- **Build-Befund (statisch):** `pnpm-workspace.yaml` referenziert `lib/*` und `scripts`, die im Repo fehlen. Die Abhängigkeiten nutzen `catalog:` und Replit-Vite-Plugins. Ein Standalone-Build ohne Anpassung ist **wahrscheinlich nicht** möglich (nicht ausgeführt).
- **Nutzbar:** `AiCore.tsx` (353 Z., Canvas-Ringe, Arcs, Sweep, ResizeObserver) ist die beste Referenz für den Orbit-Kern. Außerdem das Layout von `AgentPanel.tsx`, `SystemPanel.tsx` und `TopBar.tsx`.
- **Verwerfen:** sämtliches JARVIS-/„STARK INDUSTRIES“-Branding (u. a. `CommandInterface.tsx:28`), die Cyan-Farbwelt, `use-jarvis-system.ts` mit vorgefertigten Antworten und `Math.random`-Telemetrie, die Bilder in `public/images`, die Replit-Plugins.
- **Aufwand:** mittel. Der Orbit wird neu geschrieben, mit Run-State statt `cpuLoad`/`powerLevel` als Eingabe.

## C. cyberpunk-dashboard

- **Zweck:** v0.app-generiertes Next.js-16-Dashboard. **Tailwind 3.4** (nicht 4, wie im Masterplan angenommen), Recharts 2.15.4, `@vercel/analytics`, shadcn/ui.
- **Struktur:** Seiten `command-center` (268 Z.), `agent-network` (334), `operations`, `intelligence`, `systems`. Die Komponenten sind inline in den `page.tsx` angelegt, es gibt keine wiederverwendbare Komponentenbibliothek.
- **Nutzbar als Idee:** Sidebar-Navigation, KPI-Kartenraster, Agentenliste mit Statusspalte, Ops-Tabelle.
- **Verwerfen:** Next.js-Runtime, `@vercel/analytics`, Platzhalterbilder, statische Mockdaten.
- **Hinweis:** Die Ordnerstruktur von `slidebnb` (ein anderes Projekt) ähnelt stark derjenigen dieses Dashboards. NEXORA liegt davon getrennt im eigenen Repository `Slidebnb/nexora-ai`.

## D. clawbridge

- **Zweck:** lokaler Agent-Server (FastAPI) mit Browser-Use-, Computer-Use- und OpenClaw-Engine, Recorder, MCP-Server, Tray und Stripe-Lizenzierung.
- **Monolith:** `clawbridge.py` umfasst 14 765 Zeilen (der Masterplan nannte ~12 700). Das modulare Paket `clawbridge/` umfasst insgesamt ~6 000 Zeilen.
- **Plan-Pfade geprüft:** `orchestrator/manager.py` (526) ✅, `engines/browser_use_engine.py` (337) ✅, `engines/computer_use_engine.py` (1 093) ✅, `perception/` ✅, `recorder/` ✅, `server/routes/` ✅, **`server/ws.py` existiert nicht**, gemeint ist `server/routes/ws.py` (131), `policy/safety.py` (291) ✅, `telemetry/logger.py` (138) ✅.
- **Nutzbar (Muster, Adapter neu schreiben):**
  - `policy/safety.py`: Aktionsklassen, Credential-/PII-Redaktion per Regex, Sensitive-Domain-Liste. Die Konzepte sind gut, das eigene ApprovalCenter wird jedoch strenger (Default: deny/ask).
  - `shared/schemas.py`: Pydantic-Modelle für Task und Step als Vorlage für den Event-Vertrag.
  - `engines/base.py`: Engine-Interface.
  - `perception/accessibility.py`: UIA-Zugriff.
- **Sicherheitsbefunde (Codelektüre):**
  - `server/app.py:68`: `CORSMiddleware(allow_origins=["*"])` und keine Token-Authentifizierung auf REST/WS im modularen Server erkennbar. Jede Webseite im Browser des Nutzers könnte damit localhost-Endpunkte ansprechen. **Nicht übernehmen.**
  - `orchestrator/manager.py:460ff`: `remote_bridge_loop` pollt Aufgaben von einem entfernten Hub und führt sie aus. Das ist eine Remote-Execution-Fläche und wird **verworfen**.
  - `engines/openclaw_engine.py` startet einen Fremdprozess. Wird verworfen.
  - Der Policy-Modus `PERMISSIVE` existiert. NEXORA bekommt keinen permissiven Modus für Schreib-, Sende- oder Löschaktionen.
- **Dependency-Risiken (`requirements.txt`):** ausschließlich `>=`-Ranges, kein Lockfile. **`pynput` und `pystray` stehen unter LGPL-3.0.** In einem PyInstaller-Bundle führt das zu Pflichten (Austauschbarkeit der Bibliothek). Für das MVP werden sie nicht benötigt. `browser-use` (MIT) bringt viele transitive Abhängigkeiten mit; seine standardmäßige anonyme Telemetrie ist vor der Integration zu prüfen und abzuschalten. `pyautogui` (BSD-3) und `pywinauto` (BSD-3) sind unkritisch.
- **Tests:** `tests/unit` (u. a. `test_safety.py`, `test_schemas.py`), `integration`, `e2e`. Wurden hier nicht ausgeführt.
- **Aufwand:** hoch bei Direktübernahme, mittel bei eigenem schlanken Worker mit selektiv portierten Konzepten. **Entscheidung: eigener Worker** (siehe ADR-001).

## Entscheidungsmatrix

| Quelle | Übernehmen | Neu schreiben (inspiriert) | Verwerfen |
|---|---|---|---|
| evil-ai-viz | – | ScanLines, DataFlowLines, HexStream (dekorativ, mit echten Event-IDs gefüttert) | Tracking, Fingerprinting, Fake-Terminal, Convex, WorldMap „compromised“ |
| jenman | – (später ggf. Fragmente aus `AiCore.tsx` mit MIT-Hinweis) | OrbitCore (Canvas), AgentCard, StatusBar | Branding, Bilder, Replit-Plugins, Fake-Responses |
| cyberpunk-dashboard | – | Sidebar, KPI-Grid, Agent-Tabelle, Charts (Recharts) | Next.js, Vercel Analytics, Mockdaten |
| clawbridge | – | Worker-Engine-Interface, Safety-Policy, Redaktion, Audit-Log, Schemas | CORS `*`, Remote-Bridge, OpenClaw, Stripe-im-Client, Tray/pynput, Monolith |
