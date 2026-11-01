import { afterEach, describe, expect, it, vi } from 'vitest'
import { synthesize, transcribe, VoiceError } from '../src/main/voice'

afterEach(() => vi.unstubAllGlobals())

describe('voice – OpenAI TTS/STT (Main-Prozess)', () => {
  it('synthesize schickt Text + Stimme an OpenAI und gibt Audio als base64 zurück', async () => {
    let sent: { url: string; headers: Record<string, string>; body: unknown } | null = null
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }
      return Promise.resolve(new Response(new Uint8Array([65, 66, 67]), { status: 200 }))
    })
    const res = await synthesize('Hallo', 'sk-test', 'nova')
    expect(sent!.url).toContain('/v1/audio/speech')
    expect(sent!.headers.Authorization).toBe('Bearer sk-test')
    expect(sent!.body).toMatchObject({ voice: 'nova', input: 'Hallo', response_format: 'mp3' })
    expect(res.mime).toBe('audio/mpeg')
    expect(Buffer.from(res.audioBase64, 'base64').toString()).toBe('ABC')
  })

  it('transcribe sendet das Audio als Datei und liefert den erkannten Text', async () => {
    let form: FormData | null = null
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toContain('/v1/audio/transcriptions')
      form = init.body as FormData
      return Promise.resolve(new Response(JSON.stringify({ text: ' Guten Tag ' }), { status: 200 }))
    })
    const audio = Buffer.from('hörprobe').toString('base64')
    const res = await transcribe(audio, 'audio/webm', 'sk-test')
    expect(res.text).toBe('Guten Tag')
    expect((form!.get('model') as string)).toBe('whisper-1')
    expect(form!.get('file')).toBeInstanceOf(Blob)
  })

  it('wirft eine klare VoiceError bei HTTP-Fehlern', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 401 })))
    await expect(synthesize('x', 'sk', 'alloy')).rejects.toBeInstanceOf(VoiceError)
  })
})
