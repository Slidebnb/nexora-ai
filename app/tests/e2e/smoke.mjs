// End-to-End-Smoketest der gebauten App: `pnpm build && pnpm e2e`
// Unter Linux ohne Display: `xvfb-run -a pnpm e2e`
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const shots = join(appDir, 'e2e-artifacts')
mkdirSync(shots, { recursive: true })

const args = [appDir]
if (process.platform === 'linux') args.push('--no-sandbox')
const app = await _electron.launch({ executablePath: require('electron'), args, cwd: appDir })
const errors = []
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `)
  await fn()
  console.log('ok')
}

try {
  await step('Start ohne Demo: Worker als nicht verbunden', async () => {
    await win.getByText('Worker: nicht verbunden').waitFor()
    assert.equal(await win.getByText('DEMO-MODUS', { exact: true }).count(), 0)
    await win.screenshot({ path: join(shots, '01-dashboard-leer.png') })
  })

  await step('Alle sechs Bereiche erreichbar', async () => {
    for (const [nav, heading] of [
      ['Agenten', 'Agenten'],
      ['Automationen', 'Automationen'],
      ['Aktivitäten', 'Aktivitäten'],
      ['Dateien', 'Dateien'],
      ['Einstellungen', 'Einstellungen']
    ]) {
      await win.getByRole('navigation').getByRole('button', { name: nav }).click()
      await win.getByRole('heading', { level: 1, name: heading }).waitFor()
    }
    await win.getByText(/Sichere Speicherung/).waitFor()
    await win.screenshot({ path: join(shots, '02-einstellungen.png') })
  })

  await step('Demo starten und Ordner-Szenario bis zur Freigabe laufen lassen', async () => {
    await win.getByRole('button', { name: 'Demo-Modus starten' }).click()
    await win.getByText('DEMO-MODUS', { exact: true }).waitFor()
    await win.getByRole('navigation').getByRole('button', { name: 'Dashboard' }).click()
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByRole('alertdialog').waitFor({ timeout: 15_000 })
    await win.getByRole('alertdialog').getByText('Dateien verschieben').waitFor()
    await win.screenshot({ path: join(shots, '03-freigabe.png') })
  })

  await step('Freigabe erteilen und Erfolg mit Verifikation abwarten', async () => {
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText('Sortierprotokoll.csv').first().waitFor({ timeout: 15_000 })
    await win.getByText(/Vorgang erfolgreich/).first().waitFor({ timeout: 15_000 })
    await win.screenshot({ path: join(shots, '04-dashboard-demo-fertig.png') })
  })

  await step('Recherche-Demo zeigt Schrittfehler, Aktivitäten listen beide Vorgänge', async () => {
    await win.getByLabel('Vorlage').selectOption('recherche')
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByText(/Schritt fehlgeschlagen: w3/).first().waitFor({ timeout: 15_000 })
    await win.getByText(/1 Quelle fehlgeschlagen/).first().waitFor({ timeout: 15_000 })
    await win.getByRole('navigation').getByRole('button', { name: 'Aktivitäten' }).click()
    assert.equal(await win.locator('tbody tr').count(), 2)
    await win.getByRole('region', { name: 'API-Kosten (simuliert)' }).locator('.recharts-area').waitFor()
    await win.screenshot({ path: join(shots, '05-aktivitaeten.png') })
  })

  await step('Kein horizontaler Überlauf bei Mindestgröße 1024×640 (mit und ohne Seitenleiste)', async () => {
    await win.getByRole('navigation').getByRole('button', { name: 'Dashboard' }).click()
    await win.setViewportSize({ width: 1024, height: 640 })
    const overflow = () => win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.equal(await overflow(), 0)
    const orbit = await win.getByTestId('orbit-panel').boundingBox()
    const composer = await win.getByTestId('task-composer').boundingBox()
    assert.ok(orbit && composer && orbit.y + orbit.height <= composer.y + 1, 'Orbit überlappt das Aufgabenfeld')
    const topBarHeight = await win.locator('header').first().evaluate((el) => el.getBoundingClientRect().height)
    assert.ok(topBarHeight <= 57, `Statusleiste bricht um (Höhe ${topBarHeight}px)`)
    await win.screenshot({ path: join(shots, '06-dashboard-1024.png') })
    await win.getByRole('button', { name: 'Seitenleiste umschalten' }).click()
    assert.equal(await overflow(), 0)
    await win.getByRole('button', { name: 'Seitenleiste umschalten' }).click()
    await win.setViewportSize({ width: 1440, height: 900 })
    await win.getByRole('navigation').getByRole('button', { name: 'Aktivitäten' }).click()
  })

  await step('Demo beenden entfernt alle Demo-Daten', async () => {
    await win.getByRole('button', { name: 'Demo beenden' }).click()
    await win.getByText('Keine Vorgänge für diesen Filter.').waitFor()
    assert.equal(await win.getByText('DEMO-MODUS', { exact: true }).count(), 0)
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
}
