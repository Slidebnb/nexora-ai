"""Echter Systemstatus (Masterplan-Modul „SystemStatus“): keine geschätzten oder erfundenen Werte."""

from __future__ import annotations

import importlib.metadata
import platform
import shutil
import subprocess
import sys
import time
from typing import Any

import httpx

from . import __version__
from .ocr import _NO_WINDOW, tesseract_path
from .runner import TaskManager

STARTED = time.monotonic()


def _version(dist: str) -> str | None:
    try:
        return importlib.metadata.version(dist)
    except importlib.metadata.PackageNotFoundError:
        return None


def _tesseract_version(exe: str) -> str | None:
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW)
        first = (out.stdout or out.stderr).splitlines()
        return first[0].strip() if first else None
    except (OSError, subprocess.SubprocessError):
        return None


def system_status(manager: TaskManager) -> dict[str, Any]:
    db = manager.db
    disk = shutil.disk_usage(manager.data_dir)
    tess = tesseract_path()
    return {
        "worker": {
            "version": __version__,
            "python": platform.python_version(),
            "platform": f"{platform.system()} {platform.release()}",
            "uptimeSeconds": int(time.monotonic() - STARTED),
            "frozen": bool(getattr(sys, "frozen", False)),
        },
        "database": {
            "schemaVersion": db.schema_version,
            # SQLite im WAL-Modus: neue Daten stehen zunächst in der -wal-Datei
            "bytes": sum(f.stat().st_size for f in (db.path, db.path.with_name(db.path.name + "-wal")) if f.exists()),
            "runs": db.query_one("SELECT COUNT(*) AS n FROM runs")["n"],
            "events": db.query_one("SELECT COUNT(*) AS n FROM events")["n"],
            "templates": db.query_one("SELECT COUNT(*) AS n FROM templates")["n"],
        },
        "disk": {"total": disk.total, "used": disk.used, "free": disk.free},
        "ocr": {"available": tess is not None, "version": _tesseract_version(tess) if tess else None},
        "browserUse": {"installed": _version("browser-use") is not None, "version": _version("browser-use")},
        "ai": {"anthropic": bool(manager.secrets.get("anthropic")), "openai": bool(manager.secrets.get("openai"))},
        "workflows": sorted(manager.workflows),
    }


def check_ai_connection(provider: str, secrets: dict[str, str], client: httpx.Client | None = None) -> dict[str, Any]:
    """Prüft Schlüssel und Erreichbarkeit über die Modellliste des Anbieters (verursacht keine Token-Kosten)."""
    key = secrets.get(provider)
    if not key:
        return {"ok": False, "message": "Kein Schlüssel hinterlegt"}
    own = client is None
    client = client or httpx.Client(timeout=15)
    try:
        if provider == "anthropic":
            r = client.get("https://api.anthropic.com/v1/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
        else:
            r = client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Anbieter nicht erreichbar ({type(e).__name__})"}
    finally:
        if own:
            client.close()
    if r.status_code == 200:
        return {"ok": True, "message": "Verbindung erfolgreich – Schlüssel gültig"}
    if r.status_code in (401, 403):
        return {"ok": False, "message": "Schlüssel wurde abgelehnt (ungültig oder ohne Berechtigung)"}
    return {"ok": False, "message": f"Unerwartete Antwort des Anbieters (HTTP {r.status_code})"}
