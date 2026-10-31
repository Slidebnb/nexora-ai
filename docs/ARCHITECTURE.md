# ARCHITECTURE — NEXORA AI

Stand 2026-10-31: Das Zielbild ist bis einschließlich Phase 3 umgesetzt. Abweichungen und Ist-Stand stehen am Ende dieses Dokuments.

## Verbindlicher Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Desktop-Shell | Electron (aktuelle stabile Major-Version, beim Scaffolding gepinnt), electron-vite, electron-builder (NSIS) | Windows-first, ein Codepfad für UI |
| Renderer | React 19, TypeScript strict, Vite, Tailwind CSS 4, `motion` (ehem. framer-motion), Canvas 2D, Recharts, lucide-react, Zustand | entspricht dem Masterplan, kein Next.js |
| Tests UI | Vitest + Testing Library, Playwright (`_electron`) für E2E | |
| Worker | Python 3.12, FastAPI, Uvicorn, Pydantic v2, SQLite + Alembic, structlog | Konzepte aus ClawBridge, eigener schlanker Code |
| Automation | Playwright/browser-use (Opt-in, eigenes Profil), pywinauto (UIA) | Phase 2+ |
| Modelle | Provider-Adapter Anthropic, OpenAI, optional Ollama; BYOK | |
| Secrets | Electron `safeStorage` (DPAPI unter Windows) im Main-Prozess; Worker erhält Keys pro Run über IPC, nie über die Umgebung des Renderers | |
| Packaging | PyInstaller-Sidecar + electron-builder, Code-Signing erst Phase 4 | |

## Diagramm

```
┌──────────────────────── Electron App ────────────────────────────┐
│  Renderer (sandbox, contextIsolation, nodeIntegration:false, CSP)│
│   React UI: Dashboard · Agenten · Automationen · Aktivitäten ·   │
│   Dateien · Einstellungen · ApprovalCenter · DemoMode-Banner      │
│        │  window.nexora.* (typisierte, allowlisted API)           │
│  Preload (contextBridge, keine Node-APIs exponiert)               │
│        │  ipcRenderer.invoke(channel ∈ ALLOWLIST)                 │
│  Main Process                                                     │
│   ├─ IPC-Router + zod-Validierung jedes Payloads                  │
│   ├─ SecretStore (safeStorage/DPAPI)                              │
│   ├─ WorkerSupervisor (spawn, Healthcheck, Restart, Shutdown)     │
│   └─ EventBridge (WS-Client → Renderer, Replay-Cursor)            │
└────────┼──────────────────────────────────────────────────────────┘
         │ HTTP + WS nur 127.0.0.1:<zufälliger Port>
         │ Header: Authorization: Bearer <Einmal-Token pro App-Start>
┌────────▼──────────── Python Worker (Sidecar) ─────────────────────┐
│ FastAPI: /api/tasks · /api/runs · /api/approvals · WS /api/events │
│ Orchestrator → Planner → Executor ─┬─ FileOps (Allowlist-Ordner)  │
│                                    ├─ PDF-Extraktion (lokal)      │
│                                    ├─ Browser (browser-use, Opt-in)│
│                                    └─ Desktop (pywinauto, Opt-in) │
│ PolicyEngine: jede Write/Send/Delete-Aktion → approval_requested  │
│ Redactor → AuditLog (JSONL) · SQLite (tasks, runs, events, ...)   │
│ ModelAdapters (Anthropic / OpenAI / Ollama), Kostenzähler         │
└───────────────────────────────────────────────────────────────────┘
```

## Event-Vertrag (gemeinsam für Worker, Demo-Generator und UI)

```ts
type RunStatus = 'queued'|'running'|'waiting_approval'|'succeeded'|'failed'|'cancelled';
type EventType = 'run_created'|'plan_ready'|'step_started'|'step_succeeded'|'step_failed'
  |'approval_requested'|'approval_resolved'|'artifact_created'
  |'run_succeeded'|'run_failed'|'run_cancelled'|'cost_updated'
  |'run_paused'|'run_resumed';   // Erweiterung: Pause wirkt am nächsten sicheren Haltepunkt
interface NexoraEvent {
  id: string; seq: number;            // seq = Replay-Cursor
  runId: string; taskId: string; timestamp: string;
  type: EventType; status: RunStatus;
  agentId?: string; stepId?: string;
  source: 'live'|'demo';              // Demo-Events sind nie 'live'
  payload: Record<string, unknown>;
}
```

Regeln: Den Fortschritt berechnet ausschließlich ein Reducer über diese Events. `stepsTotal` ist nur dann gesetzt, wenn `plan_ready` die Zahl liefert, sonst ist der Fortschritt indeterminiert. `succeeded` wird nur nach `run_succeeded` angezeigt, und der Worker sendet `run_succeeded` erst nach einer Ergebnisverifikation.

## Sicherheitsgrundsätze

1. Der Renderer erhält niemals Keys und hat keinen Node-Zugriff. Er bekommt nur das Event-Abbild.
2. Der Worker bindet nur an `127.0.0.1`, prüft das Bearer-Token und den Origin, CORS ist leer.
3. Kein `eval`, keine freie Shell. Dateioperationen sind auf vom Nutzer gewählte Wurzelordner begrenzt (realpath-Prüfung).
4. LLM- und Webtext gelten als Daten und werden nie als Instruktion für die Policy verwendet. Aktionen stammen aus einem festen Tool-Schema.
5. Jede irreversible Aktion erzeugt `approval_requested` mit Ziel, Daten und Auswirkung. Fehlt eine Antwort, wird nichts ausgeführt.


## Ist-Stand (Phase 3)

| Baustein | Datei(en) |
|---|---|
| Fensterhärtung, CSP, Navigation | `app/src/main/security.ts`, `app/src/main/index.ts` |
| IPC-Allowlist mit zod (24 Kanäle) | `app/src/shared/ipc-contract.ts`, `app/src/main/ipc.ts`, `app/src/preload/` |
| Worker-Start/-Überwachung, Event-Stream | `app/src/main/worker/{supervisor,client,hub}.ts` |
| Event-Vertrag (TS ↔ Python) | `app/src/shared/events.ts` ↔ `worker/nexora_worker/events.py` |
| Zustand/Reducer, Demo-Player | `app/src/renderer/src/state/`, `app/src/renderer/src/demo/` |
| Worker-API (REST/WS) | `worker/nexora_worker/api.py` |
| Lebenszyklus, Berechtigungen, Freigaben | `worker/nexora_worker/{runner,approvals}.py` |
| Sicherheit/Schwärzung | `worker/nexora_worker/safety.py` |
| Workflows | `worker/nexora_worker/workflows/{organizer,web_research,pdf_analysis,drafts}.py`, `worker/nexora_worker/templates.py` |
| Web/KI | `worker/nexora_worker/{web,engines,llm}.py` |

Abweichungen vom ursprünglichen Plan:
- **Migrationen:** eigene, versionierte SQL-Migrationen statt Alembic (weniger Abhängigkeiten; per Test von v1 auf v2 geprüft).
- **Logging:** JSON-Zeilen mit Schwärzung über `logging` statt structlog.
- **API-Schlüssel:** Electron `safeStorage` (DPAPI) im Main-Prozess; der Worker erhält sie pro Sitzung nur im Speicher (`PUT /api/session/secrets`).
- **Ordner- und Dateiauswahl:** ausschließlich über native Dialoge im Main-Prozess. Der Renderer kennt nur zufällige IDs, nie frei wählbare Pfade.

- **Event-Vertrag erweitert:** `run_paused` und `run_resumed`. Sie ändern den Run-Status nicht. Pausiert wird an sicheren Haltepunkten zwischen Dateien bzw. Quellen und direkt nach einer Freigabe, nie mitten in einer Dateioperation. Ein Abbruch weckt pausierte Läufe auf.
