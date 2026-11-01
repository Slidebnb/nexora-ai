# Vendored: agent-skills (Addy Osmani)

Diese Entwickler-Skills stammen aus dem Open-Source-Projekt **addyosmani/agent-skills**
und wurden ins Repo kopiert („vendored"), damit sie in jeder Claude-Code-Session
automatisch verfügbar sind – ohne Netz- oder Plugin-Abhängigkeit.

- Quelle: https://github.com/addyosmani/agent-skills
- Lizenz: MIT (Copyright (c) 2025 Addy Osmani) – siehe `agent-skills.LICENSE`
- Kopiert am: 2026-11-01 (flache Kopie des `main`-Standes)

## Was ist enthalten

- `skills/` – 25 Prozess-Skills (TDD, Code-Review, Security, Performance, CI/CD, …).
  Claude Code erkennt sie automatisch über `.claude/skills/<name>/SKILL.md`.
- `references/` – 7 geteilte Checklisten, auf die die Skills per relativem Pfad
  (`../../references/...`) zugreifen. **Nicht verschieben** – sonst brechen die Links.
- `agents/` – 4 Reviewer-Personas (code-reviewer, test-engineer, security-auditor,
  web-performance-auditor).

## Wichtig

- Das sind **Werkzeuge für die Entwicklung AM Repo**, kein Produkt-Code von NEXORA.
- Der Electron-Build bündelt nur `app/` und `worker/`; `.claude/` wird **nicht**
  mit dem Produkt ausgeliefert.
- Aktualisieren: Inhalt aus dem Upstream-Repo neu kopieren (gleiche Ordnerstruktur).
