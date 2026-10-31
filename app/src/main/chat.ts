import type { Provider } from '../shared/ipc-contract'

/**
 * Chat mit der KI direkt aus dem Hauptprozess: Der API-Schlüssel bleibt hier und wird nie
 * an die Oberfläche gegeben. Antworten werden gestreamt (Live-Tippen).
 * Anbieter wird nach hinterlegtem Schlüssel gewählt; das Modell ist einstellbar (Standard unten).
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
  'Du bist NEXORA, ein hilfreicher deutschsprachiger Assistent auf dem PC des Nutzers. ' +
  'Antworte klar und freundlich. Erfinde keine Fakten. Wenn du etwas nicht sicher weißt, sage es. ' +
  'Du kannst derzeit nur schreiben (noch keine Aktionen auf dem PC ausführen).'

export class ChatError extends Error {}

/** Streamt die Antwort des Anbieters und ruft onDelta je Textstück auf. Gibt den vollständigen Text zurück. */
export async function streamChat(opts: {
  provider: Provider
  key: string
  model: string
  messages: ChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
}): Promise<string> {
  const { provider, key, model, messages, signal, onDelta } = opts
  const res = await callProvider(provider, key, model, messages, signal)
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new ChatError(providerError(res.status, detail))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  const emit = (t: string) => {
    if (t) {
      full += t
      onDelta(t)
    }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        if (provider === 'anthropic') {
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') emit(json.delta.text ?? '')
          if (json.type === 'error') throw new ChatError(providerError(400, JSON.stringify(json.error ?? {})))
        } else {
          emit(json.choices?.[0]?.delta?.content ?? '')
        }
      } catch (e) {
        if (e instanceof ChatError) throw e
        // unvollständige/zwischenzeilige Daten überspringen
      }
    }
  }
  return full
}

function callProvider(provider: Provider, key: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<Response> {
  if (provider === 'anthropic') {
    // Test-Umleitung nur in der Entwicklungsversion (E2E), nie in der gepackten App
    const url = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_ANTHROPIC_URL']) || 'https://api.anthropic.com/v1/messages'
    return fetch(url, {
      method: 'POST',
      signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4096, stream: true, system: SYSTEM, messages })
    })
  }
  const url = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_CHAT_OPENAI_URL']) || 'https://api.openai.com/v1/chat/completions'
  return fetch(url, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 4096, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages] })
  })
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
