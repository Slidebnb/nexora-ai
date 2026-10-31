# PyInstaller-Spezifikation für den NEXORA-Worker (Sidecar).
# Bauen: uv run --group build python build_sidecar.py
# Ergebnis: dist/nexora-worker/ (Ordner-Variante: schnellerer Start, weniger Fehlalarme bei Virenscannern als --onefile)
import sys

block_cipher = None

a = Analysis(
    ["run_worker.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=[
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.lifespan.off",
        "nexora_worker.workflows.organizer",
        "nexora_worker.workflows.web_research",
        "nexora_worker.workflows.pdf_analysis",
        "nexora_worker.workflows.drafts",
        "pypdfium2",
        "pypdfium2_raw",
    ],
    excludes=["tkinter", "browser_use", "pytest"],  # KI-Browser wird nicht ins Basis-Paket gebündelt
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="nexora-worker",
    console=True,  # stdout wird für die READY-Zeile gebraucht; Fenster wird von Electron versteckt (windowsHide)
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="nexora-worker")
