import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import type { ApprovalDecision, NexoraEvent } from '../../shared/events'
import type { WorkerStatus } from '../../shared/ipc-contract'
import type { SecretStore } from '../secrets'
import { EventStream, WorkerClient } from './client'
import { WorkerSupervisor, type WorkerLaunch } from './supervisor'

const MAX_HISTORY = 5000

/** Verbindet Supervisor, HTTP-Client und Event-Stream und verteilt Events an die Fenster. */
export class WorkerHub {
  private readonly supervisor: WorkerSupervisor
  private readonly client: WorkerClient
  private stream: EventStream | null = null
  private readonly artifacts = new Map<string, string>()
  readonly history: NexoraEvent[] = []
  status: WorkerStatus = { state: 'disconnected' }

  constructor(
    launch: () => WorkerLaunch | null,
    private readonly secrets: SecretStore,
    private readonly broadcast: (channel: 'worker:event' | 'worker:status', payload: unknown) => void
  ) {
    this.supervisor = new WorkerSupervisor(launch)
    this.client = new WorkerClient(() => this.supervisor.port, this.supervisor.token)
    this.supervisor.on('status', (s: WorkerStatus) => this.setStatus(s))
    this.supervisor.on('ready', () => this.onReady())
  }

  start(): void {
    this.supervisor.start()
  }

  async stop(): Promise<void> {
    this.stream?.close()
    this.stream = null
    await this.supervisor.stop()
  }

  private setStatus(s: WorkerStatus): void {
    this.status = s
    this.broadcast('worker:status', s)
  }

  private onReady(): void {
    this.stream?.close()
    const lastSeq = this.history.at(-1)?.seq ?? 0
    this.stream = new EventStream(
      () => this.supervisor.port,
      this.supervisor.token,
      (e) => this.onEvent(e),
      (connected, message) => {
        if (connected) {
          this.supervisor.markConnected()
          void this.pushSecrets()
        } else this.setStatus({ state: 'starting', message })
      }
    )
    this.stream.lastSeq = lastSeq
    this.stream.connect()
  }

  private onEvent(e: NexoraEvent): void {
    if (e.type === 'artifact_created') {
      const id = e.payload['artifactId']
      const uri = e.payload['uri']
      if (typeof id === 'string' && typeof uri === 'string' && uri.startsWith('file:')) {
        try {
          this.artifacts.set(id, fileURLToPath(uri))
        } catch {
          /* ungültige URI ignorieren */
        }
      }
    }
    this.history.push(e)
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY)
    this.broadcast('worker:event', e)
  }

  artifactPath(artifactId: string): string | undefined {
    return this.artifacts.get(artifactId)
  }

  /** Übergibt entschlüsselte Schlüssel nur an den lokalen Worker (nur im Speicher, nie auf Platte). */
  async pushSecrets(): Promise<void> {
    if (this.supervisor.port === null) return
    try {
      await this.client.request('PUT', '/api/session/secrets', {
        anthropic: this.secrets.get('anthropic') ?? null,
        openai: this.secrets.get('openai') ?? null,
        connectors: this.secrets.connectorTokens()
      })
    } catch {
      /* Worker noch nicht bereit – wird beim nächsten Verbinden erneut gesendet */
    }
  }

  createTask(workflow: string, input: Record<string, unknown>, capabilities: string[]): Promise<{ taskId: string; runId: string }> {
    return this.client.request('POST', '/api/tasks', { workflow, input, capabilities })
  }

  /**
   * Startet eine Aufgabe und wartet, bis sie fertig ist (für den Agent-Chat). Freigaben erscheinen
   * normal in der Oberfläche; hier wird nur gewartet, bis der Nutzer entschieden hat.
   * Liefert Erfolg/Zusammenfassung und den Textinhalt erzeugter Dateien (für die Antwort der KI).
   */
  async runToCompletion(
    workflow: string,
    input: Record<string, unknown>,
    capabilities: string[],
    timeoutMs = 120_000
  ): Promise<{ ok: boolean; summary: string; text: string }> {
    const { runId } = await this.createTask(workflow, input, capabilities)
    const terminal = new Set(['run_succeeded', 'run_failed', 'run_cancelled'])
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const events = await this.client.request<NexoraEvent[]>('GET', `/api/runs/${encodeURIComponent(runId)}/events`)
      const end = events.find((e) => terminal.has(e.type))
      if (end) {
        let text = ''
        for (const a of events.filter((e) => e.type === 'artifact_created')) {
          const uri = (a.payload as { uri?: unknown }).uri
          if (typeof uri === 'string' && uri.startsWith('file:')) {
            try {
              text += '\n' + readFileSync(fileURLToPath(uri), 'utf8')
            } catch {
              /* Datei evtl. nicht lesbar – ignorieren */
            }
          }
        }
        const p = end.payload as { summary?: string; verification?: string; error?: string; reason?: string }
        return {
          ok: end.type === 'run_succeeded',
          summary: p.summary || p.verification || p.error || p.reason || '',
          text: text.trim().slice(0, 6000)
        }
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new Error('Zeitüberschreitung bei der Aufgabe')
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.client.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel`)
  }

  systemStatus(): Promise<unknown> {
    return this.client.request('GET', '/api/system')
  }

  testAi(provider: string): Promise<unknown> {
    return this.client.request('POST', '/api/ai/test', { provider })
  }

  listConnectors(): Promise<unknown> {
    return this.client.request('GET', '/api/connectors')
  }

  addConnector(name: string, url: string, token: string | null): Promise<{ id: string }> {
    return this.client.request('POST', '/api/connectors', { name, url, token })
  }

  async removeConnector(id: string): Promise<void> {
    await this.client.request('DELETE', `/api/connectors/${encodeURIComponent(id)}`)
  }

  testConnector(id: string): Promise<unknown> {
    return this.client.request('POST', `/api/connectors/${encodeURIComponent(id)}/test`)
  }

  connectorTools(id: string): Promise<unknown> {
    return this.client.request('GET', `/api/connectors/${encodeURIComponent(id)}/tools`)
  }

  desktopWindows(): Promise<unknown> {
    return this.client.request('GET', '/api/desktop/windows')
  }

  desktopElements(window: string): Promise<unknown> {
    return this.client.request('GET', `/api/desktop/elements?window=${encodeURIComponent(window)}`)
  }

  listTemplates(): Promise<unknown[]> {
    return this.client.request('GET', '/api/templates')
  }

  createTemplate(runId: string, name: string): Promise<unknown> {
    return this.client.request('POST', '/api/templates', { runId, name })
  }

  runTemplate(templateId: string, overrides: Record<string, unknown>): Promise<{ taskId: string; runId: string }> {
    return this.client.request('POST', `/api/templates/${encodeURIComponent(templateId)}/run`, { overrides })
  }

  scheduleTemplate(templateId: string, schedule: unknown): Promise<unknown> {
    return this.client.request('PUT', `/api/templates/${encodeURIComponent(templateId)}/schedule`, { schedule })
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.client.request('DELETE', `/api/templates/${encodeURIComponent(templateId)}`)
  }

  async pauseTask(taskId: string): Promise<void> {
    await this.client.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/pause`)
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.client.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/resume`)
  }

  async respondApproval(approvalId: string, decision: ApprovalDecision): Promise<void> {
    await this.client.request('POST', `/api/approvals/${encodeURIComponent(approvalId)}/respond`, { decision })
  }
}
