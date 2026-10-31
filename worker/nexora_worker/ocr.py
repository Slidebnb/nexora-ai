"""Optionale Texterkennung (OCR) für gescannte PDFs – komplett lokal.

Benötigt Tesseract OCR (Apache-2.0), das der Nutzer selbst installiert (nicht mitgeliefert).
Seiten werden mit pypdfium2 als Bild gerendert; Tesseract wird mit festen Argumenten aufgerufen
(keine Shell, keine Nutzereingaben in der Kommandozeile).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pypdfium2 as pdfium

WINDOWS_PATHS = [r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"]
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def tesseract_path() -> str | None:
    found = shutil.which("tesseract")
    if found:
        return found
    if sys.platform == "win32":
        for p in WINDOWS_PATHS:
            if os.path.isfile(p):
                return p
    return None


def languages(exe: str) -> str:
    try:
        out = subprocess.run([exe, "--list-langs"], capture_output=True, text=True, timeout=15, creationflags=_NO_WINDOW).stdout
    except (OSError, subprocess.SubprocessError):
        return "eng"
    have = {line.strip() for line in out.splitlines()[1:]}
    chosen = [l for l in ("deu", "eng") if l in have]
    return "+".join(chosen) or "eng"


class OcrError(Exception):
    pass


def ocr_pdf(path: Path, max_pages: int = 20, scale: float = 3.0) -> tuple[str, int]:
    """Gibt (erkannter Text, Anzahl erkannter Seiten) zurück."""
    exe = tesseract_path()
    if exe is None:
        raise OcrError("Texterkennung nicht verfügbar – Tesseract OCR ist nicht installiert")
    lang = languages(exe)
    try:
        doc = pdfium.PdfDocument(str(path))
    except pdfium.PdfiumError as e:
        raise OcrError(f"PDF konnte nicht gerendert werden: {e}") from e
    texts: list[str] = []
    pages = min(len(doc), max_pages)
    with tempfile.TemporaryDirectory(prefix="nexora-ocr-") as tmp:
        for i in range(pages):
            img = doc[i].render(scale=scale).to_pil()
            png = Path(tmp) / f"seite-{i + 1}.png"
            img.save(png)
            try:
                r = subprocess.run([exe, str(png), "stdout", "-l", lang], capture_output=True, text=True, timeout=120, creationflags=_NO_WINDOW)
            except subprocess.TimeoutExpired as e:
                raise OcrError(f"Texterkennung Seite {i + 1}: Zeitüberschreitung") from e
            if r.returncode != 0:
                raise OcrError(f"Texterkennung Seite {i + 1} fehlgeschlagen")
            texts.append(r.stdout)
    doc.close()
    return "\n".join(texts), pages
