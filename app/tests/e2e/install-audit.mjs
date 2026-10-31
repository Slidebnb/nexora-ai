// Installationsaudit auf einem frischen Windows-Rechner (CI): echter Installer, installierte App, Deinstallation.
// Aufruf (Windows, nach `electron-builder --win`): node tests/e2e/install-audit.mjs
// Ergebnis: Zeilen „AUDIT …“ im Log und e2e-artifacts/audit-windows.json. Nur gemessene Werte.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright-core'

if (process.platform !== 'win32') {
  console.log('Installationsaudit läuft nur unter Windows – übersprungen.')
  process.exit(0)
}

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const shots = join(appDir, 'e2e-artifacts')
mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail) })
  console.log(`AUDIT ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` – ${detail}` : ''}`)
}
const dirSize = (p) => {
  let total = 0
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name)
    total += e.isDirectory() ? dirSize(f) : statSync(f).size
  }
  return total
}
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`

// 1) Installer finden und still installieren (pro Benutzer, ohne Admin)
const release = join(appDir, 'release')
const installer = readdirSync(release).find((f) => f.toLowerCase().endsWith('.exe') && f.toLowerCase().includes('setup'))
check('Installer vorhanden', installer, installer ? `${installer}, ${mb(statSync(join(release, installer)).size)}` : 'keine Setup-.exe gefunden')
if (!installer) process.exit(1)
let t = Date.now()
const inst = spawnSync(join(release, installer), ['/S'], { stdio: 'inherit' })
check('Stille Installation ohne Fehler', inst.status === 0, `Exit-Code ${inst.status}, Dauer ${((Date.now() - t) / 1000).toFixed(1)} s`)

const programs = join(process.env.LOCALAPPDATA ?? '', 'Programs')
const installDir = ['NEXORA AI', 'nexora-ai'].map((d) => join(programs, d)).find((d) => existsSync(join(d, 'NEXORA AI.exe')))
check('Programm installiert (pro Benutzer)', installDir, installDir ?? `nicht gefunden unter ${programs}`)
if (!installDir) process.exit(1)
const exe = join(installDir, 'NEXORA AI.exe')
check('Worker im Installationsordner', existsSync(join(installDir, 'resources', 'worker', 'nexora-worker.exe')))
check('Lizenzhinweise im Installationsordner', existsSync(join(installDir, 'resources', 'THIRD_PARTY_NOTICES.md')) && existsSync(join(installDir, 'resources', 'licenses')))
check('Installierte Größe gemessen', true, mb(dirSize(installDir)))

// 2) Installierte App starten
async function launch() {
  const started = Date.now()
  const app = await _electron.launch({ executablePath: exe })
  const win = await app.firstWindow()
  await win.setViewportSize({ width: 1440, height: 900 })
  await win.getByText('Bereit', { exact: true }).waitFor({ timeout: 60_000 })
  return { app, win, ms: Date.now() - started }
}

let { app, win, ms } = await launch()
check('Start bis „Bereit“ (eingebauter Worker verbunden)', true, `${(ms / 1000).toFixed(1)} s`)
const userData = await app.evaluate(({ app }) => app.getPath('userData'))
const documents = await app.evaluate(({ app }) => app.getPath('documents'))
check('Gepackte Version', await app.evaluate(({ app }) => app.isPackaged), `userData: ${userData}`)
const notif = await app.evaluate(({ Notification }) => Notification.isSupported())
check('Windows-Benachrichtigungen vom System unterstützt', notif, 'nur Systemfähigkeit geprüft, nicht die sichtbare Anzeige')

try {
  // 3) Erststart: Begrüßung → Übungsordner → aufräumen → rückgängig
  await win.getByRole('dialog', { name: 'Willkommen bei NEXORA' }).waitFor({ timeout: 10_000 })
  await win.screenshot({ path: join(shots, 'audit-01-begruessung.png') })
  check('Begrüßung beim Erststart', true)
  await win.getByRole('button', { name: 'Weiter' }).click()
  await win.getByRole('button', { name: 'Weiter' }).click()
  await win.getByRole('button', { name: 'Übungsordner anlegen und loslegen' }).click()
  const wizard = win.getByRole('dialog', { name: 'Ordner aufräumen' })
  await wizard.getByTestId('picked-folder').getByText('NEXORA Übungsordner').waitFor()
  const practice = (await wizard.getByTestId('picked-folder').innerText()).trim()
  check('Übungsordner in „Dokumente“ angelegt', practice.startsWith(documents) && existsSync(practice), practice)
  const filesBefore = readdirSync(practice).length
  await wizard.getByLabel('Erlaubnis für diese Aufgabe').check()
  t = Date.now()
  await wizard.getByRole('button', { name: 'Aufgabe starten' }).click()
  await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).waitFor({ timeout: 20_000 })
  check('Bestätigung erscheint vor jeder Änderung', readdirSync(practice, { withFileTypes: true }).every((d) => d.isFile()), `${filesBefore} Dateien noch unverändert`)
  await win.screenshot({ path: join(shots, 'audit-02-bestaetigung.png') })
  await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
  await win.getByText(new RegExp(`^${filesBefore} Dateien in \\d+ Ordner sortiert\\.$`)).waitFor({ timeout: 30_000 })
  const loose = readdirSync(practice, { withFileTypes: true }).filter((d) => d.isFile()).length
  check('Ordner wirklich aufgeräumt (auf der Festplatte geprüft)', loose === 0, `${filesBefore} Dateien sortiert in ${((Date.now() - t) / 1000).toFixed(1)} s (inkl. Bestätigung)`)
  await win.screenshot({ path: join(shots, 'audit-03-erledigt.png') })
  await win.locator('li', { hasText: 'Übungsordner' }).getByRole('button', { name: 'Rückgängig machen' }).click()
  await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
  const end = Date.now() + 20_000
  while (readdirSync(practice, { withFileTypes: true }).some((d) => d.isDirectory()) && Date.now() < end) await new Promise((r) => setTimeout(r, 200))
  check('Rückgängig stellt den Ursprungszustand her', readdirSync(practice).length === filesBefore && readdirSync(practice, { withFileTypes: true }).every((d) => d.isFile()))

  // 4) API-Schlüssel: Windows-Verschlüsselung (DPAPI) und Neustart
  await win.getByRole('navigation').getByRole('button', { name: 'Einstellungen' }).click()
  const secure = await win.getByText('Sichere Speicherung verfügbar').isVisible()
  check('Sichere Speicherung (DPAPI) verfügbar', secure)
  const fakeKey = 'sk-ant-audit-' + 'X'.repeat(32)
  await win.getByLabel('API-Schlüssel Anthropic (Claude)').fill(fakeKey)
  await win.getByRole('button', { name: 'Speichern' }).first().click()
  await win.getByText('✓ hinterlegt (verschlüsselt)').first().waitFor({ timeout: 10_000 })
  const secretsFile = join(userData, 'secrets.json')
  const raw = existsSync(secretsFile) ? readFileSync(secretsFile, 'utf8') : ''
  check('Schlüssel liegt nicht im Klartext auf der Festplatte', raw.length > 0 && !raw.includes(fakeKey))
  await app.close()

  ;({ app, win, ms } = await launch())
  check('Zweiter Start bis „Bereit“', true, `${(ms / 1000).toFixed(1)} s`)
  await win.getByRole('navigation').getByRole('button', { name: 'Einstellungen' }).click()
  await win.getByText('✓ hinterlegt (verschlüsselt)').first().waitFor({ timeout: 10_000 })
  check('Schlüssel nach Neustart weiterhin hinterlegt', true)
  check('Begrüßung erscheint beim zweiten Start nicht erneut', (await win.getByRole('dialog', { name: 'Willkommen bei NEXORA' }).count()) === 0)
  await win.getByRole('button', { name: 'Entfernen' }).first().click()
  await win.getByText('nicht hinterlegt').first().waitFor()
  check('Schlüssel lässt sich wieder entfernen', true)
} catch (e) {
  check('Ablauf ohne Fehler', false, e instanceof Error ? e.message.split('\n')[0] : String(e))
  await win.screenshot({ path: join(shots, 'audit-fehler.png') }).catch(() => undefined)
} finally {
  await app.close().catch(() => undefined)
}

// 5) Keine verwaisten Prozesse, Deinstallation
await new Promise((r) => setTimeout(r, 3000))
const tasks = spawnSync('tasklist', ['/FI', 'IMAGENAME eq nexora-worker.exe'], { encoding: 'utf8' }).stdout ?? ''
check('Kein Worker-Prozess nach dem Beenden', !tasks.toLowerCase().includes('nexora-worker.exe'))
const uninstaller = readdirSync(installDir).find((f) => f.toLowerCase().startsWith('uninstall'))
const un = uninstaller ? spawnSync(join(installDir, uninstaller), ['/S'], { stdio: 'inherit' }) : { status: -1 }
const gone = Date.now() + 30_000
while (existsSync(exe) && Date.now() < gone) await new Promise((r) => setTimeout(r, 500))
check('Stille Deinstallation', un.status === 0 && !existsSync(exe), `Exit-Code ${un.status}`)
check('Nutzerdaten bleiben nach Deinstallation erhalten', existsSync(join(userData, 'worker', 'nexora.db')), userData)

writeFileSync(join(shots, 'audit-windows.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\nAUDIT ZUSAMMENFASSUNG: ${results.length - failed.length}/${results.length} Prüfungen bestanden`)
process.exitCode = failed.length ? 1 : 0
