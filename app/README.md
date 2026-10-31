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
