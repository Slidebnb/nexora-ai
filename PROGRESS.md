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

## Phase 1: UI-Shell

### Schritt 1 + 2: Electron-Grundgerüst mit gehärtetem Fenster (2026-10-31) ✅

**Implementiert** (`app/`)
- electron-vite 6, Electron 45, React 19, Vite 8, Tailwind 4, TypeScript 7 (Versionen exakt gepinnt)
- `src/main/security.ts`: `contextIsolation`, `sandbox`, `nodeIntegration: false`, kein `webviewTag`, CSP-Builder, Navigationsprüfung
- `src/main/index.ts`: CSP-Header, Popups → deny (https-Links im Standardbrowser), `will-navigate`-Schutz, alle Berechtigungsanfragen (Kamera, Mikrofon …) verweigert, Mindestgröße 1024×640
- Produktions-CSP zusätzlich als `<meta>`-Tag im Build (der Header greift bei `file://` nicht)
- `src/shared/ipc-contract.ts`: IPC-Allowlist mit zod-Schemas, erster Kanal `app:getInfo`, Prüfung des Absender-Frames
- `src/preload`: nur `window.nexora.getAppInfo()` freigegeben
- Design-Tokens „Crimson“ als Tailwind-Theme, `prefers-reduced-motion`

**Teststatus**
- `pnpm test`: 6/6 Unit-Tests grün (Sicherheitsoptionen, CSP, Navigation, IPC-Allowlist)
- `pnpm build`: Typecheck + Build grün
- Laufzeit-Smoketest (Linux, Xvfb, Playwright `_electron`, Skript noch nicht im Repo): Fenster öffnet, IPC liefert Version; im Renderer sind `require`/`process` undefined; Inline-Script und String-`eval` werden von der CSP blockiert; `window.open` blockiert
- **Nicht getestet:** Start unter Windows, `pnpm dev` (Dev-Server-Modus)

**Offen**
- Renderer-Bundle 566 kB, prüfen (Minify/Splitting)
- Playwright-E2E-Test ins Repo übernehmen (To-do 14)
