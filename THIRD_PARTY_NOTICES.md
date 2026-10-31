# THIRD_PARTY_NOTICES

Stand: 2026-10-31 (Phase 0)

## Portierter Quellcode aus den Masterplan-Repositories

Die Übernahme erfolgte auf ausdrückliche Anweisung des Projektinhabers. Er hat nach eigener Angabe die Zustimmung der Autoren eingeholt. Die Projekte evil-ai-viz und cyberpunk-dashboard nennen in ihrer README die MIT-Lizenz, enthalten aber keine LICENSE-Datei. **Empfehlung:** Die Zustimmung schriftlich archivieren (E-Mail oder GitHub-Issue).

| NEXORA-Datei | Quelle @ Commit, Originalpfad | Lizenz / Copyright | Änderungen |
|---|---|---|---|
| `app/src/renderer/src/components/hud/OrbitCore.tsx` | Davood121/jenman @ 5a19ab9, `artifacts/jarvis/src/components/AiCore.tsx` | MIT, (c) 2025 Shaik Davood | Branding und Fantasiewerte entfernt; Anzeigen aus echten Events; Agenten-Satelliten; Crimson; Animations-Loop |
| `app/src/renderer/src/components/hud/MatrixRain.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/MatrixRain.tsx` | MIT (laut README) | Crimson; Elterngröße; Intensität an Aktivität gekoppelt |
| `app/src/renderer/src/components/hud/ScanLines.tsx` (+ `.scan-move` in `styles.css`) | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/ScanLines.tsx` | MIT (laut README) | Crimson; Keyframes in CSS (CSP) |
| `app/src/renderer/src/components/hud/DataFlowLines.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/DataFlowLines.tsx` | MIT (laut README) | Impulse je echtem Event, Farbe nach Eventart, Flug zur Mitte |
| `app/src/renderer/src/components/hud/HexStream.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/HexStream.tsx` | MIT (laut README) | echte Events statt Zufallsbytes; Text „Exfiltration“ entfernt |
| `app/src/renderer/src/components/layout/Sidebar.tsx` | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7, `app/page.tsx` | MIT (laut README) | React/Vite statt Next.js; echter Worker-Status; Freigabe-Badge |
| `ActivityFeed.tsx` (Eintragsstil), `TopBar.tsx` (Breadcrumb) | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7, `app/command-center/page.tsx`, `app/page.tsx` | MIT (laut README) | echte Events statt Mockdaten |

Bewusst **nicht** übernommen, weil der Masterplan (§2 A) es ausschließt: Tracking, Fingerprinting, Fake-Terminal, Convex sowie `CodeFragments` (lädt externe CVE-Feeds).

### MIT-Lizenztext (gilt für die oben genannten Übernahmen)

```
MIT License

Copyright (c) 2025 Shaik Davood (jenman)
Copyright (c) the authors of ChatDSJ/evil-ai-viz
Copyright (c) the authors of raheem-dotgit/cyberpunk-dashboard

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

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
