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

**Nächster Schritt**
Phase 2, Schritt 1: Python-Worker (`worker/`, FastAPI, SQLite) mit Events gemäß Vertrag; Start aus dem Main-Prozess an 127.0.0.1 mit Einmal-Token; WS-Event-Stream mit Replay-Cursor an den Renderer.
