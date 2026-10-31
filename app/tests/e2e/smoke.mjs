// End-to-End-Test der gebauten App mit echtem Worker: `pnpm build && pnpm e2e`
// Voraussetzung: im Ordner ../worker einmal `uv sync`. Linux ohne Display: `xvfb-run -a pnpm e2e`
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const shots = join(appDir, 'e2e-artifacts')
mkdirSync(shots, { recursive: true })

const sandbox = mkdtempSync(join(tmpdir(), 'nexora-e2e-'))
const userData = join(sandbox, 'userData')
const folder = join(sandbox, 'Downloads-Test')
mkdirSync(folder)
const original = ['urlaub.jpg', 'rechnung.pdf', 'notizen.txt', 'tabelle.xlsx', 'archiv.zip']
for (const f of original) writeFileSync(join(folder, f), `Inhalt ${f}`)
const listing = () =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name).slice(folder.length + 1).replaceAll('\\', '/'))
    .sort()

const args = [appDir]
if (process.platform === 'linux') args.push('--no-sandbox')
const app = await _electron.launch({ executablePath: require('electron'), args, cwd: appDir, env: { ...process.env, NEXORA_USER_DATA: userData } })
const errors = []
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })
// Nativen Ordnerdialog durch den Testordner ersetzen (nur im Test)
await app.evaluate(({ dialog }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
}, folder)

const nav = (name) => win.getByRole('navigation').getByRole('button', { name }).click()
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `)
  await fn()
  console.log('ok')
}

try {
  await step('Start: echter Worker verbindet sich', async () => {
    await win.getByText('Worker: verbunden').waitFor({ timeout: 30_000 })
    assert.equal(await win.getByText('DEMO-MODUS', { exact: true }).count(), 0)
    await win.screenshot({ path: join(shots, '01-dashboard-live.png') })
  })

  await step('Alle sechs Bereiche erreichbar', async () => {
    for (const name of ['Agenten', 'Automationen', 'Aktivitäten', 'Dateien', 'Einstellungen']) {
      await nav(name)
      await win.getByRole('heading', { level: 1, name }).waitFor()
    }
    await win.getByText(/Sichere Speicherung/).waitFor()
    await win.screenshot({ path: join(shots, '02-einstellungen.png') })
    await nav('Dashboard')
  })

  await step('LIVE: Ordner wählen, Erlaubnis geben, Aufgabe starten', async () => {
    const start = win.getByRole('button', { name: 'Aufgabe starten' })
    await win.getByRole('button', { name: 'Ordner wählen' }).click()
    await win.getByTestId('picked-folder').getByText(folder).waitFor()
    assert.equal(await start.isDisabled(), true, 'ohne Erlaubnis darf nichts starten')
    await win.getByRole('checkbox').check()
    await start.click()
  })

  await step('LIVE: Freigabe zeigt echte Daten, vorher wurde nichts verändert', async () => {
    const dlg = win.getByRole('alertdialog')
    await dlg.waitFor({ timeout: 15_000 })
    await dlg.getByText('Dateien verschieben').waitFor()
    await dlg.getByText(/5 Dateien → 5 Unterordner/).waitFor()
    assert.deepEqual(listing(), [...original].sort())
    await win.screenshot({ path: join(shots, '03-live-freigabe.png') })
  })

  await step('LIVE: Erlauben → Dateien wirklich verschoben und verifiziert', async () => {
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText(/5\/5 verschobene Dateien geprüft/).first().waitFor({ timeout: 15_000 })
    assert.deepEqual(listing(), ['Archive/archiv.zip', 'Bilder/urlaub.jpg', 'Dokumente/notizen.txt', 'PDFs/rechnung.pdf', 'Tabellen/tabelle.xlsx'])
    await win.screenshot({ path: join(shots, '04-live-fertig.png') })
  })

  await step('LIVE: Rückgängig mit Freigabe stellt Originalzustand her', async () => {
    await nav('Aktivitäten')
    await win.getByRole('button', { name: 'Rückgängig' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.getByText('Sortierung rückgängig machen', { exact: true }).waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText(/5 Dateien am Ursprungsort geprüft/).first().waitFor({ timeout: 15_000 })
    assert.deepEqual(listing(), [...original].sort())
    assert.equal(existsSync(join(folder, 'Bilder')), false)
    assert.equal(await win.getByRole('button', { name: 'Rückgängig' }).count(), 0, 'kein zweites Undo anbieten')
    await win.screenshot({ path: join(shots, '05-live-undo.png') })
  })

  await step('LIVE: Ablehnen verändert nichts', async () => {
    await nav('Dashboard')
    await win.getByRole('checkbox').check()
    await win.getByRole('button', { name: 'Aufgabe starten' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Ablehnen' }).click()
    await win.getByText(/Freigabe abgelehnt – es wurde keine Datei verschoben/).first().waitFor({ timeout: 15_000 })
    assert.deepEqual(listing(), [...original].sort())
  })

  await step('DEMO: Ordner-Szenario mit Freigabe', async () => {
    await win.getByLabel('Vorlage').selectOption('pdf')
    await win.getByRole('button', { name: 'Demo-Modus öffnen' }).click()
    await win.getByText('DEMO-MODUS', { exact: true }).waitFor()
    await win.getByLabel('Vorlage').selectOption('ordner')
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByRole('alertdialog').getByText('DEMO', { exact: true }).waitFor({ timeout: 15_000 })
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText('Sortierprotokoll.csv').first().waitFor({ timeout: 15_000 })
    await win.screenshot({ path: join(shots, '06-dashboard-demo.png') })
  })

  await step('DEMO: Recherche zeigt Schrittfehler; Kostendiagramm gezeichnet', async () => {
    await win.getByLabel('Vorlage').selectOption('recherche')
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByText(/1 Quelle fehlgeschlagen/).first().waitFor({ timeout: 15_000 })
    await nav('Aktivitäten')
    await win.getByRole('region', { name: 'API-Kosten (simuliert)' }).locator('.recharts-area').waitFor()
    await win.screenshot({ path: join(shots, '07-aktivitaeten.png') })
  })

  await step('Kein Überlauf und keine Überlappung bei 1024×640', async () => {
    await nav('Dashboard')
    await win.setViewportSize({ width: 1024, height: 640 })
    const overflow = () => win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.equal(await overflow(), 0)
    const orbit = await win.getByTestId('orbit-panel').boundingBox()
    const composer = await win.getByTestId('task-composer').boundingBox()
    assert.ok(orbit && composer && orbit.y + orbit.height <= composer.y + 1, 'Orbit überlappt das Aufgabenfeld')
    const topBarHeight = await win.locator('header').first().evaluate((el) => el.getBoundingClientRect().height)
    assert.ok(topBarHeight <= 57, `Statusleiste bricht um (Höhe ${topBarHeight}px)`)
    await win.getByRole('button', { name: 'Seitenleiste umschalten' }).click()
    assert.equal(await overflow(), 0)
    await win.getByRole('button', { name: 'Seitenleiste umschalten' }).click()
    await win.screenshot({ path: join(shots, '08-dashboard-1024.png') })
    await win.setViewportSize({ width: 1440, height: 900 })
  })

  await step('Demo beenden entfernt nur Demo-Daten, Live-Verlauf bleibt', async () => {
    await win.getByRole('button', { name: 'Demo beenden' }).click()
    await nav('Aktivitäten')
    await win.locator('tbody tr').first().waitFor()
    assert.equal(await win.locator('tbody').getByText('DEMO', { exact: true }).count(), 0)
    assert.equal(await win.locator('tbody tr').count(), 3)
  })

  await step('Keine Konsolenfehler', async () => {
    assert.deepEqual(errors, [])
  })
  console.log(`\nE2E bestanden. Screenshots: ${shots}`)
} catch (err) {
  await win.screenshot({ path: join(shots, 'fehler.png') }).catch(() => undefined)
  console.error('\nE2E fehlgeschlagen:', err, '\nKonsolenfehler:', errors)
  process.exitCode = 1
} finally {
  await app.close()
  rmSync(sandbox, { recursive: true, force: true })
}
