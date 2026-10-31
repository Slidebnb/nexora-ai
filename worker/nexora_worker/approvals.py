"""Freigaben: Jede Schreib-/Sende-/Löschaktion wartet hier auf eine ausdrückliche Nutzerentscheidung."""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass

from .bus import EventBus, now_iso
from .db import Database, dumps
from .events import Decision


class ApprovalError(Exception):
    pass


@dataclass
class PendingApproval:
    id: str
    run_id: str
    task_id: str
    agent_id: str
    future: asyncio.Future[Decision]


class ApprovalBroker:
    def __init__(self, db: Database, bus: EventBus) -> None:
        self._db = db
        self._bus = bus
        self._pending: dict[str, PendingApproval] = {}

    async def request(
        self, *, run_id: str, task_id: str, agent_id: str, action: str, target: str, data: str, impact: str
    ) -> Decision:
        approval_id = f"apr-{uuid.uuid4().hex[:16]}"
        payload = {"approvalId": approval_id, "action": action, "target": target, "data": data, "impact": impact}
        future: asyncio.Future[Decision] = asyncio.get_running_loop().create_future()
        self._pending[approval_id] = PendingApproval(approval_id, run_id, task_id, agent_id, future)
        self._db.execute(
            "INSERT INTO approvals(id, run_id, payload_json, requested_at) VALUES (?,?,?,?)",
            (approval_id, run_id, dumps(payload), now_iso()),
        )
        self._bus.emit(run_id=run_id, task_id=task_id, agent_id=agent_id, type="approval_requested", status="waiting_approval", payload=payload)
        try:
            return await future
        finally:
            self._pending.pop(approval_id, None)

    def respond(self, approval_id: str, decision: Decision) -> None:
        pending = self._pending.get(approval_id)
        if pending is None or pending.future.done():
            raise ApprovalError("Freigabe unbekannt oder bereits entschieden")
        self._resolve(pending, decision)

    def cancel_run(self, run_id: str) -> None:
        for p in list(self._pending.values()):
            if p.run_id == run_id and not p.future.done():
                self._resolve(p, "cancel")

    def _resolve(self, p: PendingApproval, decision: Decision) -> None:
        self._db.execute("UPDATE approvals SET decision = ?, resolved_at = ? WHERE id = ?", (decision, now_iso(), p.id))
        self._bus.emit(
            run_id=p.run_id, task_id=p.task_id, agent_id=p.agent_id, type="approval_resolved", status="running",
            payload={"approvalId": p.id, "decision": decision},
        )
        p.future.set_result(decision)

    def pending_for(self, run_id: str) -> list[str]:
        return [p.id for p in self._pending.values() if p.run_id == run_id]

    def get(self, approval_id: str) -> dict | None:
        row = self._db.query_one("SELECT * FROM approvals WHERE id = ?", (approval_id,))
        if row is None:
            return None
        return {**json.loads(row["payload_json"]), "runId": row["run_id"], "decision": row["decision"]}
