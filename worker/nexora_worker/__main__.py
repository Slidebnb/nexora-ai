"""Start: `python -m nexora_worker --data-dir <pfad>` mit Umgebungsvariable NEXORA_WORKER_TOKEN.

Bindet an 127.0.0.1 auf einem freien Port und meldet sich mit genau einer Zeile auf stdout:
    NEXORA_WORKER_READY {"port": 12345}
Beendet sich selbst, wenn stdin geschlossen wird (Elternprozess beendet) → keine verwaisten Prozesse.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import logging.handlers
import os
import socket
import sys
import threading
from pathlib import Path

import uvicorn

from .api import create_app
from .approvals import ApprovalBroker
from .bus import EventBus
from .db import Database
from .runner import TaskManager
from .templates import TemplateStore
from .safety import redact_text
from .workflows import OrganizeFolder, UndoOrganize
from .workflows.drafts import DraftEmails
from .desktop import default_backend
from .workflows.desktop_routine import DesktopRoutine
from .workflows.desktop_ai import DesktopAi
from .workflows.pdf_analysis import PdfAnalysis
from .workflows.web_research import WebResearch


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact_text(json.dumps({
            "ts": self.formatTime(record), "level": record.levelname, "logger": record.name,
            "msg": record.getMessage(), **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
        }, ensure_ascii=False))


def build_manager(data_dir: Path) -> TaskManager:
    db = Database(data_dir / "nexora.db")
    bus = EventBus(db)
    manager = TaskManager(db, bus, ApprovalBroker(db, bus), data_dir)
    manager.register(OrganizeFolder())
    manager.register(UndoOrganize())
    manager.register(WebResearch())
    manager.register(PdfAnalysis())
    manager.register(DraftEmails())
    desktop = default_backend()
    manager.register(DesktopRoutine(desktop))
    manager.register(DesktopAi(desktop))
    return manager


def main() -> int:
    parser = argparse.ArgumentParser(prog="nexora_worker")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--watch-stdin", action="store_true", help="beenden, wenn stdin schließt")
    args = parser.parse_args()

    token = os.environ.pop("NEXORA_WORKER_TOKEN", "")
    if len(token) < 32:
        print("NEXORA_WORKER_TOKEN fehlt oder ist zu kurz", file=sys.stderr)
        return 2

    data_dir = Path(args.data_dir).resolve()
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(data_dir / "logs" / "worker.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(RedactingFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler])

    manager = build_manager(data_dir)
    manager.recover_interrupted()
    templates = TemplateStore(manager)
    app = create_app(manager, token, templates)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    config = uvicorn.Config(app, log_config=None, access_log=False, ws="websockets", lifespan="off", timeout_graceful_shutdown=3)
    server = uvicorn.Server(config)

    async def serve() -> None:
        loop = asyncio.get_running_loop()
        if args.watch_stdin:
            def watch() -> None:
                sys.stdin.read()  # blockiert bis EOF
                loop.call_soon_threadsafe(setattr, server, "should_exit", True)
            threading.Thread(target=watch, daemon=True).start()
        task = asyncio.create_task(server.serve(sockets=[sock]))
        scheduler = asyncio.create_task(templates.scheduler_loop())
        while not server.started:
            if task.done():
                await task  # Startfehler sichtbar machen
                return
            await asyncio.sleep(0.02)
        print("NEXORA_WORKER_READY " + json.dumps({"port": port}), flush=True)
        await task
        scheduler.cancel()
        await manager.shutdown()

    asyncio.run(serve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
