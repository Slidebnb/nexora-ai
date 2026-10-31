# THIRD_PARTY_NOTICES

Stand: 2026-10-31 (Phase 0)

**Aktuell ist kein Quellcode aus den auditierten Repositories in NEXORA AI enthalten.**
Sobald ein Fragment übernommen wird, kommt hier ein Eintrag mit Quelle, Commit, Pfad, Lizenz, Copyright und Änderungsvermerk hinzu.

Vorgemerkte, lizenzrechtlich übernehmbare Quellen:

| Komponente | Quelle @ Commit | SPDX | Copyright | Status |
|---|---|---|---|---|
| (Referenz) `artifacts/jarvis/src/components/AiCore.tsx` | Davood121/jenman @ 5a19ab9 | MIT | (c) 2025 Shaik Davood | nur Referenz, nicht kopiert |
| (Referenz) `clawbridge/policy/safety.py` | NickRomanek/clawbridge @ a8a06c2 | Apache-2.0 / MIT (widersprüchlich) | (c) 2026 RomaTek AI | nur Konzept, nicht kopiert |

Gesperrt für Codeübernahme (fehlende LICENSE-Datei): ChatDSJ/evil-ai-viz, raheem-dotgit/cyberpunk-dashboard.

## Eigenständig neu geschriebene, inspirierte Komponenten (kein kopierter Code)

| NEXORA-Datei | Gestaltungsidee aus |
|---|---|
| `app/src/renderer/src/components/hud/OrbitCore.tsx` | konzentrische Ringe / Radar-Sweep, vgl. jenman `AiCore.tsx` (MIT) |
| `.scanlines` in `app/src/renderer/src/styles.css` | Scanline-Overlay, vgl. evil-ai-viz `ScanLines.tsx` (nur Idee) |
| Sidebar / KPI-Raster / Agentenliste | Informationsarchitektur, vgl. cyberpunk-dashboard (nur Idee) |

## npm-Laufzeitabhängigkeiten der Desktop-App (`app/`)

Erzeugt mit `pnpm licenses list --prod` am 2026-10-31. Keine Copyleft-Lizenzen (GPL/LGPL/AGPL) enthalten.

| Paket | Version | Lizenz |
|---|---|---|
| @reduxjs/toolkit | 2.13.0 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @standard-schema/utils | 0.3.0 | MIT |
| @types/d3-array | 3.2.2 | MIT |
| @types/d3-color | 3.1.3 | MIT |
| @types/d3-ease | 3.0.2 | MIT |
| @types/d3-interpolate | 3.0.4 | MIT |
| @types/d3-path | 3.1.1 | MIT |
| @types/d3-scale | 4.0.9 | MIT |
| @types/d3-shape | 3.2.0 | MIT |
| @types/d3-time | 3.0.4 | MIT |
| @types/d3-timer | 3.0.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/use-sync-external-store | 0.0.6 | MIT |
| clsx | 2.1.1 | MIT |
| csstype | 3.2.3 | MIT |
| d3-array | 3.2.4 | ISC |
| d3-color | 3.1.0 | ISC |
| d3-ease | 3.0.1 | BSD-3-Clause |
| d3-format | 3.1.2 | ISC |
| d3-interpolate | 3.0.1 | ISC |
| d3-path | 3.1.0 | ISC |
| d3-scale | 4.0.2 | ISC |
| d3-shape | 3.2.0 | ISC |
| d3-time | 3.1.0 | ISC |
| d3-time-format | 4.1.0 | ISC |
| d3-timer | 3.0.1 | ISC |
| decimal.js-light | 2.5.1 | MIT |
| es-toolkit | 1.53.1 | MIT |
| eventemitter3 | 5.0.4 | MIT |
| immer | 11.2.9 | MIT |
| internmap | 2.0.3 | ISC |
| lucide-react | 1.66.0 | ISC |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| react-is | 19.3.1 | MIT |
| react-redux | 9.3.1 | MIT |
| recharts | 3.10.1 | MIT |
| redux | 5.0.1 | MIT |
| redux-thunk | 3.1.0 | MIT |
| reselect | 5.2.0 | MIT |
| scheduler | 0.28.0 | MIT |
| tiny-invariant | 1.3.3 | MIT |
| use-sync-external-store | 1.7.0 | MIT |
| victory-vendor | 37.4.1 | MIT AND ISC AND BSD-3-Clause |
| zod | 4.6.7 | MIT |
| zustand | 5.0.16 | MIT |

Electron (MIT) und Chromium bringen eigene Lizenztexte mit (`LICENSE`, `LICENSES.chromium.html`). Sie müssen im Installer enthalten sein; electron-builder legt sie standardmäßig bei (Phase 4 prüfen).

PyPI-Abhängigkeiten des Workers werden ab Phase 2 mit `pip-licenses` erfasst.
