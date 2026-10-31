"""Baut den Worker als eigenständige Programmdatei und legt sie für electron-builder bereit.

Aufruf (im Ordner worker):  uv run --group build python build_sidecar.py
Ergebnis: ../app/build/worker/nexora-worker(.exe) + Laufzeitdateien
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
target = here.parent / "app" / "build" / "worker"

subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "nexora-worker.spec"], cwd=here, check=True)
if target.exists():
    shutil.rmtree(target)
shutil.copytree(here / "dist" / "nexora-worker", target)
print(f"Sidecar bereit: {target}")
