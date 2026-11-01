/*
 * „Fertige Aufgaben" (Rezepte): kuratierte, sofort nutzbare Anfragen an NEXORA. Jedes Rezept bildet auf eine BEREITS
 * vorhandene, echte Fähigkeit des Agenten ab (Web-Recherche, E-Mail-Entwurf/-Versand, Ordner aufräumen, PDF lesen,
 * Programm bedienen, verbundene Dienste). Es werden keine Fähigkeiten vorgetäuscht, die NEXORA nicht hat.
 * Ein Klick setzt den Text ins Eingabefeld (sendet NICHT automatisch) – der Kunde passt an und schickt selbst ab.
 */
export interface Recipe {
  id: string
  category: string
  title: string
  prompt: string
}

export const RECIPE_CATEGORIES = ['Recherche & Web', 'E-Mail', 'Dateien & PDF', 'PC steuern', 'Verbundene Dienste'] as const

export const RECIPES: Recipe[] = [
  // Recherche & Web  → Werkzeug web_recherche
  { id: 'r-preise', category: 'Recherche & Web', title: 'Preise/Tarife vergleichen', prompt: 'Vergleiche für mich die aktuellen Preise/Tarife von ' },
  { id: 'r-oeffnung', category: 'Recherche & Web', title: 'Öffnungszeiten finden', prompt: 'Finde die aktuellen Öffnungszeiten und die Adresse von ' },
  { id: 'r-firma', category: 'Recherche & Web', title: 'Firma/Thema zusammenfassen', prompt: 'Fasse mir in Stichpunkten das Wichtigste zusammen über: ' },
  { id: 'r-vergleich', category: 'Recherche & Web', title: 'Mehrere Webseiten gegenüberstellen', prompt: 'Vergleiche die Angebote auf diesen Webseiten und mach eine Übersicht: ' },
  { id: 'r-news', category: 'Recherche & Web', title: 'Aktuellen Stand recherchieren', prompt: 'Recherchiere den aktuellen Stand zu folgendem Thema und nenne die Quellen: ' },

  // E-Mail  → Werkzeuge email_entwurf / email_senden (Versand nur mit Freigabe)
  { id: 'e-entwurf', category: 'E-Mail', title: 'E-Mail-Entwurf schreiben', prompt: 'Schreib einen freundlichen E-Mail-Entwurf an kunde@example.com zum Thema ' },
  { id: 'e-antwort', category: 'E-Mail', title: 'Antwort formulieren', prompt: 'Formuliere eine höfliche Antwort auf folgende Nachricht: ' },
  { id: 'e-termin', category: 'E-Mail', title: 'Terminbestätigung senden', prompt: 'Sende eine kurze Terminbestätigung an kunde@example.com für den Termin am ' },
  { id: 'e-absage', category: 'E-Mail', title: 'Höfliche Absage schreiben', prompt: 'Schreib eine höfliche, kurze Absage an kunde@example.com bezüglich ' },
  { id: 'e-angebot', category: 'E-Mail', title: 'Angebot nachfassen', prompt: 'Schreib eine freundliche Nachfass-E-Mail an kunde@example.com zu unserem Angebot über ' },

  // Dateien & PDF  → Werkzeuge ordner_aufraeumen / pdf_lesen
  { id: 'd-download', category: 'Dateien & PDF', title: 'Download-Ordner aufräumen', prompt: 'Räum meinen Download-Ordner auf und sortiere die Dateien nach Typ.' },
  { id: 'd-sortieren', category: 'Dateien & PDF', title: 'Ordner nach Typ sortieren', prompt: 'Sortiere die Dateien in einem Ordner nach Typ in passende Unterordner.' },
  { id: 'd-pdf-summary', category: 'Dateien & PDF', title: 'PDF zusammenfassen', prompt: 'Lies eine PDF-Datei und fasse die wichtigsten Punkte zusammen.' },
  { id: 'd-pdf-vergleich', category: 'Dateien & PDF', title: 'Mehrere PDFs auswerten', prompt: 'Lies mehrere PDF-Dateien und erstelle eine Übersicht der Kernpunkte je Dokument.' },
  { id: 'd-rechnungen', category: 'Dateien & PDF', title: 'Rechnungen überblicken', prompt: 'Lies die ausgewählten Rechnungs-PDFs und liste Betrag, Datum und Absender je Rechnung auf.' },

  // PC steuern  → Werkzeuge offene_fenster / computer_steuern (jede Aktion mit Freigabe)
  { id: 'p-fenster', category: 'PC steuern', title: 'Offene Programme zeigen', prompt: 'Welche Programmfenster sind gerade offen?' },
  { id: 'p-bedienen', category: 'PC steuern', title: 'Programm bedienen', prompt: 'Bediene für mich ein geöffnetes Programm. Ziel: ' },

  // Verbundene Dienste  → Werkzeuge konnektoren_auflisten / konnektor_aufrufen
  { id: 'c-liste', category: 'Verbundene Dienste', title: 'Verbundene Dienste zeigen', prompt: 'Welche Dienste sind mit dir verbunden und was können sie?' },
  { id: 'c-nutzen', category: 'Verbundene Dienste', title: 'Verbundenen Dienst nutzen', prompt: 'Nutze einen meiner verbundenen Dienste, um Folgendes zu erledigen: ' }
]
