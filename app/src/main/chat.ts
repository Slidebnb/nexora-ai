import type { Provider } from '../shared/ipc-contract'

/**
 * Agent-Chat im Hauptprozess: Die KI antwortet und kann echte Werkzeuge aufrufen (erste Stufe:
 * Web-Recherche). Der API-Schlüssel bleibt im Hauptprozess. Jede verändernde/sendende Aktion läuft
 * über die normalen Freigaben des Workers; die Recherche ist nur lesend.
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o',
  ollama: 'llama3.1'
}

const SYSTEM =
  'Du bist NEXORA, ein hilfreicher deutschsprachiger Assistent auf dem PC des Nutzers. Antworte klar und ehrlich; ' +
  'erfinde nichts. Du kannst das Internet durchsuchen: Wenn der Nutzer nach aktuellen Informationen fragt oder ' +
  'konkrete Webseiten nennt, rufe das Werkzeug „web_recherche“ mit einer kurzen Frage und den passenden Adressen auf. ' +
  'Fasse danach das Ergebnis verständlich zusammen und nenne die Quellen. Weitere Aktionen auf dem PC folgen – diese ' +
  'werden dem Nutzer stets vorab zur Freigabe gezeigt. Du kannst außerdem: E-Mail-Entwürfe erstellen ' +
  '(Werkzeug „email_entwurf“ – es wird nichts gesendet, nur ein Entwurf gespeichert, und der Nutzer gibt das Speichern frei); ' +
  'E-Mails wirklich senden (Werkzeug „email_senden“), wenn der Nutzer ein E-Mail-Konto hinterlegt hat – jeder Versand wird ' +
  'dem Nutzer vorab einzeln zur Freigabe gezeigt; ' +
  'einen Ordner aufräumen/sortieren (Werkzeug „ordner_aufraeumen“ – der Nutzer wählt den Ordner im Fenster, jede ' +
  'Verschiebung wird freigegeben); PDF-Dateien lesen und zusammenfassen (Werkzeug „pdf_lesen“ – der Nutzer wählt die ' +
  'Dateien im Fenster); eine Frage zu den Dateien in einem Ordner beantworten (Werkzeug „frag_dateien“ – der Nutzer ' +
  'wählt den Ordner, die Dateien werden lokal gelesen, nur relevante Ausschnitte gehen nach Freigabe an die KI); ein echtes Programm auf dem PC bedienen: rufe zuerst „offene_fenster“ auf, um die offenen ' +
  'Programmfenster zu sehen, und dann „computer_steuern“ mit dem genauen Fenstertitel und einem klaren Ziel – NEXORA ' +
  'bedient das Programm Schritt für Schritt und holt vor jeder Aktion deine Freigabe; ' +
  'und die verbundenen Dienste des Nutzers nutzen: rufe „konnektoren_auflisten“ auf, um verfügbare Dienste und ihre ' +
  'Werkzeuge zu sehen, und „konnektor_aufrufen“, um ein Werkzeug auszuführen (jeder Aufruf wird einzeln freigegeben). ' +
  'Wenn das Ziel des Nutzers mehrere Schritte braucht, kombiniere die Werkzeuge selbstständig nacheinander ' +
  '(z. B. erst „web_recherche“, dann aus dem Ergebnis „email_entwurf“; oder erst „ordner_aufraeumen“, dann „pdf_lesen“). ' +
  'Verändernde/sendende Aktionen werden dabei weiterhin einzeln freigegeben.'

export class ChatError extends Error {}

export interface ToolResult {
  ok: boolean
  summary: string
  text: string
}
export type ToolExec = (name: string, args: Record<string, unknown>) => Promise<ToolResult>

const TOOL_WEB = {
  name: 'web_recherche',
  description: 'Durchsucht öffentliche Webseiten zu einer Frage und liefert eine Zusammenfassung mit Quellen. Nur lesend.',
  parameters: {
    type: 'object',
    properties: {
      frage: { type: 'string', description: 'Die Frage, die beantwortet werden soll' },
      urls: { type: 'array', items: { type: 'string' }, description: '1–10 öffentliche http(s)-Adressen' }
    },
    required: ['frage', 'urls']
  }
} as const

const TOOL_EMAIL = {
  name: 'email_entwurf',
  description: 'Erstellt E-Mail-Entwürfe (sendet nichts; speichert .eml-Dateien). Der Nutzer gibt das Speichern frei.',
  parameters: {
    type: 'object',
    properties: {
      betreff: { type: 'string', description: 'Betreff der E-Mail' },
      text: { type: 'string', description: 'Der Nachrichtentext (mind. 10 Zeichen)' },
      empfaenger: { type: 'array', items: { type: 'string' }, description: 'E-Mail-Adressen der Empfänger' }
    },
    required: ['betreff', 'text', 'empfaenger']
  }
} as const

const TOOL_CONN_LIST = {
  name: 'konnektoren_auflisten',
  description: 'Listet die vom Nutzer verbundenen Dienste (Konnektoren) und ihre verfügbaren Werkzeuge auf. Nur lesend.',
  parameters: { type: 'object', properties: {}, required: [] }
} as const

const TOOL_CONN_CALL = {
  name: 'konnektor_aufrufen',
  description: 'Führt ein Werkzeug eines verbundenen Dienstes aus. Jeder Aufruf wird dem Nutzer vorab zur Freigabe gezeigt.',
  parameters: {
    type: 'object',
    properties: {
      connectorId: { type: 'string' },
      werkzeug: { type: 'string', description: 'Name des Werkzeugs (aus konnektoren_auflisten)' },
      argumente: { type: 'object', description: 'Eingabe für das Werkzeug' }
    },
    required: ['connectorId', 'werkzeug']
  }
} as const

const TOOL_EMAIL_SEND = {
  name: 'email_senden',
  description:
    'Sendet eine E-Mail wirklich über das vom Nutzer hinterlegte E-Mail-Konto (SMTP). Der Nutzer gibt jeden Versand einzeln frei. ' +
    'Setzt voraus, dass unter Einstellungen ein E-Mail-Konto eingerichtet ist. Nur verwenden, wenn der Nutzer ausdrücklich senden möchte.',
  parameters: {
    type: 'object',
    properties: {
      betreff: { type: 'string', description: 'Betreff der E-Mail' },
      text: { type: 'string', description: 'Der Nachrichtentext' },
      empfaenger: { type: 'array', items: { type: 'string' }, description: 'E-Mail-Adressen der Empfänger' }
    },
    required: ['betreff', 'text', 'empfaenger']
  }
} as const

const TOOL_ORGANIZE = {
  name: 'ordner_aufraeumen',
  description:
    'Räumt einen Ordner auf, indem Dateien nach Typ in Unterordner sortiert werden. Der Nutzer wählt den Ordner im ' +
    'Fenster selbst aus; jede Verschiebung wird einzeln freigegeben. Keine Argumente nötig.',
  parameters: { type: 'object', properties: {}, required: [] }
} as const

const TOOL_PDF = {
  name: 'pdf_lesen',
  description:
    'Liest eine oder mehrere PDF-Dateien und fasst sie zusammen. Der Nutzer wählt die Dateien im Fenster selbst aus. ' +
    'Nur lesend. Keine Argumente nötig.',
  parameters: { type: 'object', properties: {}, required: [] }
} as const

const TOOL_WINDOWS = {
  name: 'offene_fenster',
  description: 'Listet die aktuell offenen Programmfenster (Titel) auf, damit ein Fenster zum Bedienen gewählt werden kann. Nur lesend.',
  parameters: { type: 'object', properties: {}, required: [] }
} as const

const TOOL_COMPUTER = {
  name: 'computer_steuern',
  description:
    'Bedient ein echtes Programm auf dem PC Schritt für Schritt in Richtung eines Ziels. Vor jeder einzelnen Aktion wird ' +
    'der Nutzer um Freigabe gebeten. Zuerst „offene_fenster“ aufrufen und den genauen Fenstertitel übernehmen.',
  parameters: {
    type: 'object',
    properties: {
      fenster: { type: 'string', description: 'Genauer Titel des Programmfensters (aus offene_fenster)' },
      ziel: { type: 'string', description: 'Was in dem Programm erreicht werden soll (klar und konkret, mind. 5 Zeichen)' }
    },
    required: ['fenster', 'ziel']
  }
} as const

const TOOL_ASK_FILES = {
  name: 'frag_dateien',
  description:
    'Beantwortet eine Frage anhand der Text- und PDF-Dateien in einem Ordner. Der Nutzer wählt den Ordner im Fenster ' +
    'selbst aus. Die Dateien werden lokal gelesen; nur relevante Ausschnitte und die Frage gehen – nach Freigabe – an ' +
    'den KI-Anbieter. Setzt einen hinterlegten KI-Schlüssel voraus.',
  parameters: {
    type: 'object',
    properties: {
      frage: { type: 'string', description: 'Die Frage, die anhand der Dateien beantwortet werden soll (mind. 3 Zeichen)' }
    },
    required: ['frage']
  }
} as const

const ALL_TOOLS = [TOOL_WEB, TOOL_EMAIL, TOOL_EMAIL_SEND, TOOL_ORGANIZE, TOOL_PDF, TOOL_ASK_FILES, TOOL_WINDOWS, TOOL_COMPUTER, TOOL_CONN_LIST, TOOL_CONN_CALL]

const MAX_STEPS = 8

export async function runAgent(opts: {
  provider: Provider
  key: string
  model: string
  messages: ChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
  onTool: (label: string) => void
  exec: ToolExec
  /** Für Ollama (lokal): abweichende, OpenAI-kompatible Adresse. */
  baseUrl?: string
  /** Token-Verbrauch je Anbieter-Antwort (für die Kostenanzeige). */
  onUsage?: (inputTokens: number, outputTokens: number) => void
}): Promise<string> {
  // Ollama spricht denselben OpenAI-kompatiblen Endpunkt wie OpenAI, nur lokal und ohne Schlüssel.
  return opts.provider === 'anthropic' ? runAnthropic(opts) : runOpenai(opts)
}

// ---------- Streaming (Server-Sent Events) ----------
const isEventStream = (res: Response): boolean => (res.headers.get('content-type') ?? '').includes('text/event-stream')

/** Liest die data:-Zeilen einer SSE-Antwort als JSON-Objekte (ein Ereignis je Leerzeilen-Block). */
async function* sseEvents(res: Response): AsyncGenerator<any> {
  if (!res.body) return
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    if (done) buf += '\n\n' // letzten Block ohne abschließende Leerzeile auch verarbeiten
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          yield JSON.parse(data)
        } catch {
          /* unvollständige oder fremde Zeile ignorieren */
        }
      }
    }
    if (done) return
  }
}

/** Anthropic-Stream: Text sofort weiterreichen, Werkzeug-Eingaben aus Stücken zusammensetzen. */
async function readAnthropicStream(res: Response, onDelta: (t: string) => void): Promise<{ content: any[]; stop_reason?: string; usage: { input_tokens: number; output_tokens: number } }> {
  const content: any[] = []
  const partialJson = new Map<number, string>()
  const usage = { input_tokens: 0, output_tokens: 0 }
  let stop_reason: string | undefined
  for await (const ev of sseEvents(res)) {
    if (ev.type === 'message_start') {
      usage.input_tokens = Number(ev.message?.usage?.input_tokens) || 0
      usage.output_tokens = Number(ev.message?.usage?.output_tokens) || 0
    } else if (ev.type === 'content_block_start') {
      content[ev.index] = { ...ev.content_block }
    } else if (ev.type === 'content_block_delta') {
      const block = content[ev.index]
      if (!block) continue
      if (ev.delta?.type === 'text_delta' && ev.delta.text) {
        block.text = (block.text ?? '') + ev.delta.text
        onDelta(ev.delta.text)
      } else if (ev.delta?.type === 'input_json_delta') {
        partialJson.set(ev.index, (partialJson.get(ev.index) ?? '') + (ev.delta.partial_json ?? ''))
      }
    } else if (ev.type === 'message_delta') {
      if (ev.delta?.stop_reason) stop_reason = ev.delta.stop_reason
      if (ev.usage?.output_tokens != null) usage.output_tokens = Number(ev.usage.output_tokens) || 0
    } else if (ev.type === 'error') {
      throw new ChatError(`Der KI-Anbieter hat die Antwort abgebrochen: ${ev.error?.message ?? 'unbekannter Fehler'}`)
    }
  }
  for (const [i, json] of partialJson) {
    if (!content[i]) continue
    try {
      content[i].input = json ? JSON.parse(json) : {}
    } catch {
      content[i].input = {}
    }
  }
  return { content: content.filter(Boolean), stop_reason, usage }
}

/** OpenAI-kompatibler Stream (auch Ollama): Text sofort weiterreichen, Werkzeug-Aufrufe zusammensetzen. */
async function readOpenaiStream(res: Response, onDelta: (t: string) => void): Promise<{ msg: any; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  let content = ''
  const calls: any[] = []
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  for await (const chunk of sseEvents(res)) {
    if (chunk.usage) usage = chunk.usage
    const delta = chunk.choices?.[0]?.delta
    if (!delta) continue
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      onDelta(delta.content)
    }
    for (const tc of delta.tool_calls ?? []) {
      const c = (calls[tc.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
      if (tc.id) c.id = tc.id
      if (tc.function?.name) c.function.name = tc.function.name
      if (tc.function?.arguments) c.function.arguments += tc.function.arguments
    }
  }
  const msg: any = { role: 'assistant', content: content || null }
  const toolCalls = calls.filter(Boolean)
  if (toolCalls.length) msg.tool_calls = toolCalls
  return { msg, usage }
}

// ---------- Anthropic ----------
async function runAnthropic(o: Parameters<typeof runAgent>[0]): Promise<string> {
  const url = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_ANTHROPIC_URL']) || 'https://api.anthropic.com/v1/messages'
  const convo: unknown[] = o.messages.map((m) => ({ role: m.role, content: m.content }))
  for (let step = 0; step < MAX_STEPS; step++) {
    const body = {
      model: o.model,
      max_tokens: 4096,
      system: SYSTEM,
      tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      messages: convo,
      stream: true
    }
    const res = await fetch(url, { method: 'POST', signal: o.signal, headers: { 'x-api-key': o.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new ChatError(providerError(res.status, await res.text().catch(() => '')))
    // Live-Streaming: Text erscheint Wort für Wort. Antwortet der Server ohne Stream, gilt der bisherige Weg.
    const streamed = isEventStream(res)
    const json: any = streamed ? await readAnthropicStream(res, o.onDelta) : await res.json()
    if (json.usage) o.onUsage?.(Number(json.usage.input_tokens) || 0, Number(json.usage.output_tokens) || 0)
    const content: any[] = json.content ?? []
    const toolUses = content.filter((b) => b.type === 'tool_use')
    const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    if (json.stop_reason !== 'tool_use' || toolUses.length === 0) {
      if (textBlocks && !streamed) o.onDelta(textBlocks)
      return textBlocks
    }
    convo.push({ role: 'assistant', content })
    const results: unknown[] = []
    for (const tu of toolUses) {
      o.onTool(labelFor(tu.name))
      const r = await o.exec(tu.name, tu.input ?? {})
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: toolText(r), is_error: !r.ok })
    }
    convo.push({ role: 'user', content: results })
  }
  throw new ChatError('Die KI hat zu viele Schritte benötigt. Bitte die Frage genauer stellen.')
}

// ---------- OpenAI ----------
async function runOpenai(o: Parameters<typeof runAgent>[0]): Promise<string> {
  // Ollama (lokal) nutzt denselben OpenAI-kompatiblen Pfad, aber eine lokale Adresse und keinen Schlüssel.
  const url = o.baseUrl ?? ((!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_OPENAI_URL']) || 'https://api.openai.com/v1/chat/completions')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (o.key) headers['Authorization'] = `Bearer ${o.key}`
  const convo: any[] = [{ role: 'system', content: SYSTEM }, ...o.messages.map((m) => ({ role: m.role, content: m.content }))]
  const tools = ALL_TOOLS.map((t) => ({ type: 'function', function: t }))
  for (let step = 0; step < MAX_STEPS; step++) {
    // Token-Angabe im Stream gibt es nur bei OpenAI selbst; lokale Server (Ollama) bekommen sie nicht angefragt.
    const streamOpts = o.baseUrl ? {} : { stream_options: { include_usage: true } }
    const res = await fetch(url, { method: 'POST', signal: o.signal, headers, body: JSON.stringify({ model: o.model, max_tokens: 4096, tools, messages: convo, stream: true, ...streamOpts }) })
    if (!res.ok) throw new ChatError(providerError(res.status, await res.text().catch(() => '')))
    const streamed = isEventStream(res)
    let msg: any
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (streamed) {
      ;({ msg, usage } = await readOpenaiStream(res, o.onDelta))
    } else {
      const json: any = await res.json()
      usage = json.usage
      msg = json.choices?.[0]?.message ?? {}
    }
    if (usage) o.onUsage?.(Number(usage.prompt_tokens) || 0, Number(usage.completion_tokens) || 0)
    const calls = msg.tool_calls ?? []
    if (!calls.length) {
      const text = msg.content ?? ''
      if (text && !streamed) o.onDelta(text)
      return text
    }
    convo.push(msg)
    for (const c of calls) {
      o.onTool(labelFor(c.function?.name))
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(c.function?.arguments ?? '{}')
      } catch {
        /* ungültige Argumente → leer */
      }
      const r = await o.exec(c.function?.name, args)
      convo.push({ role: 'tool', tool_call_id: c.id, content: toolText(r) })
    }
  }
  throw new ChatError('Die KI hat zu viele Schritte benötigt. Bitte die Frage genauer stellen.')
}

function labelFor(name: string): string {
  return (
    {
      web_recherche: 'Recherchiert im Web …',
      email_entwurf: 'Erstellt E-Mail-Entwürfe …',
      email_senden: 'Sendet eine E-Mail (nach Freigabe) …',
      ordner_aufraeumen: 'Räumt einen Ordner auf (du wählst ihn, jede Verschiebung mit Freigabe) …',
      pdf_lesen: 'Liest die gewählten PDF-Dateien …',
      frag_dateien: 'Durchsucht die Dateien im gewählten Ordner und beantwortet deine Frage (nach Freigabe) …',
      offene_fenster: 'Sieht die offenen Programmfenster durch …',
      computer_steuern: 'Bedient ein Programm (jede Aktion mit Freigabe) …',
      konnektoren_auflisten: 'Sieht die verbundenen Dienste durch …',
      konnektor_aufrufen: 'Nutzt einen verbundenen Dienst …'
    }[name] ?? `Werkzeug „${name}“ …`
  )
}
function toolText(r: ToolResult): string {
  const head = r.ok ? r.summary : `Fehlgeschlagen: ${r.summary}`
  return `${head}\n\n${r.text}`.trim().slice(0, 6000) || (r.ok ? 'Erledigt.' : 'Fehlgeschlagen.')
}

function providerError(status: number, detail: string): string {
  let msg = ''
  try {
    msg = JSON.parse(detail)?.error?.message ?? ''
  } catch {
    /* kein JSON */
  }
  if (status === 401 || status === 403) return 'Der API-Schlüssel wurde abgelehnt (ungültig oder ohne Berechtigung).'
  if (status === 404 && /model/i.test(msg)) return `Dieses Modell ist für deinen Schlüssel nicht verfügbar. ${msg}`.trim()
  if (status === 429) return 'Zu viele Anfragen oder Guthaben erschöpft. Bitte später erneut versuchen.'
  return `Fehler vom KI-Anbieter (HTTP ${status})${msg ? ': ' + msg : ''}`.slice(0, 300)
}
