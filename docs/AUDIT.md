# Audit NEXORA AI – 2026-10-31

Dieses Audit enthält **nur gemessene oder direkt abgelesene Werte**. Jede Angabe nennt ihre Quelle. Wo etwas nicht geprüft werden konnte, steht das ausdrücklich da.

Geprüfter Stand: Branch `claude/nexora-ai-masterplan-0x877e`.

---

## 1. Windows-Installationsaudit (frischer Windows-Rechner)

**Quelle:** GitHub Actions, CI-Lauf 18 (Commit `0893067`), Job „Windows-Installer“, Runner `windows-latest`, Skript `app/tests/e2e/install-audit.mjs`.
**Ergebnis: 24 von 24 Prüfungen bestanden.**

| # | Prüfung | Ergebnis | Messwert |
|---|---|---|---|
| 1 | Installer vorhanden | ✅ | `NEXORA AI Setup 0.1.0.exe`, 144,8 MB |
| 2 | Stille Installation ohne Fehler | ✅ | Exit-Code 0, Dauer 19,1 s |
| 3 | Programm pro Benutzer installiert (ohne Admin) | ✅ | `%LOCALAPPDATA%\Programs\NEXORA AI` |
| 4 | Worker im Installationsordner | ✅ | `resources\worker\nexora-worker.exe` |
| 5 | Lizenzhinweise im Installationsordner | ✅ | `THIRD_PARTY_NOTICES.md`, `licenses\` |
| 6 | Installierte Größe | ✅ | 472,7 MB |
| 7 | Frisches Nutzerprofil vor dem ersten Start | ✅ | war leer |
| 8 | Start bis „Bereit“ (Worker verbunden) | ✅ | 2,0 s |
| 9 | Gepackte Version, Nutzerdaten-Ordner | ✅ | `%APPDATA%\nexora-ai` |
| 10 | Windows-Benachrichtigungen vom System unterstützt | ✅ | nur die Systemfähigkeit geprüft, **nicht** die sichtbare Anzeige |
| 11 | Begrüßung beim Erststart | ✅ | |
| 12 | Übungsordner in „Dokumente“ angelegt | ✅ | `Documents\NEXORA Übungsordner` |
| 13 | Bestätigung erscheint, bevor etwas verändert wird | ✅ | 10 Dateien zu diesem Zeitpunkt unverändert |
| 14 | Ordner wirklich aufgeräumt (auf der Festplatte geprüft) | ✅ | 10 Dateien in 0,7 s (inkl. Bestätigung durch das Skript) |
| 15 | „Rückgängig“ stellt den Ursprungszustand her | ✅ | |
| 16 | Sichere Speicherung (Windows DPAPI) verfügbar | ✅ | |
| 17 | API-Schlüssel liegt nicht im Klartext auf der Festplatte | ✅ | `secrets.json` geprüft |
| 18 | Zweiter Start bis „Bereit“ | ✅ | 1,9 s |
| 19 | Schlüssel nach Neustart weiterhin hinterlegt | ✅ | |
| 20 | Begrüßung erscheint beim zweiten Start nicht erneut | ✅ | |
| 21 | Schlüssel lässt sich wieder entfernen | ✅ | |
| 22 | Kein Worker-Prozess nach dem Beenden | ✅ | `tasklist` |
| 23 | Stille Deinstallation | ✅ | Exit-Code 0 |
| 24 | Nutzerdaten bleiben nach der Deinstallation erhalten | ✅ | Verlauf/Vorlagen gehen nicht verloren |

**Befunde während des Audits:**

| Lauf | Ergebnis | Ursache | Art | Behoben |
|---|---|---|---|---|
| 16 | 12/13 | Ein früherer CI-Schritt hatte das echte Windows-Profil benutzt; die Begrüßung war daher schon „gesehen“. Unter Windows ignoriert Electron die Variable `APPDATA`. | Testaufbau | `0893067`: Profil wird vorher geleert; Test der gepackten App räumt sein Profil auf |
| 19 | 23/24 | Das Skript fragte den Verschlüsselungsstatus ab, bevor die Seite ihn geladen hatte. Dieselbe App speicherte den Schlüssel direkt danach erfolgreich verschlüsselt. | Testskript | `eafcbdd`: wartet auf den geladenen Status |

**Grenzen dieses Audits:**
- Der CI-Rechner `windows-latest` ist eine **Windows-Server-Umgebung**, kein Windows 10/11-Desktop eines Kunden.
- **Nicht geprüft:** die sichtbare Benachrichtigung, das SmartScreen-Verhalten des unsignierten Installers beim Doppelklick, ein Virenscanner eines Drittanbieters, eine deutsche Windows-Sprachversion, Texterkennung unter Windows (Tesseract ist auf dem Runner nicht installiert).

---

## 2. Sicherheitslücken in Abhängigkeiten

**Werkzeuge:** `pnpm audit` (npm) und `pip-audit` (Python), ausgeführt am 2026-10-31.

| Bereich | vorher | nachher | Maßnahme |
|---|---|---|---|
| Desktop-App, ausgelieferte Pakete (`pnpm audit --prod`) | 0 | 0 | – |
| Desktop-App inkl. Build-Werkzeuge (`pnpm audit`) | 4 (moderat, `minimatch` in electron-builder) | **0** | pnpm-Override `minimatch ^11.0.1`; Installer-Build und gepackte App danach erneut geprüft |
| Worker inkl. browser-use (`pip-audit`) | 71 Meldungen | **0** | pillow 12.3.0 → 13.0.0 (39), pypdf 6.16.2 → 6.21.4 (26), mcp 2.1.1 → 2.3.0 (4), anyio 4.12.1 → 4.14.2 (2) |
| Lizenzdienst (`pip-audit`, 59 Pakete) | 0 | 0 | – |

Weil browser-use ältere Versionen fest vorschreibt, werden die neueren per `uv`-Override erzwungen (`worker/pyproject.toml`). Danach habe ich geprüft, dass die von NEXORA genutzten browser-use-Schnittstellen weiter funktionieren (`Agent(calculate_cost=…)`, `Browser`, `BrowserProfile`). Ein echter KI-Lauf mit browser-use ist **nicht** getestet, weil in der Testumgebung kein API-Schlüssel vorhanden ist.

---

## 3. Code-Prüfung auf gefährliche Muster

**Quelle:** `git grep` über `app/src`, `worker/nexora_worker`, `license-server/nexora_license` (ohne Tests).

| Muster | Treffer |
|---|---|
| `eval(` / `new Function` | 0 |
| `innerHTML` / `dangerouslySetInnerHTML` | 0 |
| `shell=True` / `os.system` | 0 |
| `nodeIntegration: true` / `contextIsolation: false` / `webSecurity: false` / `allowRunningInsecureContent: true` | 0 |
| `pickle` / `yaml.load(` | 0 |
| `disable_security` | 1 – nur im Kommentar, der dokumentiert, dass es gegenüber ClawBridge **entfernt** wurde |

Externe Programme werden an genau drei Stellen gestartet, alle mit fester Argumentliste und ohne Shell:
- `app/src/main/worker/supervisor.ts`: der eigene Worker
- `worker/nexora_worker/ocr.py`, Zeilen 36 und 66: Tesseract

---

## 4. Electron-Sicherheit (aus dem Code abgelesen)

| Maßnahme | Stelle |
|---|---|
| `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` (auch in Workern/Subframes), `webSecurity: true`, `webviewTag: false` | `app/src/main/security.ts` |
| Content-Security-Policy als HTTP-Header **und** als Meta-Tag im Build (der Header greift bei `file://` nicht) | `app/src/main/index.ts`, `app/electron.vite.config.mts` |
| Neue Fenster blockiert (`setWindowOpenHandler` → deny), Navigation nur zur eigenen App, `<webview>` blockiert | `app/src/main/index.ts` |
| Alle Berechtigungsanfragen (Kamera, Mikrofon, Standort …) abgelehnt | `app/src/main/index.ts` |
| IPC nur über eine Allowlist mit 29 Kanälen; jede Anfrage und Antwort wird mit zod geprüft, der Absender-Frame wird kontrolliert | `app/src/shared/ipc-contract.ts`, `app/src/main/ipc.ts` |
| Pfade nur über native Dialoge; die Oberfläche kennt nur zufällige IDs | `app/src/main/ipc.ts` |
| Worker nur an 127.0.0.1, Einmal-Token je Start, Browser-Anfragen (Origin) abgelehnt | `worker/nexora_worker/api.py` |

---

## 5. Tests (Stand dieses Audits)

| Bereich | Anzahl | Quelle |
|---|---|---|
| Worker (pytest) | 72 bestanden + 1 nur unter Windows (Stand `75ac001`; beim Audit 55) | `uv run pytest` |
| Lizenzdienst (pytest) | 7 bestanden | `uv run pytest` |
| App-Unit-Tests (vitest) | 65 bestanden | `pnpm test` |
| E2E mit echter App, echtem Worker und echten Dateien | 25 Schritte | `tests/e2e/smoke.mjs`; läuft unter Linux und Windows in der CI |
| Windows-Installationsaudit | 24 Prüfungen | siehe Abschnitt 1 |

Umfang zum Audit-Zeitpunkt (Commit `a34cbda`): 8.575 Zeilen Quellcode und 2.459 Zeilen Testcode (`git ls-files … | wc -l`).

---

## 5a. Nachprüfung nach Übernahme der restlichen Repos (Stand `75ac001`)

| Prüfung | Ergebnis | Quelle |
|---|---|---|
| Gefährliche Muster (wie Abschnitt 3) | 0 Treffer; externe Programme weiterhin nur Tesseract (`ocr.py`, `system.py`) mit fester Argumentliste | `git grep` |
| `pip-audit` über alle 279 gesperrten Python-Pakete inkl. KI-Browser und Windows-Paketen (pywinauto, comtypes, pywin32) | keine bekannten Schwachstellen | `uv export --all-extras` + `pip-audit --no-deps` |
| `pnpm audit` | keine bekannten Schwachstellen | `pnpm audit` |
| Desktop-Bedienung im gebündelten Windows-Worker | pywinauto lädt, Fensterliste antwortet | CI-Lauf 25, `tests/test_process.py` |

Nicht geprüft: ein echter KI-Desktop-Lauf gegen die Anthropic-API (kein Schlüssel in der Testumgebung) und Mausklicks auf einem echten Kunden-Desktop.

## 6. Nachträglich gefundener Sicherheitsfehler

| Befund | Auswirkung | Behoben |
|---|---|---|
| Die Web-Recherche wählte in der Standardeinstellung „auto“ den KI-Browser still, sobald browser-use installiert und ein KI-Schlüssel hinterlegt war. | Frage und Seiteninhalte wären ohne Berechtigung „ai.cloud“ und ohne Freigabe an den KI-Anbieter gegangen. **Nicht betroffen:** der Windows-Installer, weil er browser-use nicht enthält. Betroffen war nur eine Entwicklungsinstallation mit `--extra browser`. | „auto“ ruft immer lokal ab. Der KI-Browser läuft nur auf ausdrückliche Wahl mit „ai.cloud“ und Freigabe. Zwei Regressionstests, die mit dem alten Code fehlschlagen. |

## 7. Korrekturen eigener Angaben

Beim Audit habe ich frühere Angaben gegen das Testskript im jeweiligen Commit geprüft:
- Die Zahl der E2E-Schritte war seit Commit `840558e` **jeweils um eins zu hoch** angegeben (19/20/21/22 statt richtig 18/19/20/21). In `PROGRESS.md` ist das korrigiert (`46bd3f7`). Die betroffenen Commit-Nachrichten bleiben unverändert, weil sich die Historie sonst umschreiben müsste.

---

## 8. Offene Punkte

| Punkt | Warum offen | Wer |
|---|---|---|
| Test auf echtem Windows 10/11-Desktop (SmartScreen, Benachrichtigung sichtbar, Virenscanner, deutsche Sprache) | in der CI nicht nachstellbar | Inhaber |
| Code-Signing-Zertifikat | Kauf/Identitätsprüfung nötig | Inhaber |
| Echte KI-Aufrufe (Anthropic/OpenAI, browser-use) | kein API-Schlüssel in der Testumgebung | Inhaber (eigener Schlüssel) |
| Texterkennung unter Windows | Tesseract auf dem Runner nicht installiert | lässt sich in der CI ergänzen |
| Ein einmaliger, nicht reproduzierter Fehlschlag des Python-Tests `test_websocket_requires_auth_and_replays` (1 von 11 lokalen Läufen) | danach durchgehend grün; Ursache unbekannt | Beobachtung in der CI |
| Rechtstexte, Stripe, Lizenzschlüssel, Pilot-Zielwerte | siehe `PROGRESS.md` | Inhaber |
