"""Ausführung von Workflows: Lebenszyklus, Abbruch, Fehlerbehandlung, Wiederanlauf.

Konzept (Orchestrator mit Engine-Registry) nach NickRomanek/clawbridge @ a8a06c2 –
clawbridge/orchestrator/manager.py und engines/base.py (Apache-2.0, (c) 2026 RomaTek AI).
GEÄNDERT: eigene Implementierung ohne Remote-Bridge und ohne Fremdprozesse; jeder Run
erzeugt ausschließlich Events gemäß Vertrag; Erfolg nur mit Verifikation.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError

from .approvals import ApprovalBroker
from .bus import EventBus, now_iso
from .db import Database, dumps
from .events import TERMINAL, Decision, EventType, RunStatus
from .safety import redact_text

log = logging.getLogger("nexora.runner")


class RunCancelled(Exception):
    pass


class WorkflowError(Exception):
    """Erwarteter, für Nutzer verständlicher Fehler."""


@dataclass
class RunContext:
    run_id: str
    task_id: str
    agent_id: str
    data_dir: Path
    bus: EventBus
    approvals: ApprovalBroker
    secrets: dict[str, str]
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    finished: bool = False

    def _emit(self, type: EventType, status: RunStatus, payload: dict[str, Any] | None = None, step_id: str | None = None) -> None:
        self.bus.emit(run_id=self.run_id, task_id=self.task_id, agent_id=self.agent_id, type=type, status=status, payload=payload, step_id=step_id)

    def check_cancel(self) -> None:
        if self.cancel_event.is_set():
            raise RunCancelled()

    def plan(self, steps: list[tuple[str, str]]) -> None:
        self._emit("plan_ready", "running", {"steps": [{"id": i, "title": t} for i, t in steps]})

    def step_started(self, step_id: str, title: str) -> None:
        self.check_cancel()
        self._emit("step_started", "running", {"title": title}, step_id)

    def step_succeeded(self, step_id: str, summary: str = "") -> None:
        self._emit("step_succeeded", "running", {"summary": summary} if summary else {}, step_id)

    def step_failed(self, step_id: str, error: str) -> None:
        self._emit("step_failed", "running", {"error": error}, step_id)

    def artifact(self, kind: str, name: str, path: Path | None = None, uri: str | None = None) -> str:
        artifact_id = f"art-{uuid.uuid4().hex[:16]}"
        target = uri or (path.as_uri() if path else None)
        self.bus._db.execute(
            "INSERT INTO artifacts(id, run_id, kind, name, path, created_at) VALUES (?,?,?,?,?,?)",
            (artifact_id, self.run_id, kind, name, str(path) if path else uri, now_iso()),
        )
        payload: dict[str, Any] = {"artifactId": artifact_id, "kind": kind, "name": name}
        if target:
            payload["uri"] = target
        self._emit("artifact_created", "running", payload)
        return artifact_id

    def cost(self, total_usd: float) -> None:
        self._emit("cost_updated", "running", {"totalUsd": round(total_usd, 6)})

    async def approve(self, *, action: str, target: str, data: str, impact: str) -> Decision:
        self.check_cancel()
        decision = await self.approvals.request(
            run_id=self.run_id, task_id=self.task_id, agent_id=self.agent_id, action=action, target=target, data=data, impact=impact
        )
        if decision == "cancel":
            raise RunCancelled()
        return decision

    def succeed(self, verification: str, summary: str = "") -> None:
        """verification: nachprüfbarer Prüfbericht; summary: kurzer Satz für Kunden (aus denselben echten Zahlen)."""
        if not verification.strip():
            raise WorkflowError("Erfolg ohne Verifikation ist nicht zulässig")
        self._emit("run_succeeded", "succeeded", {"verification": verification, **({"summary": summary} if summary else {})})
        self.finished = True

    def fail(self, error: str) -> None:
        self._emit("run_failed", "failed", {"error": error})
        self.finished = True

    def cancelled(self, reason: str) -> None:
        self._emit("run_cancelled", "cancelled", {"reason": reason})
        self.finished = True


class Workflow(ABC):
    """Basis jedes Workflows. `capabilities` muss der Nutzer bei Aufgabenerstellung ausdrücklich erlauben."""

    name: ClassVar[str]
    agent_id: ClassVar[str]
    agent_name: ClassVar[str]
    capabilities: ClassVar[frozenset[str]]
    Input: ClassVar[type[BaseModel]]

    @abstractmethod
    def title(self, data: BaseModel) -> str: ...

    def resource_key(self, data: BaseModel) -> str | None:
        """Ressource, die nicht parallel bearbeitet werden darf (z. B. Ordner)."""
        return None

    def required_capabilities(self, data: BaseModel) -> frozenset[str]:
        """Kann je nach Eingabe zusätzliche Berechtigungen verlangen (z. B. Cloud-KI)."""
        return self.capabilities

    def related_run_id(self, data: BaseModel) -> str | None:
        """Bezug auf einen früheren Run (z. B. Undo)."""
        return None

    @abstractmethod
    async def run(self, ctx: RunContext, data: BaseModel) -> None: ...


class TaskError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class TaskManager:
    def __init__(self, db: Database, bus: EventBus, approvals: ApprovalBroker, data_dir: Path) -> None:
        self.db = db
        self.bus = bus
        self.approvals = approvals
        self.data_dir = data_dir
        self.secrets: dict[str, str] = {}
        self._workflows: dict[str, Workflow] = {}
        self._contexts: dict[str, RunContext] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def register(self, wf: Workflow) -> None:
        self._workflows[wf.name] = wf

    @property
    def workflows(self) -> dict[str, Workflow]:
        return dict(self._workflows)

    def recover_interrupted(self) -> int:
        """Runs, die beim letzten Beenden noch liefen, werden ehrlich als fehlgeschlagen markiert."""
        rows = self.db.query("SELECT id, task_id, agent_id FROM runs WHERE status NOT IN ('succeeded','failed','cancelled')")
        for r in rows:
            self.bus.emit(
                run_id=r["id"], task_id=r["task_id"], agent_id=r["agent_id"], type="run_failed", status="failed",
                payload={"error": "Worker wurde beendet, während der Vorgang lief. Bitte Ergebnis prüfen und ggf. neu starten."},
            )
        return len(rows)

    async def create(self, workflow: str, raw_input: dict[str, Any], granted: list[str]) -> tuple[str, str]:
        wf = self._workflows.get(workflow)
        if wf is None:
            raise TaskError(f"Unbekannter Workflow: {workflow}")
        try:
            data = wf.Input.model_validate(raw_input)
        except ValidationError as e:
            raise TaskError(f"Ungültige Eingabe: {e.errors()[0]['msg']}") from e
        missing = wf.required_capabilities(data) - set(granted)
        if missing:
            raise TaskError(f"Fehlende Berechtigungen: {', '.join(sorted(missing))}", 403)

        task_id = f"task-{uuid.uuid4().hex[:16]}"
        run_id = f"run-{uuid.uuid4().hex[:16]}"
        title = wf.title(data)
        ts = now_iso()
        self.db.execute(
            "INSERT INTO tasks(id, workflow, input_json, capabilities_json, created_at) VALUES (?,?,?,?,?)",
            (task_id, workflow, dumps(data.model_dump(mode="json")), dumps(sorted(granted)), ts),
        )
        self.db.execute(
            "INSERT INTO runs(id, task_id, workflow, title, agent_id, status, created_at) VALUES (?,?,?,?,?,?,?)",
            (run_id, task_id, workflow, title, wf.agent_id, "queued", ts),
        )
        ctx = RunContext(run_id, task_id, wf.agent_id, self.data_dir, self.bus, self.approvals, self.secrets)
        self._contexts[run_id] = ctx
        self.bus.emit(run_id=run_id, task_id=task_id, agent_id=wf.agent_id, type="run_created", status="queued", payload={"title": title, "agentName": wf.agent_name, "workflow": wf.name, **({"relatedRunId": rel} if (rel := wf.related_run_id(data)) else {})})
        self._tasks[run_id] = asyncio.create_task(self._execute(wf, ctx, data))
        return task_id, run_id

    async def _execute(self, wf: Workflow, ctx: RunContext, data: BaseModel) -> None:
        key = wf.resource_key(data)
        lock = self._locks.setdefault(key, asyncio.Lock()) if key else None
        try:
            if lock:
                async with lock:
                    await self._run(wf, ctx, data)
            else:
                await self._run(wf, ctx, data)
        finally:
            self._contexts.pop(ctx.run_id, None)
            self._tasks.pop(ctx.run_id, None)

    async def _run(self, wf: Workflow, ctx: RunContext, data: BaseModel) -> None:
        try:
            ctx.check_cancel()
            await wf.run(ctx, data)
            if not ctx.finished:
                ctx.fail("Interner Fehler: Workflow endete ohne Ergebnis")
        except RunCancelled:
            if not ctx.finished:
                ctx.cancelled("Vom Nutzer abgebrochen")
        except WorkflowError as e:
            if not ctx.finished:
                ctx.fail(redact_text(str(e)))
        except Exception as e:  # unerwartet: nie still weiterlaufen
            log.exception("Workflow %s fehlgeschlagen", wf.name)
            if not ctx.finished:
                ctx.fail(f"Unerwarteter Fehler: {redact_text(type(e).__name__ + ': ' + str(e))[:500]}")

    def cancel_task(self, task_id: str) -> str:
        row = self.db.query_one("SELECT id, status FROM runs WHERE task_id = ?", (task_id,))
        if row is None:
            raise TaskError("Aufgabe nicht gefunden", 404)
        if row["status"] in TERMINAL:
            raise TaskError("Vorgang ist bereits abgeschlossen", 409)
        ctx = self._contexts.get(row["id"])
        if ctx:
            ctx.cancel_event.set()
            self.approvals.cancel_run(row["id"])
        return row["id"]

    async def wait(self, run_id: str) -> None:
        t = self._tasks.get(run_id)
        if t:
            await asyncio.shield(t)

    async def shutdown(self) -> None:
        for ctx in list(self._contexts.values()):
            ctx.cancel_event.set()
            self.approvals.cancel_run(ctx.run_id)
        if self._tasks:
            await asyncio.wait(list(self._tasks.values()), timeout=10)
