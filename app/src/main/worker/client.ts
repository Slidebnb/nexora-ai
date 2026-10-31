import type { NexoraEvent } from '../../shared/events'
import { NexoraEventSchema } from '../../shared/events'

/** HTTP-Zugriff auf den Worker. Läuft nur im Main-Prozess; das Token verlässt ihn nie. */
export class WorkerClient {
  constructor(
    private readonly port: () => number | null,
    private readonly token: string
  ) {}

  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const port = this.port()
    if (port === null) throw new Error('Worker ist nicht verbunden')
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { detail?: unknown }
        if (typeof j.detail === 'string') detail = j.detail
      } catch {
        /* keine JSON-Antwort */
      }
      throw new Error(detail)
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  }
}

/**
 * Event-Stream über WebSocket mit Authentifizierung per erster Nachricht und Replay-Cursor.
 * Bei Verbindungsabbruch wird ab der letzten seq fortgesetzt – ohne Lücke, ohne Duplikate.
 */
export class EventStream {
  private ws: WebSocket | null = null
  private closed = false
  lastSeq = 0

  constructor(
    private readonly port: () => number | null,
    private readonly token: string,
    private readonly onEvent: (e: NexoraEvent) => void,
    private readonly onState: (connected: boolean, message?: string) => void
  ) {}

  connect(): void {
    const port = this.port()
    if (port === null || this.closed) return
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/events`)
    this.ws = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.token, after: this.lastSeq }))
    ws.onmessage = (msg) => {
      let data: unknown
      try {
        data = JSON.parse(String(msg.data))
      } catch {
        return
      }
      if (data && typeof data === 'object' && (data as { type?: unknown }).type === 'replay_done') {
        this.onState(true)
        return
      }
      const parsed = NexoraEventSchema.safeParse(data)
      if (!parsed.success) {
        console.error('[nexora] Worker-Event verletzt den Vertrag und wird verworfen:', parsed.error.issues[0])
        return
      }
      if (parsed.data.seq <= this.lastSeq) return
      this.lastSeq = parsed.data.seq
      this.onEvent(parsed.data)
    }
    ws.onclose = (ev) => {
      this.ws = null
      if (this.closed) return
      this.onState(false, ev.code === 4401 ? 'Worker-Anmeldung abgelehnt' : 'Verbindung zum Worker unterbrochen')
      if (ev.code !== 4401) setTimeout(() => this.connect(), 1000)
    }
  }

  close(): void {
    this.closed = true
    this.ws?.close()
  }
}
