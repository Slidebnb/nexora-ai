"""Erzeugt minimale, gültige PDF-Dateien für Tests (ohne Zusatzbibliotheken)."""

from __future__ import annotations

from pathlib import Path


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(path: Path, pages: list[list[str]], title: str = "", author: str = "") -> Path:
    """Jede Seite: Liste von Textzeilen (leere Liste = Seite ohne Text, wie ein Scan)."""
    objs: list[bytes] = []
    n_pages = len(pages)
    # 1 Katalog, 2 Seitenbaum, 3 Schrift, danach je Seite: Page + Content, zuletzt Info
    page_ids = [4 + 2 * i for i in range(n_pages)]
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in page_ids)}] /Count {n_pages} >>".encode())
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    for i, lines in enumerate(pages):
        content = "BT /F1 11 Tf 50 780 Td 14 TL " + " ".join(f"({_esc(l)}) Tj T*" for l in lines) + " ET"
        data = content.encode("cp1252")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_ids[i] + 1} 0 R >>".encode())
        objs.append(b"<< /Length " + str(len(data)).encode() + b" >>\nstream\n" + data + b"\nendstream")
    info_id = len(objs) + 1
    objs.append(f"<< /Title ({_esc(title)}) /Author ({_esc(author)}) >>".encode("cp1252"))
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{off:010d} 00000 n \n".encode() for off in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info {info_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.write_bytes(bytes(out))
    return path
