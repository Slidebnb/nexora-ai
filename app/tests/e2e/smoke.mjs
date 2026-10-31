// End-to-End-Test der gebauten App mit echtem Worker: `pnpm build && pnpm e2e`
// Voraussetzung: im Ordner ../worker einmal `uv sync`. Linux ohne Display: `xvfb-run -a pnpm e2e`
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
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
const listingOnce = () =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name).slice(folder.length + 1).replaceAll('\\', '/'))
    .sort()
// Der Worker kann während des Lesens Unterordner entfernen (Rückgängig) → kurz erneut versuchen
const listing = () => {
  for (let i = 0; ; i++) {
    try {
      return listingOnce()
    } catch (e) {
      if (e.code !== 'ENOENT' || i >= 20) throw e
    }
  }
}

// Lokaler Testserver für die Web-Recherche (Worker erlaubt localhost nur mit NEXORA_ALLOW_PRIVATE_URLS=1)
const pages = {
  '/a': '<html><head><title>Anbieter A</title></head><body><p>Der Tarif kostet 9,99 Euro im Monat.</p></body></html>',
  '/b': '<html><head><title>Anbieter B</title></head><body><p>Monatlicher Tarif: 12 Euro.</p></body></html>'
}
const web = createServer((req, res) => {
  const body = pages[req.url]
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(body ?? '')
})
await new Promise((r) => web.listen(0, '127.0.0.1', r))
const webBase = `http://127.0.0.1:${web.address().port}`

const args = [appDir]
if (process.platform === 'linux') args.push('--no-sandbox')
const app = await _electron.launch({ executablePath: require('electron'), args, cwd: appDir, env: { ...process.env, NEXORA_USER_DATA: userData, NEXORA_ALLOW_PRIVATE_URLS: '1', NEXORA_PRACTICE_DIR: sandbox } })
const errors = []
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })
// Test-PDFs mit dem Generator aus den Worker-Tests erzeugen
const workerDir = join(appDir, '..', 'worker')
const py = process.platform === 'win32' ? join(workerDir, '.venv', 'Scripts', 'python.exe') : join(workerDir, '.venv', 'bin', 'python')
const pdfDir = join(sandbox, 'pdfs')
mkdirSync(pdfDir)
execFileSync(py, ['-c', `
import sys; from pathlib import Path; from tests.pdfgen import make_pdf
d = Path(sys.argv[1])
make_pdf(d / 'Angebot.pdf', [['Angebot fuer die Lieferung von Bueromaterial.', 'Der Gesamtpreis betraegt 1200 Euro netto.', 'Die Lieferung erfolgt innerhalb von zwei Wochen nach Auftrag.']], title='Angebot 42')
make_pdf(d / 'Scan.pdf', [[]])
`, pdfDir], { cwd: workerDir })
const pdfFiles = [join(pdfDir, 'Angebot.pdf'), join(pdfDir, 'Scan.pdf')]

// Native Dialoge durch Testpfade ersetzen (nur im Test)
await app.evaluate(({ dialog }, pick) => {
  globalThis.__nexoraPick = pick
  dialog.showOpenDialog = async (a, b) => {
    const options = b ?? a
    const p = globalThis.__nexoraPick
    return { canceled: false, filePaths: options.properties.includes('openFile') ? p.files : [p.folder] }
  }
}, { folder, files: pdfFiles })
const setPickedFolder = (path) => app.evaluate((_e, p) => { globalThis.__nexoraPick.folder = p }, path)

/** Wartet, bis der Ordner auf der Festplatte den erwarteten Zustand hat (maßgeblich, nicht UI-Text). */
const waitForDisk = async (pred, what, ms = 20_000) => {
  const end = Date.now() + ms
  while (!pred(listing())) {
    if (Date.now() > end) throw new Error(`Zeitüberschreitung: ${what}. Ordner: ${listing()}`)
    await new Promise((r) => setTimeout(r, 200))
  }
}
const allSorted = (l) => l.length > 0 && l.every((f) => f.includes('/'))
const allLoose = (l) => l.length > 0 && l.every((f) => !f.includes('/'))

const nav = (name) => win.getByRole('navigation').getByRole('button', { name }).click()
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `)
  await fn()
  console.log('ok')
}

try {
  await step('Start: echter Worker verbindet sich', async () => {
    await win.getByText('Bereit', { exact: true }).waitFor({ timeout: 30_000 })
    await win.getByRole('heading', { name: 'Was soll ich für dich erledigen?' }).waitFor()
    assert.equal(await win.getByText('DEMO-MODUS', { exact: true }).count(), 0)
    await win.screenshot({ path: join(shots, '01-dashboard-live.png') })
  })

  await step('ERSTSTART: Begrüßung → Übungsordner → aufräumen (erster echter Erfolg)', async () => {
    const onb = win.getByRole('dialog', { name: 'Willkommen bei NEXORA' })
    await onb.waitFor({ timeout: 10_000 })
    await win.screenshot({ path: join(shots, '00-onboarding.png') })
    await win.getByRole('button', { name: 'Weiter' }).click()
    await win.getByRole('button', { name: 'Weiter' }).click()
    await win.getByRole('button', { name: 'Übungsordner anlegen und loslegen' }).click()
    const wizard = win.getByRole('dialog', { name: 'Ordner aufräumen' })
    await wizard.getByTestId('picked-folder').getByText('NEXORA Übungsordner').waitFor()
    const practice = join(sandbox, 'NEXORA Übungsordner')
    const before = readdirSync(practice).length
    assert.ok(before > 0)
    await wizard.getByLabel('Erlaubnis für diese Aufgabe').check()
    await wizard.getByRole('button', { name: 'Aufgabe starten' }).click()
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText(new RegExp(`^${before} Dateien in \\d+ Ordner sortiert\\.$`)).waitFor({ timeout: 15_000 })
    const loose = readdirSync(practice, { withFileTypes: true }).filter((d) => d.isFile())
    assert.equal(loose.length, 0, 'alle Übungsdateien liegen in Unterordnern')
    await win.screenshot({ path: join(shots, '00b-onboarding-erfolg.png') })
  })

  await step('Alle sechs Bereiche erreichbar', async () => {
    for (const name of ['Agenten', 'Automationen', 'Aktivitäten', 'Dateien', 'Einstellungen']) {
      await nav(name)
      await win.getByRole('heading', { level: 1, name }).waitFor()
    }
    await win.getByText(/Sichere Speicherung/).waitFor()
    await win.screenshot({ path: join(shots, '02-einstellungen.png') })
    await nav('Start')
  })

  await step('KUNDE: Startseite → „Ordner aufräumen“ → bestätigen → Ergebnis → Rückgängig', async () => {
    await nav('Start')
    await win.getByRole('button', { name: /Ordner aufräumen/ }).click()
    const wizard = win.getByRole('dialog', { name: 'Ordner aufräumen' })
    await wizard.getByRole('button', { name: 'Ordner wählen' }).click()
    await wizard.getByTestId('picked-folder').getByText(folder).waitFor()
    await wizard.getByLabel('Erlaubnis für diese Aufgabe').check()
    await wizard.getByRole('button', { name: 'Aufgabe starten' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.getByText('Dateien verschieben', { exact: true }).waitFor({ timeout: 15_000 })
    assert.deepEqual(listing(), [...original].sort(), 'vor der Bestätigung unverändert')
    await win.screenshot({ path: join(shots, '02b-kunde-freigabe.png') })
    await dlg.getByRole('button', { name: 'Erlauben' }).click()
    const doneList = win.getByRole('region', { name: 'Zuletzt erledigt' })
    await win.getByRole('heading', { name: 'Zuletzt erledigt' }).waitFor()
    await win.getByText('5 Dateien in 5 Ordner sortiert.').waitFor({ timeout: 15_000 })
    assert.ok(listing().every((f) => f.includes('/')))
    await win.screenshot({ path: join(shots, '02c-kunde-fertig.png') })
    await win.locator('li', { hasText: 'Downloads-Test' }).getByRole('button', { name: 'Rückgängig machen' }).click()
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await waitForDisk(allLoose, 'Rückgängig (Kundenweg)')
    assert.deepEqual(listing(), [...original].sort(), 'Rückgängig stellt alles wieder her')
    void doneList
  })

  await step('Farbthema wechseln (Cyan) und zurück', async () => {
    await nav('Einstellungen')
    await win.getByRole('radio', { name: 'Cyan' }).click()
    await win.waitForFunction(() => document.documentElement.dataset.theme === 'cyan')
    const accent = await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim())
    assert.equal(accent, '#06b6d4')
    await nav('Start')
    await win.screenshot({ path: join(shots, '02d-theme-cyan.png') })
    await nav('Einstellungen')
    await win.getByRole('radio', { name: 'Crimson' }).click()
    await win.waitForFunction(() => document.documentElement.dataset.theme === 'crimson')
  })

  await step('Expertenansicht einschalten (technisches Kontrollzentrum)', async () => {
    await nav('Einstellungen')
    await win.getByLabel('Expertenansicht').check()
    await nav('Start')
    await win.getByTestId('orbit-panel').waitFor()
    await win.getByText('Worker: verbunden').waitFor()
  })

  await step('LIVE: Ordner wählen, Erlaubnis geben, Aufgabe starten', async () => {
    const start = win.getByRole('button', { name: 'Aufgabe starten' })
    await win.getByRole('button', { name: 'Ordner wählen' }).click()
    await win.getByTestId('picked-folder').getByText(folder).waitFor()
    assert.equal(await start.isDisabled(), true, 'ohne Erlaubnis darf nichts starten')
    await win.getByLabel('Erlaubnis für diese Aufgabe').check()
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
    await waitForDisk(allSorted, 'Verschieben (Expertenansicht)')
    assert.deepEqual(listing(), ['Archive/archiv.zip', 'Bilder/urlaub.jpg', 'Dokumente/notizen.txt', 'PDFs/rechnung.pdf', 'Tabellen/tabelle.xlsx'])
    await win.screenshot({ path: join(shots, '04-live-fertig.png') })
  })

  await step('LIVE: Rückgängig mit Freigabe stellt Originalzustand her', async () => {
    await nav('Aktivitäten')
    const testRows = win.locator('tbody tr', { hasText: 'Downloads-Test' })
    await testRows.getByRole('button', { name: 'Rückgängig' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.getByText('Sortierung rückgängig machen', { exact: true }).waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Erlauben' }).click()
    await waitForDisk(allLoose, 'Rückgängig (Aktivitäten)')
    assert.deepEqual(listing(), [...original].sort())
    assert.equal(existsSync(join(folder, 'Bilder')), false)
    await testRows.getByRole('button', { name: 'Rückgängig' }).first().waitFor({ state: 'detached', timeout: 10_000 }) // kein zweites Undo anbieten
    await win.screenshot({ path: join(shots, '05-live-undo.png') })
  })

  await step('LIVE: Ablehnen verändert nichts', async () => {
    await nav('Start')
    await win.getByLabel('Erlaubnis für diese Aufgabe').check()
    await win.getByRole('button', { name: 'Aufgabe starten' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Ablehnen' }).click()
    await win.getByText(/Freigabe abgelehnt – es wurde keine Datei verschoben/).first().waitFor({ timeout: 15_000 })
    assert.deepEqual(listing(), [...original].sort())
  })

  await step('LIVE: Web-Recherche liest Quellen und exportiert geprüfte CSV', async () => {
    await win.getByLabel('Vorlage').selectOption('recherche')
    await win.getByLabel('Recherchefrage').fill('Was kostet der Tarif im Monat?')
    await win.getByLabel('Adressen').fill(`${webBase}/a\n${webBase}/b`)
    await win.getByLabel('Erlaubnis für diese Aufgabe').check()
    await win.getByRole('button', { name: 'Aufgabe starten' }).click()
    await win.getByText(/2 von 2 Quellen gelesen \(Direktabruf/).first().waitFor({ timeout: 20_000 })
    await win.getByText('Recherche.csv').first().waitFor()
    const runs = join(userData, 'worker', 'runs')
    const csvFile = readdirSync(runs).map((d) => join(runs, d, 'Recherche.csv')).find((p) => existsSync(p))
    assert.ok(csvFile, 'CSV fehlt auf der Platte')
    const csv = readFileSync(csvFile, 'utf8')
    assert.match(csv, /Anbieter A;.*9,99 Euro/)
    assert.match(csv, /Anbieter B;.*12 Euro/)
    await win.screenshot({ path: join(shots, '06-live-recherche.png') })
  })

  await step('LIVE: PDF-Analyse lokal mit Tabelle und Bericht', async () => {
    await nav('Start')
    await win.getByLabel('Vorlage').selectOption('pdf')
    await win.getByRole('button', { name: 'PDFs wählen' }).click()
    await win.getByTestId('picked-files').getByText('Angebot.pdf').waitFor()
    await win.getByLabel('Erlaubnis für diese Aufgabe').check()
    await win.getByRole('button', { name: 'Aufgabe starten' }).click()
    await win.getByText(/2 von 2 PDF\(s\) ausgewertet, 1 ohne Textebene/).first().waitFor({ timeout: 20_000 })
    await win.getByText('PDF-Bericht.md').first().waitFor()
    await win.screenshot({ path: join(shots, '07-live-pdf.png') })
  })

  await step('LIVE: Entwürfe statt Versand – .eml erst nach Freigabe', async () => {
    const draftsDir = join(sandbox, 'Entwuerfe')
    mkdirSync(draftsDir)
    await setPickedFolder(draftsDir)
    await win.getByLabel('Vorlage').selectOption('entwurf')
    await win.getByLabel('Betreff', { exact: true }).fill('Angebot Büromaterial')
    await win.getByLabel('Empfänger', { exact: true }).fill('Anna Muster <anna@example.com>\nbob@example.org')
    await win.getByLabel('Briefing', { exact: true }).fill('Vielen Dank für Ihre Anfrage. Anbei unser Angebot über 1200 Euro netto.')
    await win.getByRole('button', { name: 'Zielordner wählen' }).click()
    await win.getByTestId('draft-folder').getByText(draftsDir).waitFor()
    await win.getByLabel('Erlaubnis für diese Aufgabe').check()
    await win.getByRole('button', { name: 'Aufgabe starten' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.getByText('E-Mail-Entwürfe speichern', { exact: true }).waitFor({ timeout: 15_000 })
    assert.deepEqual(readdirSync(draftsDir), [])
    await win.screenshot({ path: join(shots, '08-live-entwurf-freigabe.png') })
    await dlg.getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText(/Nichts wurde versendet/).first().waitFor({ timeout: 15_000 })
    const emls = readdirSync(draftsDir).sort()
    assert.deepEqual(emls, ['Entwurf 01 - Anna Muster.eml', 'Entwurf 02 - bob.eml'])
    const eml = readFileSync(join(draftsDir, emls[0]), 'utf8')
    assert.match(eml, /X-Unsent: 1/)
    assert.match(eml, /To: Anna Muster <anna@example.com>/)
  })

  await step('LIVE: Vorgang als Vorlage speichern, erneut ausführen, Zeitplan setzen', async () => {
    await nav('Aktivitäten')
    const row = win.locator('tbody tr', { hasText: 'Downloads-Test' }).filter({ has: win.getByRole('button', { name: 'Als Vorlage' }) }).first()
    await row.getByRole('button', { name: 'Als Vorlage' }).click()
    await win.getByLabel('Name der Vorlage').fill('Testordner aufräumen')
    await win.getByRole('button', { name: 'Speichern', exact: true }).click()
    await win.getByText(/Vorlage „Testordner aufräumen“ \(Version 1\) gespeichert/).waitFor()
    await nav('Automationen')
    const card = win.getByRole('article', { name: 'Vorlage Testordner aufräumen' })
    await card.waitFor()
    await card.getByLabel('Zeitplan Testordner aufräumen').selectOption('interval')
    await card.getByLabel('Minuten').fill('30')
    await card.getByRole('button', { name: 'Übernehmen' }).click()
    await card.getByText('alle 30 Minuten (bei geöffneter App)').waitFor()
    await win.screenshot({ path: join(shots, '09-vorlagen.png') })
    await card.getByRole('button', { name: 'Ausführen' }).click()
    const dlg = win.getByRole('alertdialog')
    await dlg.getByText('Dateien verschieben', { exact: true }).waitFor({ timeout: 15_000 })
    await dlg.getByRole('button', { name: 'Erlauben' }).click()
    // Maßgeblich ist die Festplatte (UI-Texte früherer Läufe stehen schon im Protokoll)
    await waitForDisk(allSorted, 'Verschieben über Vorlage')
    assert.ok(listing().every((f) => f.includes('/')), `Dateien wurden über die Vorlage einsortiert: ${listing()}`)
  })

  await step('DEMO: Ordner-Szenario mit Freigabe', async () => {
    await win.getByLabel('Vorlage').selectOption('wiederholen')
    await win.getByRole('button', { name: 'Demo-Modus öffnen' }).click()
    await win.getByText('DEMO-MODUS', { exact: true }).waitFor()
    await win.getByLabel('Vorlage').selectOption('ordner')
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByRole('alertdialog').getByText('DEMO', { exact: true }).waitFor({ timeout: 15_000 })
    await win.getByRole('alertdialog').getByRole('button', { name: 'Erlauben' }).click()
    await win.getByText('Sortierprotokoll.csv').first().waitFor({ timeout: 15_000 })
    await win.screenshot({ path: join(shots, '10-dashboard-demo.png') })
  })

  await step('DEMO: Recherche zeigt Schrittfehler; Kostendiagramm gezeichnet', async () => {
    await win.getByLabel('Vorlage').selectOption('recherche')
    await win.getByRole('button', { name: 'Demo starten' }).click()
    await win.getByText(/1 Quelle fehlgeschlagen/).first().waitFor({ timeout: 15_000 })
    await nav('Aktivitäten')
    await win.getByRole('region', { name: 'API-Kosten (simuliert)' }).locator('.recharts-area').waitFor()
    await win.screenshot({ path: join(shots, '11-aktivitaeten.png') })
  })

  await step('Kein Überlauf und keine Überlappung bei 1024×640', async () => {
    await nav('Start')
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
    await win.screenshot({ path: join(shots, '12-dashboard-1024.png') })
    await win.setViewportSize({ width: 1440, height: 900 })
  })

  await step('Demo beenden entfernt nur Demo-Daten, Live-Verlauf bleibt', async () => {
    await win.getByRole('button', { name: 'Demo beenden' }).click()
    await nav('Aktivitäten')
    await win.locator('tbody tr').first().waitFor()
    assert.equal(await win.locator('tbody').getByText('DEMO', { exact: true }).count(), 0)
    assert.equal(await win.locator('tbody tr').count(), 10)
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
  web.close()
  if (process.env['E2E_KEEP'] || process.exitCode) console.log('Sandbox behalten:', sandbox)
  else rmSync(sandbox, { recursive: true, force: true })
}
