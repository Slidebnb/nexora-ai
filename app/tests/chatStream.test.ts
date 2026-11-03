import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from '../src/main/chat'

afterEach(() => vi.unstubAllGlobals())

/** Baut eine SSE-Antwort wie bei Anthropic/OpenAI (data:-Zeilen, Leerzeile als Trenner). */
function sse(events: unknown[], done = false): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '')
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

const base = {
  key: 'k',
  messages: [{ role: 'user' as const, content: 'Hallo' }],
  signal: new AbortController().signal,
  onTool: () => {}
}

describe('Live-Streaming der Antworten', () => {
  it('Anthropic: jeder Textschnipsel kommt sofort an, Ergebnis und Token stimmen', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return sse([
        { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 1 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hal' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo!' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' }
      ])
    })
    const deltas: string[] = []
    const onUsage = vi.fn()
    const text = await runAgent({ ...base, provider: 'anthropic', model: 'm', onDelta: (d) => deltas.push(d), onUsage, exec: async () => ({ ok: true, summary: '', text: '' }) })
    expect(bodies[0].stream).toBe(true)
    expect(deltas).toEqual(['Hal', 'lo!'])
    expect(text).toBe('Hallo!')
    expect(onUsage).toHaveBeenCalledWith(12, 5)
  })

  it('Anthropic: Werkzeug-Aufruf in Stücken wird zusammengesetzt und ausgeführt', async () => {
    let call = 0
    vi.stubGlobal('fetch', async () => {
      call++
      if (call === 1)
        return sse([
          { type: 'message_start', message: { usage: { input_tokens: 1 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'web_recherche', input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"frage":"Pre' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'is?","urls":["https://a.de"]}' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } }
        ])
      return sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fertig' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }
      ])
    })
    const exec = vi.fn(async () => ({ ok: true, summary: 'ok', text: 'Ergebnis' }))
    const text = await runAgent({ ...base, provider: 'anthropic', model: 'm', onDelta: () => {}, exec })
    expect(exec).toHaveBeenCalledWith('web_recherche', { frage: 'Preis?', urls: ['https://a.de'] })
    expect(text).toBe('Fertig')
  })

  it('OpenAI: Textschnipsel live, Token aus dem letzten Abschnitt', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return sse(
        [
          { choices: [{ delta: { content: 'Gu' } }] },
          { choices: [{ delta: { content: 'ten Tag' }, finish_reason: 'stop' }] },
          { choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } }
        ],
        true
      )
    })
    const deltas: string[] = []
    const onUsage = vi.fn()
    const text = await runAgent({ ...base, provider: 'openai', model: 'gpt-4o', onDelta: (d) => deltas.push(d), onUsage, exec: async () => ({ ok: true, summary: '', text: '' }) })
    expect(bodies[0].stream).toBe(true)
    expect(deltas).toEqual(['Gu', 'ten Tag'])
    expect(text).toBe('Guten Tag')
    expect(onUsage).toHaveBeenCalledWith(7, 2)
  })

  it('OpenAI: Werkzeug-Argumente in Stücken werden zusammengesetzt', async () => {
    let call = 0
    vi.stubGlobal('fetch', async () => {
      call++
      if (call === 1)
        return sse(
          [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'web_recherche', arguments: '{"frage":"Pr' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'eis?","urls":["https://a.de"]}' } }] }, finish_reason: 'tool_calls' }] }
          ],
          true
        )
      return sse([{ choices: [{ delta: { content: 'Fertig' }, finish_reason: 'stop' }] }], true)
    })
    const exec = vi.fn(async () => ({ ok: true, summary: 'ok', text: 'Ergebnis' }))
    const text = await runAgent({ ...base, provider: 'openai', model: 'gpt-4o', onDelta: () => {}, exec })
    expect(exec).toHaveBeenCalledWith('web_recherche', { frage: 'Preis?', urls: ['https://a.de'] })
    expect(text).toBe('Fertig')
  })
})
