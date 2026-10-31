// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoice } from '../src/renderer/src/lib/useVoice'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useVoice – Sprachmodus einfach & lokal', () => {
  it('meldet fehlende Spracherkennung ehrlich statt zu tun als ob', () => {
    const { result } = renderHook(() => useVoice(() => {}))
    expect(result.current.sttSupported).toBe(false)
    act(() => result.current.start())
    expect(result.current.error).toMatch(/nicht verfügbar/)
    expect(result.current.listening).toBe(false)
  })

  it('spricht über die System-Stimme auf Deutsch, wenn vorhanden', () => {
    const utter: { lang?: string } = {}
    vi.stubGlobal('SpeechSynthesisUtterance', function (this: Record<string, unknown>, text: string) {
      this.text = text
      Object.assign(utter, this)
    })
    const speak = vi.fn((u: { lang?: string }) => Object.assign(utter, u))
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak, getVoices: () => [{ lang: 'de-DE' }] })
    const { result } = renderHook(() => useVoice(() => {}))
    expect(result.current.ttsSupported).toBe(true)
    act(() => result.current.speak('Hallo'))
    expect(speak).toHaveBeenCalledTimes(1)
    expect(utter.lang).toBe('de-DE')
  })

  it('erkennt gesprochenen Text und meldet ihn zurück', () => {
    let instance: Record<string, unknown> = {}
    vi.stubGlobal(
      'webkitSpeechRecognition',
      function (this: Record<string, unknown>) {
        this.start = vi.fn()
        this.stop = vi.fn()
        instance = this
      }
    )
    const onFinal = vi.fn()
    const { result } = renderHook(() => useVoice(onFinal))
    expect(result.current.sttSupported).toBe(true)
    act(() => result.current.start())
    expect(result.current.listening).toBe(true)
    act(() => {
      ;(instance.onresult as (e: unknown) => void)({ results: [[{ transcript: '  Räum den Ordner auf  ' }]] })
    })
    expect(onFinal).toHaveBeenCalledWith('Räum den Ordner auf')
  })
})
