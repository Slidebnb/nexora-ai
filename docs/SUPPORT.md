# Supportprozess (Beta)

**Kanal:** E-Mail [support@…] und ein Formular auf der Website. Antwortziel in der Beta: 1 Werktag.

**Erste Fragen an Nutzer**
1. Welche Version (Einstellungen, ganz unten)?
2. Welcher Workflow, was wurde erwartet und was ist passiert?
3. Ein Screenshot des Bereichs „Aktivitäten“

**Diagnosedaten (nur mit Zustimmung des Nutzers, er schickt sie selbst):**
- `%APPDATA%\NEXORA AI\worker\logs\worker.log`: JSON-Zeilen, Zugangsdaten und Schlüssel sind bereits geschwärzt
- Unter Aktivitäten: Titel und Status des betroffenen Vorgangs

**Häufige Fälle**
| Symptom | Ursache | Lösung |
|---|---|---|
| „Worker nicht verbunden“ | Virenscanner blockiert `nexora-worker.exe` | Ausnahme hinzufügen. Nach der Code-Signatur seltener |
| Sichere Speicherung nicht verfügbar | Windows-Profil ohne DPAPI (selten) | Windows-Benutzerprofil prüfen |
| „Freigabe unbekannt …“ | Doppelklick oder alter Stand | App lädt den Stand automatisch nach. Sonst Aktivitäten öffnen |
| Undo nicht angeboten | Dateien wurden nach dem Sortieren verändert | Undo-Protokoll unter Dateien → „Anzeigen“ |

**Eskalation:** Reproduzierbare Fehler werden als GitHub-Issue mit Workflow, Schritten und Log-Auszug angelegt, aber ohne Dateiinhalte.
