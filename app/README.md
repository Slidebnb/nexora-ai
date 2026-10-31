# NEXORA AI – Desktop-App

Voraussetzung (Windows, einmalig, jeweils in PowerShell):

1. `winget install OpenJS.NodeJS.LTS`
2. `npm install -g pnpm`

3. `winget install astral-sh.uv` (Python-Paketmanager für den lokalen Worker)
4. Im Ordner `worker`: `uv sync` (legt `worker/.venv` mit Python 3.12 an)

Im Ordner `app`:

| Zweck | Befehl |
|---|---|
| Abhängigkeiten installieren | `pnpm install` |
| App im Entwicklungsmodus starten | `pnpm dev` |
| Unit-Tests | `pnpm test` |
| Typecheck + Produktions-Build | `pnpm build` |
| Gebaute App starten | `pnpm preview` |
| End-to-End-Test (nach `pnpm build`) | `pnpm e2e` |

## Zum ersten Ausprobieren

1. `pnpm install`
2. `pnpm dev`
3. In der App unten auf **Demo-Modus öffnen** klicken, dann auf **Demo starten**.
4. Wenn das Freigabe-Fenster erscheint, **Erlauben** oder **Ablehnen** wählen.

Alles im Demo-Modus ist simuliert und als **DEMO** gekennzeichnet.

## Erste echte Aufgabe (Ordner-Organisator)

1. Lege zum Ausprobieren einen **Testordner** an, z. B. `C:\Users\<Name>\Desktop\NEXORA-Test`, und kopiere ein paar Dateien hinein.
2. `pnpm dev` – oben muss „Worker: verbunden“ stehen.
3. Vorlage „Ordner-Organisator“ → **Ordner wählen** → Häkchen bei der Erlaubnis → **Aufgabe starten**.
4. Im Freigabe-Fenster siehst du genau, was passieren soll. Erst nach **Erlauben** wird verschoben.
5. Unter **Aktivitäten** kannst du mit **Rückgängig** alles zurückverschieben.
