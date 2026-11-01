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
  'Dateien im Fenster); ein echtes Programm auf dem PC bedienen: rufe zuerst „offene_fenster“ auf, um die offenen ' +
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

const ALL_TOOLS = [TOOL_WEB, TOOL_EMAIL, TOOL_EMAIL_SEND, TOOL_ORGANIZE, TOOL_PDF, TOOL_WINDOWS, TOOL_COMPUTER, TOOL_CONN_LIST, TOOL_CONN_CALL]

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
}): Promise<string> {
  // Ollama spricht denselben OpenAI-kompatiblen Endpunkt wie OpenAI, nur lokal und ohne Schlüssel.
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
      tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
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
  // Ollama (lokal) nutzt denselben OpenAI-kompatiblen Pfad, aber eine lokale Adresse und keinen Schlüssel.
  const url = o.baseUrl ?? ((!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_OPENAI_URL']) || 'https://api.openai.com/v1/chat/completions')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (o.key) headers['Authorization'] = `Bearer ${o.key}`
  const convo: any[] = [{ role: 'system', content: SYSTEM }, ...o.messages.map((m) => ({ role: m.role, content: m.content }))]
  const tools = ALL_TOOLS.map((t) => ({ type: 'function', function: t }))
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(url, { method: 'POST', signal: o.signal, headers, body: JSON.stringify({ model: o.model, max_tokens: 4096, tools, messages: convo }) })
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
  return (
    {
      web_recherche: 'Recherchiert im Web …',
      email_entwurf: 'Erstellt E-Mail-Entwürfe …',
      email_senden: 'Sendet eine E-Mail (nach Freigabe) …',
      ordner_aufraeumen: 'Räumt einen Ordner auf (du wählst ihn, jede Verschiebung mit Freigabe) …',
      pdf_lesen: 'Liest die gewählten PDF-Dateien …',
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
