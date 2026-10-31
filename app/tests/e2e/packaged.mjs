// Prüft die gepackte App (electron-builder --dir): eingebauter Worker startet, echter Vorgang läuft.
// Aufruf: pnpm dist:dir && node tests/e2e/packaged.mjs  (Linux ohne Display: xvfb-run -a …)
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright-core'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exe =
  process.platform === 'win32'
    ? join(appDir, 'release', 'win-unpacked', 'NEXORA AI.exe')
    : join(appDir, 'release', 'linux-unpacked', 'nexora-ai')
assert.ok(existsSync(exe), `Gepackte App fehlt: ${exe}`)

const sandbox = mkdtempSync(join(tmpdir(), 'nexora-pkg-'))
const folder = join(sandbox, 'Test')
mkdirSync(folder)
writeFileSync(join(folder, 'foto.jpg'), 'x')
writeFileSync(join(folder, 'brief.pdf'), 'x')

// Gepackte Apps ignorieren NEXORA_USER_DATA bewusst – daher HOME/APPDATA umbiegen, um echte Nutzerdaten nicht zu berühren
const env = { ...process.env, HOME: sandbox, APPDATA: sandbox, XDG_CONFIG_HOME: join(sandbox, '.config') }
const app = await _electron.launch({ executablePath: exe, args: process.platform === 'linux' ? ['--no-sandbox'] : [], env })
// Unter Windows ignoriert Electron APPDATA → echtes Profil; danach wieder entfernen, falls der Test es angelegt hat
const profile = await app.evaluate(({ app }) => app.getPath('userData'))
const profileExisted = existsSync(join(profile, 'settings.json'))
try {
  const win = await app.firstWindow()
  await win.getByText('Bereit', { exact: true }).waitFor({ timeout: 30_000 })
  console.log('• gepackter Worker verbunden … ok')
  const packaged = await app.evaluate(({ app }) => app.isPackaged)
  assert.equal(packaged, true)
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
  }, folder)
  await win.getByRole('button', { name: 'Überspringen' }).click() // Begrüßung beim Erststart
  await win.getByRole('button', { name: /Ordner aufräumen/ }).click()
  await win.getByRole('button', { name: 'Ordner wählen' }).click()
  await win.getByLabel('Erlaubnis für diese Aufgabe').check()
  await win.getByRole('button', { name: 'Aufgabe starten' }).click()
  await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
  await win.getByText('2 Dateien in 2 Ordner sortiert.').waitFor({ timeout: 20_000 })
  assert.deepEqual(readdirSync(folder).sort(), ['Bilder', 'PDFs'])
  console.log('• echter Vorgang in der gepackten App … ok')
  console.log('\nGepackte App bestanden.')
} catch (e) {
  console.error('Gepackte App fehlgeschlagen:', e)
  process.exitCode = 1
} finally {
  await app.close()
  rmSync(sandbox, { recursive: true, force: true })
  if (!profileExisted && !profile.startsWith(sandbox)) {
    await new Promise((r) => setTimeout(r, 2000)) // Worker gibt die Datenbank frei
    rmSync(profile, { recursive: true, force: true })
  }
}
