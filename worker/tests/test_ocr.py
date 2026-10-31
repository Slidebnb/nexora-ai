import csv

import pytest
from PIL import Image, ImageDraw, ImageFont

from nexora_worker.ocr import OcrError, ocr_pdf, tesseract_path

needs_tesseract = pytest.mark.skipif(tesseract_path() is None, reason="Tesseract OCR nicht installiert")


def scanned_pdf(path):
    """Erzeugt eine PDF ohne Textebene (nur ein Bild mit Schrift) – wie ein Scan."""
    img = Image.new("RGB", (1654, 2339), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 64)
    except OSError:
        font = ImageFont.load_default(size=64)
    for i, line in enumerate(["Rechnung Nummer 4711", "Betrag 250 Euro", "Zahlbar bis 30. November"]):
        d.text((150, 200 + i * 120), line, fill="black", font=font)
    img.save(path, "PDF", resolution=200)
    return path


@needs_tesseract
def test_ocr_reads_scanned_pdf(tmp_path):
    text, pages = ocr_pdf(scanned_pdf(tmp_path / "scan.pdf"))
    assert pages == 1
    assert "4711" in text and "Rechnung" in text


@needs_tesseract
def test_pdf_analysis_uses_ocr_only_when_requested(api, tmp_path, data_dir):
    scan = scanned_pdf(tmp_path / "Scan-Rechnung.pdf")
    caps = ["pdf.read", "files.export"]
    r1 = api.post("/api/tasks", {"workflow": "pdf_analysis", "input": {"files": [str(scan)]}, "capabilities": caps}).json()
    api.wait_terminal(r1["runId"])
    row = list(csv.reader(open(data_dir / "runs" / r1["runId"] / "PDF-Analyse.csv", encoding="utf-8-sig"), delimiter=";"))[1]
    assert row[4] == "0" and "OCR nicht aktiviert" in row[10]

    r2 = api.post("/api/tasks", {"workflow": "pdf_analysis", "input": {"files": [str(scan)], "useOcr": True}, "capabilities": caps}).json()
    end = api.wait_terminal(r2["runId"])[-1]
    assert end["type"] == "run_succeeded", end
    row = list(csv.reader(open(data_dir / "runs" / r2["runId"] / "PDF-Analyse.csv", encoding="utf-8-sig"), delimiter=";"))[1]
    assert int(row[4]) >= 6, "erkannte Wörter werden gezählt"
    assert "rechnung" in row[7].lower(), "Kernbegriffe stammen aus dem erkannten Text"
    assert "Texterkennung (OCR)" in row[10]


def test_missing_tesseract_is_reported_honestly(api, tmp_path, data_dir, monkeypatch):
    import nexora_worker.ocr as ocr

    monkeypatch.setattr(ocr, "tesseract_path", lambda: None)
    with pytest.raises(OcrError, match="nicht installiert"):
        ocr.ocr_pdf(tmp_path / "egal.pdf")
    scan = scanned_pdf(tmp_path / "Scan.pdf")
    r = api.post("/api/tasks", {"workflow": "pdf_analysis", "input": {"files": [str(scan)], "useOcr": True}, "capabilities": ["pdf.read", "files.export"]}).json()
    assert api.wait_terminal(r["runId"])[-1]["type"] == "run_succeeded"
    row = list(csv.reader(open(data_dir / "runs" / r["runId"] / "PDF-Analyse.csv", encoding="utf-8-sig"), delimiter=";"))[1]
    assert "Tesseract OCR ist nicht installiert" in row[10]
