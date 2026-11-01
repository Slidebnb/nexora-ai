import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppSettingsStore, createPracticeFolder, PRACTICE_FILES } from '../src/main/appSettings'

describe('Übungsordner', () => {
  it('legt alle Beispieldateien an und überschreibt nie einen bestehenden Ordner', () => {
    const base = mkdtempSync(join(tmpdir(), 'nx-prac-'))
    const first = createPracticeFolder(base)
    expect(readdirSync(first).sort()).toEqual([...PRACTICE_FILES].sort())
    writeFileSync(join(first, 'eigene.txt'), 'MEINS')
    const second = createPracticeFolder(base)
    expect(second).not.toBe(first)
    expect(second.endsWith('NEXORA Übungsordner 2')).toBe(true)
    expect(readFileSync(join(first, 'eigene.txt'), 'utf8')).toBe('MEINS')
  })
})

describe('App-Einstellungen', () => {
  it('Standardwerte, Speichern, beschädigte Datei', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'nx-set-')), 'settings.json')
    const s = new AppSettingsStore(file)
    expect(s.get()).toMatchObject({ onboarded: false, theme: 'crimson', notifications: true })
    expect(s.get().ollama).toMatchObject({ enabled: false, model: 'llama3.1' })
    s.update({ onboarded: true, theme: 'cyan' })
    expect(new AppSettingsStore(file).get()).toMatchObject({ onboarded: true, theme: 'cyan' })
    writeFileSync(file, '{kaputt')
    expect(new AppSettingsStore(file).get().onboarded).toBe(false)
    expect(existsSync(file)).toBe(true)
  })
})
