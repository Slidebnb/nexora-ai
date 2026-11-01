/*
 * Voicestudio – Cloud-Stimmen über OpenAI, ausgeführt im Main-Prozess (der Schlüssel verlässt ihn nie).
 * - synthesize: Text -> gesprochenes Audio (MP3) über /v1/audio/speech (TTS).
 * - transcribe: aufgenommenes Audio -> Text über /v1/audio/transcriptions (Whisper).
 * Beides läuft nur nach ausdrücklicher Aktivierung in den Einstellungen (Voicestudio) und mit Cloud-KI-Lizenz.
 */

const SPEECH_URL = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_VOICE_SPEECH_URL']) || 'https://api.openai.com/v1/audio/speech'
const TRANSCRIBE_URL = (!process.env['NEXORA_PACKAGED'] && process.env['NEXORA_VOICE_TRANSCRIBE_URL']) || 'https://api.openai.com/v1/audio/transcriptions'

const TTS_MODEL = 'gpt-4o-mini-tts'
const STT_MODEL = 'whisper-1'

export class VoiceError extends Error {}

/** Text zu Sprache. Gibt MP3-Bytes als base64 + MIME-Typ zurück. */
export async function synthesize(text: string, key: string, voice: string): Promise<{ audioBase64: string; mime: string }> {
  let res: Response
  try {
    res = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: 'mp3' })
    })
  } catch {
    throw new VoiceError('Verbindung zum Sprach-Dienst fehlgeschlagen.')
  }
  if (!res.ok) throw new VoiceError(`Sprachausgabe fehlgeschlagen (HTTP ${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { audioBase64: buf.toString('base64'), mime: 'audio/mpeg' }
}

/** Aufgenommenes Audio (base64) zu Text (Diktat). */
export async function transcribe(audioBase64: string, mime: string, key: string): Promise<{ text: string }> {
  const bytes = Buffer.from(audioBase64, 'base64')
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'mp4' : 'webm'
  const form = new FormData()
  form.set('model', STT_MODEL)
  form.set('language', 'de')
  form.set('file', new Blob([bytes], { type: mime || 'audio/webm' }), `aufnahme.${ext}`)
  let res: Response
  try {
    res = await fetch(TRANSCRIBE_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
  } catch {
    throw new VoiceError('Verbindung zum Sprach-Dienst fehlgeschlagen.')
  }
  if (!res.ok) throw new VoiceError(`Spracherkennung fehlgeschlagen (HTTP ${res.status}).`)
  const j = (await res.json()) as { text?: string }
  return { text: (j.text ?? '').trim() }
}
