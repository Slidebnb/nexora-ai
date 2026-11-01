# THIRD_PARTY_NOTICES

Stand: 2026-10-31 (Phase 0)

## Portierter Quellcode aus den Masterplan-Repositories

Die Übernahme erfolgte auf ausdrückliche Anweisung des Projektinhabers. Er hat nach eigener Angabe die Zustimmung der Autoren eingeholt. Die Projekte evil-ai-viz und cyberpunk-dashboard nennen in ihrer README die MIT-Lizenz, enthalten aber keine LICENSE-Datei. **Empfehlung:** Die Zustimmung schriftlich archivieren (E-Mail oder GitHub-Issue).

| NEXORA-Datei | Quelle @ Commit, Originalpfad | Lizenz / Copyright | Änderungen |
|---|---|---|---|
| `app/src/renderer/src/components/hud/OrbitCore.tsx` | Davood121/jenman @ 5a19ab9, `artifacts/jarvis/src/components/AiCore.tsx` | MIT, (c) 2025 Shaik Davood | Branding und Fantasiewerte entfernt; Anzeigen aus echten Events; Agenten-Satelliten; Crimson; Animations-Loop |
| `app/src/renderer/src/components/settings/SystemStatusPanel.tsx` (`BarGauge`, `DataRow`, Bogen-Anzeiger) | Davood121/jenman @ 5a19ab9, `artifacts/jarvis/src/components/SystemPanel.tsx` | MIT, (c) 2025 Shaik Davood | ohne framer-motion; NEXORA-Farbvariablen; nur gemessene Werte (Festplatte, Datenbank, Dienste) statt fester Fantasiewerte wie „HULL 98“ |
| `app/src/renderer/src/components/home/CommandBar.tsx` | Davood121/jenman @ 5a19ab9, `artifacts/jarvis/src/components/CommandInterface.tsx` | MIT, (c) 2025 Shaik Davood | ohne JARVIS-Branding und vorgefertigte Antworten; Antworten aus lokaler Erkennung (`lib/intent.ts`), öffnet nur den Assistenten. Der Mikrofon-Knopf ist eine NEXORA-Eigenentwicklung (`lib/useVoice.ts`, Web-Speech-API), nicht aus jenman (dort nur ein Symbol ohne Funktion). |
| `app/src/renderer/src/components/hud/MatrixRain.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/MatrixRain.tsx` | MIT (laut README) | Crimson; Elterngröße; Intensität an Aktivität gekoppelt |
| `app/src/renderer/src/components/hud/ScanLines.tsx` (+ `.scan-move` in `styles.css`) | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/ScanLines.tsx` | MIT (laut README) | Crimson; Keyframes in CSS (CSP) |
| `app/src/renderer/src/components/hud/DataFlowLines.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/DataFlowLines.tsx` | MIT (laut README) | Impulse je echtem Event, Farbe nach Eventart, Flug zur Mitte |
| `app/src/renderer/src/components/hud/RadarSweep.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/RadarSweep.tsx` | MIT (laut README) | Theme-Farben; gemeinsamer Animations-Loop; irreführende Beschriftung „THREAT RADAR/TARGETS“ entfernt; Punkte sind abstrakte Deko |
| `app/src/renderer/src/components/hud/WireframeGlobe.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/WireframeGlobe.tsx` | MIT (laut README) | Theme-Farben; „GLOBAL NETWORK/NODES“ entfernt; keine echten Orte/Verbindungen; nichts wird gesendet |
| `app/src/renderer/src/components/hud/NeuralNetwork.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/NeuralNetwork.tsx` | MIT (laut README) | Theme-Farben; „NEURAL ARCHITECTURE v7.3 / SELF-IMPROVING“ entfernt; bildet kein echtes Modell ab |
| `app/src/renderer/src/components/hud/GlitchOverlay.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/GlitchOverlay.tsx` | MIT (laut README) | Theme-Farben; bei reduced motion aus |
| `app/src/renderer/src/components/hud/HexStream.tsx` | ChatDSJ/evil-ai-viz @ cf22a87, `src/components/viz/HexStream.tsx` | MIT (laut README) | echte Events statt Zufallsbytes; Text „Exfiltration“ entfernt |
| `app/src/renderer/src/components/layout/Sidebar.tsx` | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7, `app/page.tsx` | MIT (laut README) | React/Vite statt Next.js; echter Worker-Status; Freigabe-Badge |
| `components/common/Cyber.tsx`, `screens/Agents.tsx`, `screens/Activity.tsx` (Kennzahlen), `screens/Files.tsx`, `components/feed/RunDetail.tsx` | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7, `app/agent-network/page.tsx`, `app/operations/page.tsx`, `app/intelligence/page.tsx` | MIT (laut README) | Kennzahlkarten, Suche, Liste und Detail-Dialog mit echten Werten statt Mockzahlen; deutsche Texte; NEXORA-Farben |
| `ActivityFeed.tsx` (Eintragsstil), `TopBar.tsx` (Breadcrumb) | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7, `app/command-center/page.tsx`, `app/page.tsx` | MIT (laut README) | echte Events statt Mockdaten |
| `app/src/renderer/src/components/kpi/CommandCenter.tsx` | raheem-dotgit/cyberpunk-dashboard @ 8ec7ec7 (master), `app/command-center/page.tsx` | MIT (laut README, keine LICENSE-Datei) | 12-Spalten-Kartenanordnung (Vorgänge/Aktivität/Status-Kugel/Kostenverlauf/Ergebnisse) nach React 19 + Tailwind 4 portiert; Next.js/shadcn/neutral+orange entfernt, NEXORA-Theme-Tokens; **alle erfundenen Spionage-Dummy-Daten (Agenten „VENGEFUL SPIRIT", Missionen, Chat-Logs, feste Zahlen) durch echte Zustandsdaten ersetzt** (selectKpis/selectAgents/selectCostSeries/Ereignisse); Kostenlinie aus echter Reihe |

Zusätzlich aus ClawBridge (Apache-2.0, Copyright (c) 2026 RomaTek AI; Änderungen nach §4b in den Dateiköpfen vermerkt):

| NEXORA-Datei | Quelle | Änderungen |
|---|---|---|
| `worker/nexora_worker/safety.py` | `clawbridge/policy/safety.py` @ a8a06c2 | ohne Permissive-Modus, Host-Suffix-Prüfung, rekursive Schwärzung, deutsche Muster |
| `worker/nexora_worker/engines.py` | `clawbridge/engines/browser_use_engine.py`, `engines/base.py` @ a8a06c2 | enge Aufgabe je Quelle, ohne `disable_security`, eigenes Profil, Telemetrie aus |
| `worker/nexora_worker/runner.py` (Konzept) | `clawbridge/orchestrator/manager.py` @ a8a06c2 | eigene Implementierung ohne Remote-Bridge |
| `worker/nexora_worker/desktop.py` | `clawbridge/perception/accessibility.py`, `clawbridge/platform/_windows.py` @ a8a06c2 | Fenster per exaktem Titel statt Vordergrundfenster; Passwortfelder gesperrt; keine Selbstbedienung; Bedienschwelle 0,85 (kein Positionsraten); nur UIA-Muster statt Maus/Tasten |
| `worker/nexora_worker/computer.py`, `worker/nexora_worker/workflows/desktop_ai.py` | `clawbridge/engines/computer_use_engine.py`, `clawbridge/platform/_windows.py` (gesperrte Tastenkombinationen) @ a8a06c2 | aktuelles Werkzeug `computer_toolset_20260801`; nur Fotos eines freigegebenen Fensters; jede bedienende Aktion einzeln freigegeben; Klicks außerhalb des Fensters abgelehnt; Abschlussbild statt ungeprüfter Erfolgsmeldung |
| `worker/nexora_worker/workflows/desktop_routine.py` (Konzept Recorder/Replay) | `clawbridge/recorder/capture.py`, `recorder/processor.py` @ a8a06c2 | Aufzeichnung per Auswahl statt globalem pynput-Hook (LGPL, zeichnet jede Taste auf); Freigabe vor Wiedergabe; Texteingaben werden zurückgelesen |

Der vollständige Apache-2.0-Lizenztext liegt unter `licenses/Apache-2.0.txt`.

Bewusst **nicht** übernommen, weil der Masterplan (§2 A) es ausschließt bzw. es Überwachung oder Täuschung wäre: Tracking/Fingerprinting (u. a. `DeviceFingerprint`, `KeyloggerOverlay`, `ClipboardInterceptor`, `WebRTCProbe`, `MouseHeatmap`, `TypingBiometric`, `UserLocationMap`), `FakeTerminal`/`FakeOSDialog`/`FakeNotifications`/`MetricsDashboard` (erfundene Inhalte), die „compromised“-`WorldMap`, `BootSequence` (gibt erfundene Dienste/Scans als echt aus), Convex und `CodeFragments` (lädt externe CVE-Feeds).

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


## Python-Abhängigkeiten des Workers (`worker/`)

Erfasst am 2026-10-31 aus den installierten Paketmetadaten (`importlib.metadata`), Versionen laut `worker/uv.lock`. Versionen nach den Sicherheitsupdates (pypdf, pillow, anyio, mcp) nachgetragen.

### Basis (immer installiert, 19 Pakete)

| Paket | Version | Lizenz |
|---|---|---|
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.14.2 | MIT |
| certifi | 2026.10.23 | Mozilla Public License 2.0 (MPL 2.0) |
| click | 8.3.3 | BSD-3-Clause |
| fastapi | 0.162.0 | MIT |
| h11 | 0.16.0 | MIT License |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpx | 0.28.1 | BSD License |
| idna | 3.20 | BSD-3-Clause |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| pydantic | 2.13.5 | MIT |
| pydantic_core | 2.46.5 | MIT |
| pypdf | 6.21.4 | BSD-3-Clause |
| starlette | 1.10.0 | BSD-3-Clause |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.15.0 | PSF-2.0 |
| uvicorn | 0.54.0 | BSD-3-Clause |
| websockets | 15.0.1 | BSD License |

### Ergänzt für die optionale Texterkennung (2026-10-31)

| Paket | Version | Lizenz |
|---|---|---|
| pypdfium2 | 5.14.0 | BSD-3-Clause, Apache-2.0 (enthält PDFium, BSD-3-Clause) |
| pillow | 13.0.0 | MIT-CMU |

**Tesseract OCR** (Apache-2.0) wird **nicht** mitgeliefert. Wer Texterkennung nutzen will, installiert es selbst (Windows: Installer von UB Mannheim; Linux: Paket `tesseract-ocr`).

### Ergänzt für die Desktop-Bedienung (nur Windows, 2026-10-31)

Lizenzen laut PyPI-Metadaten der gesperrten Versionen.

| Paket | Version | Lizenz |
|---|---|---|
| pywinauto | 0.6.9 | BSD-3-Clause |
| comtypes | 1.4.17 | MIT |
| pywin32 | 312 | PSF |
| six | 1.17.0 | MIT |

### Optional: KI-Browser (`uv sync --extra browser`, zusätzlich 87 Pakete)

| Paket | Version | Lizenz |
|---|---|---|
| aiofiles | 25.1.0 | Apache Software License |
| aiohappyeyeballs | 2.7.1 | Python Software Foundation License |
| aiohttp | 3.14.5 | Apache-2.0 AND MIT |
| aiosignal | 1.4.0 | Apache Software License |
| anthropic | 1.17.0 | MIT License |
| attrs | 26.1.0 | MIT |
| backoff | 2.2.1 | MIT License |
| beautifulsoup4 | 4.15.0 | MIT License |
| browser-harness | 0.1.13 | MIT |
| browser-use | 0.13.14 | MIT License |
| browser-use-sdk | 3.12.1 | MIT |
| bubus | 1.5.6 | MIT License |
| cdp-use | 1.4.5 | MIT License |
| cffi | 2.1.1 | MIT-0 |
| charset-normalizer | 3.5.2 | MIT |
| cloudpickle | 3.1.2 | BSD License |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| distro | 1.9.0 | Apache Software License |
| docstring_parser | 0.18.0 | MIT License |
| fetch-use | 0.4.0 | MIT License |
| frozenlist | 1.8.0 | Apache-2.0 |
| google-api-core | 2.29.0 | Apache Software License |
| google-api-python-client | 2.188.0 | Apache Software License |
| google-auth | 2.48.0 | Apache Software License |
| google-auth-httplib2 | 0.4.4 | Apache Software License |
| google-auth-oauthlib | 1.2.4 | Apache Software License |
| google-genai | 1.65.0 | Apache-2.0 |
| googleapis-common-protos | 1.76.0 | Apache-2.0 |
| groq | 1.0.0 | Apache Software License |
| httpcore2 | 2.16.0 | BSD-3-Clause |
| httplib2 | 0.32.1 | MIT License |
| httpx2 | 2.16.0 | BSD-3-Clause |
| inquirerpy | 0.3.4 | MIT License |
| jiter | 0.18.0 | MIT |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| lxml | 6.1.3 | BSD-3-Clause |
| markdown-it-py | 4.2.0 | MIT License |
| markdownify | 1.2.2 | MIT License |
| mcp | 2.3.0 | MIT License |
| mcp-types | 2.3.0 | MIT License |
| mdurl | 0.1.2 | MIT License |
| multidict | 7.2.1 | Apache-2.0 |
| oauthlib | 4.0.0 | BSD-3-Clause |
| ollama | 0.6.1 | MIT |
| openai | 3.42.0 | Apache-2.0 |
| pfzy | 0.3.4 | MIT License |
| pillow | 13.0.0 | MIT-CMU |
| portalocker | 4.4.2 | BSD-3-Clause |
| posthog | 7.7.0 | MIT License |
| prompt_toolkit | 3.0.53 | BSD License |
| propcache | 0.5.4 | Apache-2.0 |
| proto-plus | 1.29.0 | Apache Software License |
| protobuf | 6.33.6 | 3-Clause BSD License |
| psutil | 7.2.2 | BSD-3-Clause |
| pyasn1 | 0.6.5 | BSD-2-Clause |
| pyasn1_modules | 0.4.2 | BSD License |
| pycparser | 3.12 | BSD-3-Clause |
| pydantic-settings | 2.15.0 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| PyJWT | 2.15.1 | MIT |
| pyotp | 2.9.0 | MIT License |
| pyparsing | 3.3.3 | MIT |
| python-dateutil | 3.0.0 | BSD License; Apache Software License |
| python-docx | 1.2.0 | MIT License |
| python-dotenv | 1.2.2 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| referencing | 0.37.0 | MIT |
| reportlab | 4.4.9 | BSD License |
| requests | 2.33.0 | Apache Software License |
| requests-oauthlib | 2.0.0 | BSD License |
| rich | 14.3.3 | MIT License |
| rpds-py | 2026.9.1 | MIT |
| rsa | 4.9.1 | Apache Software License |
| screeninfo | 0.8.1 | MIT License |
| six | 1.17.0 | MIT License |
| sniffio | 1.3.1 | MIT License; Apache Software License |
| soupsieve | 3.0.4 | MIT |
| sse-starlette | 3.6.0 | BSD-3-Clause |
| tenacity | 9.1.4 | Apache Software License |
| truststore | 0.10.5 | MIT |
| tzdata | 2026.6 | Apache-2.0 |
| uritemplate | 4.2.0 | BSD 3-Clause OR Apache-2.0 |
| urllib3 | 2.8.0 | MIT |
| uuid7 | 0.1.0 | MIT License |
| wcwidth | 0.9.4 | MIT License |
| yarl | 1.25.1 | Apache-2.0 |

Hinweise:
- **certifi (MPL-2.0):** Copyleft auf Dateiebene. Unverändert weitergegeben ist das zulässig; Änderungen an certifi-Dateien müssten offengelegt werden (nicht geplant).
- **browser-use (MIT)** bringt **posthog** mit (anonyme Telemetrie). NEXORA schaltet sie fest ab (`ANONYMIZED_TELEMETRY=false`).
- Einige Pakete nennen ihre Lizenz nur als Klassifikator oder Freitext. Vor dem Verkauf ist eine Prüfung mit `pip-licenses --with-license-file` beim Installer-Build vorgesehen (Phase 4).
