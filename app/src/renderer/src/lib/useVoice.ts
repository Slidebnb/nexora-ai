import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Sprachmodus mit zwei Betriebsarten:
 *
 * 1. Cloud (Voicestudio, opts.cloud === true): Premium-Stimmen über OpenAI.
 *    - Diktat: Mikrofon wird mit dem MediaRecorder aufgenommen und als Audio an Whisper (über den Main-Prozess)
 *      geschickt; der Schlüssel bleibt im Main-Prozess. Es fallen API-Kosten an.
 *    - Sprachausgabe: Text -> OpenAI-TTS -> MP3, hier abgespielt.
 * 2. Lokal (Standard): Web-Speech-API des Browsers (Erkennung) + System-Stimme (speechSynthesis), kostenlos.
 *    In manchen Umgebungen (auch Electron) ist die lokale Erkennung nicht verfügbar – dann ehrliche Meldung.
 */
export interface Voice {
  sttSupported: boolean
  ttsSupported: boolean
  listening: boolean
  busy: boolean
  error: string | null
  start: () => void
  stop: () => void
  speak: (text: string, onDone?: () => void) => void
}

export interface VoiceOptions {
  /** true = Premium-Stimmen/Diktat über OpenAI (Voicestudio); false/undefiniert = lokal. */
  cloud?: boolean
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Kein Zugriff aufs Mikrofon. Bitte in den Systemeinstellungen erlauben.',
  'service-not-allowed': 'Kein Zugriff aufs Mikrofon. Bitte in den Systemeinstellungen erlauben.',
  'no-speech': 'Ich habe nichts gehört. Bitte erneut versuchen.',
  'network': 'Die Spracherkennung braucht hier eine Internetverbindung und ist gerade nicht erreichbar. Du kannst weiter tippen.',
  'audio-capture': 'Kein Mikrofon gefunden.'
}

function cleanMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function useVoice(onFinal: (text: string) => void, opts: VoiceOptions = {}): Voice {
  const cloud = !!opts.cloud
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const sttSupported = cloud ? canRecord : !!recognitionCtor()
  const ttsSupported = cloud ? true : typeof window !== 'undefined' && 'speechSynthesis' in window

  // --- Diktat beenden -------------------------------------------------------
  const stop = useCallback(() => {
    if (cloud) {
      try {
        mediaRef.current?.recorder.stop()
      } catch {
        /* egal */
      }
      return
    }
    try {
      recRef.current?.stop()
    } catch {
      /* egal */
    }
    setListening(false)
  }, [cloud])

  // --- Diktat starten (Cloud: Mikrofon aufnehmen -> Whisper) ---------------
  const startCloud = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Kein Zugriff aufs Mikrofon. Bitte in den Systemeinstellungen erlauben.')
      return
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    const startedAt = Date.now()
    mediaRef.current = { recorder, stream, chunks }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      mediaRef.current = null
      setListening(false)
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      if (blob.size === 0) return
      setBusy(true)
      try {
        const base64 = await blobToBase64(blob)
        const res = await window.nexora.transcribeCloud(base64, blob.type, Math.min(3_600_000, Date.now() - startedAt))
        if (res.text) onFinalRef.current(res.text)
        else setError('Ich habe nichts verstanden. Bitte erneut versuchen.')
      } catch (e) {
        setError(cleanMsg(e))
      } finally {
        setBusy(false)
      }
    }
    recorder.start()
    setListening(true)
  }, [])

  // --- Diktat starten (lokal: Web-Speech-API) ------------------------------
  const startLocal = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setError('Spracherkennung ist auf diesem System nicht verfügbar. Du kannst weiter tippen.')
      return
    }
    setError(null)
    try {
      const rec = new Ctor()
      rec.lang = 'de-DE'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.continuous = false
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript?.trim()
        if (text) onFinalRef.current(text)
      }
      rec.onerror = (e) => {
        setError(ERRORS[e.error] ?? `Spracherkennung fehlgeschlagen (${e.error}).`)
        setListening(false)
      }
      rec.onend = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setError('Spracherkennung konnte nicht gestartet werden.')
      setListening(false)
    }
  }, [])

  const start = useCallback(() => {
    if (cloud) void startCloud()
    else startLocal()
  }, [cloud, startCloud, startLocal])

  // --- Sprachausgabe --------------------------------------------------------
  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (!text) {
        onDone?.()
        return
      }
      if (cloud) {
        setBusy(true)
        window.nexora.speakCloud(text).then(
          ({ audioBase64, mime }) => {
            try {
              audioRef.current?.pause()
              const audio = new Audio(`data:${mime};base64,${audioBase64}`)
              audioRef.current = audio
              const finish = () => {
                setBusy(false)
                onDone?.()
              }
              audio.onended = finish
              audio.onerror = finish
              void audio.play().catch(finish)
            } catch {
              setBusy(false)
              onDone?.()
            }
          },
          (e) => {
            setBusy(false)
            setError(cleanMsg(e))
            onDone?.()
          }
        )
        return
      }
      if (!ttsSupported) {
        onDone?.()
        return
      }
      try {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'de-DE'
        const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('de'))
        if (v) u.voice = v
        if (onDone) {
          u.onend = onDone
          u.onerror = onDone
        }
        window.speechSynthesis.speak(u)
      } catch {
        onDone?.()
      }
    },
    [cloud, ttsSupported]
  )

  useEffect(
    () => () => {
      try {
        recRef.current?.abort?.()
      } catch {
        /* egal */
      }
      try {
        mediaRef.current?.recorder.stop()
        mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
      } catch {
        /* egal */
      }
      try {
        audioRef.current?.pause()
        window.speechSynthesis?.cancel()
      } catch {
        /* egal */
      }
    },
    []
  )

  return { sttSupported, ttsSupported, listening, busy, error, start, stop, speak }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Audio konnte nicht gelesen werden.'))
    reader.readAsDataURL(blob)
  })
}
