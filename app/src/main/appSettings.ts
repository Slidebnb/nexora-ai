import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppSettingsSchema, type AppSettings } from '../shared/ipc-contract'

const DEFAULTS: AppSettings = { onboarded: false, theme: 'crimson', notifications: true }

/** Nicht geheime App-Einstellungen (Onboarding, Theme, Benachrichtigungen). */
export class AppSettingsStore {
  private value: AppSettings

  constructor(private readonly file: string) {
    this.value = this.load()
  }

  private load(): AppSettings {
    try {
      if (existsSync(this.file)) {
        const parsed = AppSettingsSchema.partial().safeParse(JSON.parse(readFileSync(this.file, 'utf8')))
        if (parsed.success) return { ...DEFAULTS, ...parsed.data }
      }
    } catch {
      /* beschädigt → Standardwerte */
    }
    return { ...DEFAULTS }
  }

  get(): AppSettings {
    return { ...this.value }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.value = { ...this.value, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.value), 'utf8')
    return this.get()
  }
}

/** Übungsdateien: Namen typischer Downloads, Inhalt ist nur ein Hinweistext (keine echten Dokumente). */
export const PRACTICE_FILES = [
  'Urlaubsfoto.jpg',
  'Screenshot 2026-10-01.png',
  'Rechnung Strom.pdf',
  'Kontoauszug.pdf',
  'Einkaufsliste.txt',
  'Budget 2026.xlsx',
  'Präsentation Team.pptx',
  'Fotos Sommer.zip',
  'Lieblingssong.mp3',
  'Notizen Meeting.docx'
]

/** Legt einen neuen Übungsordner an (überschreibt nie etwas) und gibt seinen Pfad zurück. */
export function createPracticeFolder(baseDir: string): string {
  let dir = join(baseDir, 'NEXORA Übungsordner')
  for (let i = 2; existsSync(dir); i++) dir = join(baseDir, `NEXORA Übungsordner ${i}`)
  mkdirSync(dir, { recursive: true })
  for (const name of PRACTICE_FILES) {
    writeFileSync(join(dir, name), `Übungsdatei für NEXORA AI (${name}). Kann gefahrlos sortiert oder gelöscht werden.\n`, { flag: 'wx' })
  }
  return dir
}
