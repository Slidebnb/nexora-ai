"""MVP-Workflow 5: Wiederholbare Vorlagen (versioniert) und optionaler Zeitplan bei laufender App.

- Vorlagen entstehen nur aus erfolgreich abgeschlossenen Vorgängen (Freigaben wurden dort erteilt).
- Gleicher Name → neue Version; ältere Versionen bleiben erhalten.
- Ausführen erzeugt einen normalen Vorgang: alle Freigaben werden erneut abgefragt.
- Zeitplan läuft nur, solange NEXORA geöffnet ist (kein Hintergrunddienst, keine 24/7-Versprechen).
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .bus import now_iso
from .db import dumps
from .runner import TaskError, TaskManager

log = logging.getLogger("nexora.templates")

NOT_TEMPLATABLE = {"undo_organize"}
# Felder, die beim erneuten Ausführen ersetzt werden dürfen (z. B. anderer Ordner)
OVERRIDABLE: dict[str, set[str]] = {
    "organize_folder": {"folder"},
    "web_research": {"question", "urls"},
    "pdf_analysis": {"files"},
    "draft_emails": {"subject", "briefing", "recipients", "outFolder"},
}


class Schedule(BaseModel):
    type: Literal["daily", "interval"]
    time: str | None = None  # HH:MM (lokal) für daily
    minutes: int | None = Field(default=None, ge=15, le=7 * 24 * 60)

    @field_validator("time")
    @classmethod
    def _time(cls, v: str | None) -> str | None:
        if v is None:
            return v
        h, _, m = v.partition(":")
        if not (h.isdigit() and m.isdigit() and 0 <= int(h) < 24 and 0 <= int(m) < 60 and len(m) == 2):
            raise ValueError("Uhrzeit im Format HH:MM")
        return f"{int(h):02d}:{m}"

    def check(self) -> None:
        if self.type == "daily" and not self.time:
            raise ValueError("Für täglich wird eine Uhrzeit benötigt")
        if self.type == "interval" and not self.minutes:
            raise ValueError("Für Intervall werden Minuten benötigt (mind. 15)")


def next_due(schedule: Schedule, last_run: datetime | None, now: datetime) -> datetime:
    if schedule.type == "interval":
        assert schedule.minutes
        return (last_run or now - timedelta(minutes=schedule.minutes)) + timedelta(minutes=schedule.minutes)
    assert schedule.time
    h, m = map(int, schedule.time.split(":"))
    today = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if last_run and last_run >= today:
        return today + timedelta(days=1)
    return today


class TemplateStore:
    def __init__(self, manager: TaskManager) -> None:
        self.m = manager
        self.db = manager.db

    def _row(self, r: Any) -> dict[str, Any]:
        versions = self.db.query_one("SELECT COUNT(*) AS n FROM templates WHERE name = ?", (r["name"],))["n"]
        return {
            "templateId": r["id"], "name": r["name"], "version": r["version"], "versions": versions,
            "workflow": r["workflow"], "input": json.loads(r["input_json"]), "capabilities": json.loads(r["capabilities_json"]),
            "sourceRunId": r["source_run_id"],
            "schedule": {k: v for k, v in json.loads(r["schedule_json"]).items() if k != "anchor"} if r["schedule_json"] else None,
            "scheduleAnchor": json.loads(r["schedule_json"]).get("anchor") if r["schedule_json"] else None,
            "lastRunAt": r["last_run_at"], "createdAt": r["created_at"],
        }

    def list(self) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT t.* FROM templates t JOIN (SELECT name, MAX(version) AS v FROM templates GROUP BY name) x "
            "ON t.name = x.name AND t.version = x.v ORDER BY t.name"
        )
        return [self._row(r) for r in rows]

    def get(self, template_id: str) -> dict[str, Any]:
        r = self.db.query_one("SELECT * FROM templates WHERE id = ?", (template_id,))
        if r is None:
            raise TaskError("Vorlage nicht gefunden", 404)
        return self._row(r)

    def create_from_run(self, run_id: str, name: str) -> dict[str, Any]:
        name = name.strip()
        if not 1 <= len(name) <= 80 or "\n" in name:
            raise TaskError("Name muss 1–80 Zeichen lang sein")
        run = self.db.query_one(
            "SELECT r.status, r.workflow, t.input_json, t.capabilities_json FROM runs r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?", (run_id,)
        )
        if run is None:
            raise TaskError("Vorgang nicht gefunden", 404)
        if run["status"] != "succeeded":
            raise TaskError("Nur erfolgreich abgeschlossene Vorgänge können als Vorlage gespeichert werden", 409)
        if run["workflow"] in NOT_TEMPLATABLE:
            raise TaskError("Dieser Vorgang eignet sich nicht als Vorlage", 409)
        prev = self.db.query_one("SELECT MAX(version) AS v, schedule_json FROM templates WHERE name = ?", (name,))
        version = (prev["v"] or 0) + 1
        tid = f"tpl-{uuid.uuid4().hex[:16]}"
        self.db.execute(
            "INSERT INTO templates(id, name, version, workflow, input_json, capabilities_json, source_run_id, schedule_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (tid, name, version, run["workflow"], run["input_json"], run["capabilities_json"], run_id, None, now_iso()),
        )
        return self.get(tid)

    async def run(self, template_id: str, overrides: dict[str, Any] | None = None) -> tuple[str, str]:
        t = self.get(template_id)
        overrides = overrides or {}
        bad = set(overrides) - OVERRIDABLE.get(t["workflow"], set())
        if bad:
            raise TaskError(f"Diese Eingaben können nicht ersetzt werden: {', '.join(sorted(bad))}")
        result = await self.m.create(t["workflow"], {**t["input"], **overrides}, t["capabilities"])
        self.db.execute("UPDATE templates SET last_run_at = ? WHERE id = ?", (now_iso(), template_id))
        return result

    def set_schedule(self, template_id: str, schedule: Schedule | None) -> dict[str, Any]:
        self.get(template_id)
        if schedule:
            try:
                schedule.check()
            except ValueError as e:
                raise TaskError(str(e)) from e
        # Startpunkt („anchor“) getrennt von der letzten Ausführung speichern: sonst würde sofort
        # nachgeholt bzw. fälschlich „zuletzt ausgeführt“ angezeigt.
        stored = {**schedule.model_dump(exclude_none=True), "anchor": now_iso()} if schedule else None
        self.db.execute("UPDATE templates SET schedule_json = ? WHERE id = ?", (dumps(stored) if stored else None, template_id))
        return self.get(template_id)

    def delete(self, template_id: str) -> None:
        t = self.get(template_id)
        self.db.execute("DELETE FROM templates WHERE name = ?", (t["name"],))

    async def tick(self, now: datetime | None = None) -> list[str]:
        """Startet fällige Vorlagen. Gibt die erzeugten Run-IDs zurück."""
        now = now or datetime.now()
        started: list[str] = []
        for t in self.list():
            if not t["schedule"]:
                continue
            sched = Schedule.model_validate(t["schedule"])
            ref = t["lastRunAt"] or t["scheduleAnchor"]
            last = datetime.fromisoformat(ref.replace("Z", "+00:00")).astimezone().replace(tzinfo=None) if ref else None
            if now >= next_due(sched, last, now):
                try:
                    _, run_id = await self.run(t["templateId"])
                    started.append(run_id)
                except TaskError as e:
                    log.warning("Geplante Vorlage %s nicht gestartet: %s", t["name"], e)
                    self.db.execute("UPDATE templates SET last_run_at = ? WHERE id = ?", (now_iso(), t["templateId"]))
        return started

    async def scheduler_loop(self, interval: float = 30.0) -> None:
        while True:
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 – Zeitplan darf den Worker nie beenden
                log.exception("Zeitplan-Fehler")
            await asyncio.sleep(interval)
