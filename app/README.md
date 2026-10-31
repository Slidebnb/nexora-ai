# NEXORA AI – Desktop-App

Voraussetzung (Windows, einmalig, jeweils in PowerShell):

1. `winget install OpenJS.NodeJS.LTS`
2. `npm install -g pnpm`

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

Alles im Demo-Modus ist simuliert und als **DEMO** gekennzeichnet. Echte Aufgaben folgen mit dem lokalen Worker (Phase 2).
