"""Event-Vertrag (Spiegel von app/src/shared/events.ts, siehe docs/ARCHITECTURE.md)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

RunStatus = Literal["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]
EventType = Literal[
    "run_created",
    "plan_ready",
    "step_started",
    "step_succeeded",
    "step_failed",
    "approval_requested",
    "approval_resolved",
    "artifact_created",
    "run_succeeded",
    "run_failed",
    "run_cancelled",
    "cost_updated",
    "run_paused",
    "run_resumed",
]
Decision = Literal["allow", "deny", "cancel"]
TERMINAL: frozenset[str] = frozenset({"succeeded", "failed", "cancelled"})


class Event(BaseModel):
    id: str
    seq: int
    runId: str
    taskId: str
    timestamp: str
    type: EventType
    status: RunStatus
    agentId: str | None = None
    stepId: str | None = None
    source: Literal["live"] = "live"
    payload: dict[str, Any]
