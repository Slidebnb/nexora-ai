# PyInstaller-Spezifikation für den NEXORA-Worker (Sidecar).
# Bauen: uv run --group build python build_sidecar.py
# Ergebnis: dist/nexora-worker/ (Ordner-Variante: schnellerer Start, weniger Fehlalarme bei Virenscannern als --onefile)
import sys

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None
# Desktop-Bedienung (nur Windows): pywinauto lädt UIA-Schnittstellen dynamisch über comtypes
desktop_imports = collect_submodules("pywinauto") + collect_submodules("comtypes") if sys.platform == "win32" else []

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
        "nexora_worker.workflows.desktop_routine",
        "nexora_worker.workflows.desktop_ai",
        "nexora_worker.connectors",
        "nexora_worker.mcp",
        "pypdfium2",
        "pypdfium2_raw",
    ] + desktop_imports,
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
