"""Event-Bus: persistiert jedes Event (fortlaufende seq) und verteilt es an Abonnenten."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from .db import Database, dumps
from .events import TERMINAL, Event, EventType, RunStatus
from .safety import redact


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class EventBus:
    def __init__(self, db: Database) -> None:
        self._db = db
        self._subscribers: set[asyncio.Queue[Event]] = set()

    def emit(
        self,
        *,
        run_id: str,
        task_id: str,
        type: EventType,
        status: RunStatus,
        payload: dict[str, Any] | None = None,
        agent_id: str | None = None,
        step_id: str | None = None,
    ) -> Event:
        event_id = f"evt-{uuid.uuid4().hex}"
        ts = now_iso()
        clean = redact(payload or {})
        cur = self._db.execute(
            "INSERT INTO events(id, run_id, task_id, ts, type, status, agent_id, step_id, payload_json) VALUES (?,?,?,?,?,?,?,?,?)",
            (event_id, run_id, task_id, ts, type, status, agent_id, step_id, dumps(clean)),
        )
        seq = int(cur.lastrowid or 0)
        self._db.execute(
            "UPDATE runs SET status = ?, ended_at = COALESCE(ended_at, ?) WHERE id = ?",
            (status, ts if status in TERMINAL else None, run_id),
        )
        event = Event(
            id=event_id, seq=seq, runId=run_id, taskId=task_id, timestamp=ts, type=type, status=status,
            agentId=agent_id, stepId=step_id, payload=clean,
        )
        for q in list(self._subscribers):
            q.put_nowait(event)
        return event

    def subscribe(self) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[Event]) -> None:
        self._subscribers.discard(q)

    def replay(self, after_seq: int = 0, run_id: str | None = None) -> list[Event]:
        sql = "SELECT * FROM events WHERE seq > ?"
        params: tuple[Any, ...] = (after_seq,)
        if run_id:
            sql += " AND run_id = ?"
            params += (run_id,)
        rows = self._db.query(sql + " ORDER BY seq", params)
        return [
            Event(
                id=r["id"], seq=r["seq"], runId=r["run_id"], taskId=r["task_id"], timestamp=r["ts"],
                type=r["type"], status=r["status"], agentId=r["agent_id"], stepId=r["step_id"],
                payload=json.loads(r["payload_json"]),
            )
            for r in rows
        ]
