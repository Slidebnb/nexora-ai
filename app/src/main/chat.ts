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
  openai: 'gpt-4o'
}

const SYSTEM =
  'Du bist NEXORA, ein hilfreicher deutschsprachiger Assistent auf dem PC des Nutzers. Antworte klar und ehrlich; ' +
  'erfinde nichts. Du kannst das Internet durchsuchen: Wenn der Nutzer nach aktuellen Informationen fragt oder ' +
  'konkrete Webseiten nennt, rufe das Werkzeug „web_recherche“ mit einer kurzen Frage und den passenden Adressen auf. ' +
  'Fasse danach das Ergebnis verständlich zusammen und nenne die Quellen. Weitere Aktionen auf dem PC folgen – diese ' +
  'werden dem Nutzer stets vorab zur Freigabe gezeigt.'

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

const MAX_STEPS = 6

export async function runAgent(opts: {
  provider: Provider
  key: string
  model: string
  messages: ChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
  onTool: (label: string) => void
  exec: ToolExec
}): Promise<string> {
  return opts.provider === 'anthropic' ? runAnthropic(opts) : runOpenai(opts)
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
      tools: [{ name: TOOL_WEB.name, description: TOOL_WEB.description, input_schema: TOOL_WEB.parameters }],
      messages: convo
    }
    const res = await fetch(url, { method: 'POST', signal: o.signal, headers: { 'x-api-key': o.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new ChatError(providerError(res.status, await res.text().catch(() => '')))
    const json: any = await res.json()
    const content: any[] = json.content ?? []
    const toolUses = content.filter((b) => b.type === 'tool_use')
    const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    if (json.stop_reason !== 'tool_use' || toolUses.length === 0) {
      if (textBlocks) o.onDelta(textBlocks)
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
  const url = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_OPENAI_URL']) || 'https://api.openai.com/v1/chat/completions'
  const convo: any[] = [{ role: 'system', content: SYSTEM }, ...o.messages.map((m) => ({ role: m.role, content: m.content }))]
  const tools = [{ type: 'function', function: TOOL_WEB }]
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(url, { method: 'POST', signal: o.signal, headers: { Authorization: `Bearer ${o.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: o.model, max_tokens: 4096, tools, messages: convo }) })
    if (!res.ok) throw new ChatError(providerError(res.status, await res.text().catch(() => '')))
    const json: any = await res.json()
    const msg = json.choices?.[0]?.message ?? {}
    const calls = msg.tool_calls ?? []
    if (!calls.length) {
      const text = msg.content ?? ''
      if (text) o.onDelta(text)
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
  return name === 'web_recherche' ? 'Recherchiert im Web …' : `Werkzeug „${name}“ …`
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
