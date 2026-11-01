import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatCostUsd, sttCostUsd, ttsCostUsd, UsageStore } from '../src/main/usage'
import { runAgent } from '../src/main/chat'

afterEach(() => vi.unstubAllGlobals())

describe('Kostenschätzung Chat & Voicestudio', () => {
  it('Chat: Eingabe und Ausgabe getrennt, je Modell', () => {
    expect(chatCostUsd('openai', 'gpt-4o', 1_000_000, 0)).toBe(2.5)
    expect(chatCostUsd('openai', 'gpt-4o', 0, 1_000_000)).toBe(10)
    expect(chatCostUsd('anthropic', 'claude-opus-5-5', 1_000_000, 1_000_000)).toBeGreaterThan(0)
  })

  it('Chat: lokales Modell (Ollama) kostet nichts', () => {
    expect(chatCostUsd('ollama', 'llama3.1', 5_000_000, 5_000_000)).toBe(0)
  })

  it('Chat: unbekanntes Cloud-Modell wird vorsichtig geschätzt statt 0', () => {
    expect(chatCostUsd('openai', 'neues-modell', 1_000_000, 0)).toBeGreaterThan(0)
  })

  it('Vorlesen nach Zeichen, Diktat nach Minuten', () => {
    expect(ttsCostUsd(1_000_000)).toBe(15)
    expect(sttCostUsd(60_000)).toBe(0.006)
    expect(sttCostUsd(0)).toBe(0)
  })
})

describe('UsageStore', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'nexora-usage-'))

  it('summiert je Art und bleibt nach Neustart erhalten', () => {
    const file = join(dir(), 'usage.json')
    const s = new UsageStore(file)
    s.add('chat', 0.5)
    s.add('chat', 0.25)
    s.add('voice', 0.1)
    expect(s.get()).toEqual({ chatUsd: 0.75, voiceUsd: 0.1 })
    expect(new UsageStore(file).get()).toEqual({ chatUsd: 0.75, voiceUsd: 0.1 })
  })

  it('beschädigte Datei → bei 0 beginnen, negative Beträge ignorieren', () => {
    const file = join(dir(), 'usage.json')
    writeFileSync(file, '{kaputt')
    const s = new UsageStore(file)
    expect(s.get()).toEqual({ chatUsd: 0, voiceUsd: 0 })
    s.add('voice', -5)
    expect(s.get().voiceUsd).toBe(0)
  })
})

describe('runAgent meldet Token-Verbrauch', () => {
  const base = { key: 'k', messages: [{ role: 'user' as const, content: 'Hallo' }], signal: new AbortController().signal, onDelta: () => {}, onTool: () => {}, exec: async () => ({ ok: true, summary: '', text: '' }) }

  it('Anthropic: input/output_tokens', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 30 } })))
    const onUsage = vi.fn()
    await runAgent({ ...base, provider: 'anthropic', model: 'claude-opus-5-5', onUsage })
    expect(onUsage).toHaveBeenCalledWith(120, 30)
  })

  it('OpenAI: prompt/completion_tokens', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hi' } }], usage: { prompt_tokens: 80, completion_tokens: 20 } })))
    const onUsage = vi.fn()
    await runAgent({ ...base, provider: 'openai', model: 'gpt-4o', onUsage })
    expect(onUsage).toHaveBeenCalledWith(80, 20)
  })
})
