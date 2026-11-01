"""REST + WebSocket-Schnittstelle. Nur 127.0.0.1, Bearer-Token, keine Browser-Origins.

Gegenüber ClawBridge (server/app.py: CORS allow_origins=["*"], ohne Auth) bewusst gehärtet:
- Jede Anfrage braucht das Einmal-Token des App-Starts (Vergleich in konstanter Zeit).
- Anfragen mit Origin-Header (also aus Webseiten/Browsern) werden abgelehnt → kein CSRF/DNS-Rebinding.
- Host-Header muss 127.0.0.1 oder localhost sein.
- WebSocket: Authentifizierung über erste Nachricht (Token nie in URL/Logs).
"""

from __future__ import annotations

import asyncio
import hmac
import json
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import __version__
from .approvals import ApprovalError
from .events import Decision
from .runner import TaskError, TaskManager
from .templates import Schedule, TemplateStore
from .connectors import ConnectorAction, ConnectorStore
from .workflows.send_email import SmtpConfig
from .system import system_status, check_ai_connection
from .desktop import DesktopError, public_element

ALLOWED_HOSTS = {"127.0.0.1", "localhost"}


class CreateTaskRequest(BaseModel):
    workflow: str
    input: dict[str, Any] = Field(default_factory=dict)
    capabilities: list[str] = Field(default_factory=list)


class ApprovalResponse(BaseModel):
    decision: Decision


class SecretsRequest(BaseModel):
    """Main-Prozess übergibt Schlüssel pro Sitzung; sie werden nie gespeichert oder geloggt."""
    anthropic: str | None = None
    openai: str | None = None
    # Konnektor-Token je Konnektor-ID (aus dem sicheren Speicher der App), optional
    connectors: dict[str, str] = Field(default_factory=dict)
    # SMTP-Konfiguration (aus dem sicheren Speicher der App), optional
    smtp: dict[str, Any] | None = None


class ConnectorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=2000)
    token: str | None = Field(default=None, max_length=4000)


class ConnectorToolRequest(BaseModel):
    connectorId: str = Field(min_length=1, max_length=40)


class TemplateFromRun(BaseModel):
    runId: str
    name: str


class TemplateRun(BaseModel):
    overrides: dict[str, Any] = Field(default_factory=dict)


class AiTestRequest(BaseModel):
    provider: Literal["anthropic", "openai"]


class ScheduleBody(BaseModel):
    schedule: Schedule | None


def create_app(manager: TaskManager, token: str, templates: TemplateStore | None = None, connectors: ConnectorStore | None = None) -> FastAPI:
    templates = templates or TemplateStore(manager)
    connectors = connectors or ConnectorStore(manager)
    if "connector_action" not in manager.workflows:
        manager.register(ConnectorAction(connectors))
    app = FastAPI(title="NEXORA Worker", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)

    def _token_ok(value: str | None) -> bool:
        return bool(value) and hmac.compare_digest(value.encode(), token.encode())

    def _host_ok(host_header: str | None) -> bool:
        host = (host_header or "").rsplit(":", 1)[0].strip("[]")
        return host in ALLOWED_HOSTS

    @app.middleware("http")
    async def guard(request: Request, call_next):  # type: ignore[no-untyped-def]
        if not _host_ok(request.headers.get("host")):
            return JSONResponse({"detail": "Host nicht erlaubt"}, status_code=403)
        if "origin" in request.headers:
            return JSONResponse({"detail": "Browser-Zugriff nicht erlaubt"}, status_code=403)
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer ") or not _token_ok(auth[7:]):
            return JSONResponse({"detail": "Nicht autorisiert"}, status_code=401)
        return await call_next(request)

    def _err(e: TaskError) -> HTTPException:
        return HTTPException(status_code=e.status_code, detail=str(e))

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "version": __version__, "workflows": sorted(manager.workflows)}

    @app.get("/api/workflows")
    async def workflows() -> list[dict[str, Any]]:
        return [
            {"name": wf.name, "agentId": wf.agent_id, "agentName": wf.agent_name, "capabilities": sorted(wf.capabilities)}
            for wf in manager.workflows.values()
        ]

    @app.post("/api/tasks", status_code=201)
    async def create_task(req: CreateTaskRequest) -> dict[str, str]:
        try:
            task_id, run_id = await manager.create(req.workflow, req.input, req.capabilities)
        except TaskError as e:
            raise _err(e) from e
        return {"taskId": task_id, "runId": run_id}

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str) -> dict[str, Any]:
        row = manager.db.query_one(
            "SELECT t.id, t.workflow, t.input_json, t.capabilities_json, t.created_at, r.id AS run_id, r.status, r.title, r.ended_at "
            "FROM tasks t JOIN runs r ON r.task_id = t.id WHERE t.id = ?",
            (task_id,),
        )
        if row is None:
            raise HTTPException(404, "Aufgabe nicht gefunden")
        return {
            "taskId": row["id"], "workflow": row["workflow"], "input": json.loads(row["input_json"]),
            "capabilities": json.loads(row["capabilities_json"]), "createdAt": row["created_at"],
            "runId": row["run_id"], "status": row["status"], "title": row["title"], "endedAt": row["ended_at"],
        }

    @app.post("/api/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str) -> dict[str, str]:
        try:
            run_id = manager.cancel_task(task_id)
        except TaskError as e:
            raise _err(e) from e
        return {"runId": run_id, "status": "cancelling"}

    @app.post("/api/tasks/{task_id}/pause")
    async def pause_task(task_id: str) -> dict[str, str]:
        try:
            return {"runId": manager.pause_task(task_id), "status": "paused"}
        except TaskError as e:
            raise _err(e) from e

    @app.post("/api/tasks/{task_id}/resume")
    async def resume_task(task_id: str) -> dict[str, str]:
        try:
            return {"runId": manager.resume_task(task_id), "status": "running"}
        except TaskError as e:
            raise _err(e) from e

    @app.post("/api/approvals/{approval_id}/respond")
    async def respond(approval_id: str, body: ApprovalResponse) -> dict[str, str]:
        try:
            manager.approvals.respond(approval_id, body.decision)
        except ApprovalError as e:
            raise HTTPException(409, str(e)) from e
        return {"approvalId": approval_id, "decision": body.decision}

    @app.get("/api/runs")
    async def runs(limit: int = 100) -> list[dict[str, Any]]:
        rows = manager.db.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (max(1, min(limit, 500)),))
        return [
            {"runId": r["id"], "taskId": r["task_id"], "workflow": r["workflow"], "title": r["title"], "agentId": r["agent_id"],
             "status": r["status"], "createdAt": r["created_at"], "endedAt": r["ended_at"]}
            for r in rows
        ]

    @app.get("/api/runs/{run_id}/events")
    async def run_events(run_id: str, after: int = 0) -> list[dict[str, Any]]:
        if manager.db.query_one("SELECT 1 FROM runs WHERE id = ?", (run_id,)) is None:
            raise HTTPException(404, "Run nicht gefunden")
        return [e.model_dump(exclude_none=True) for e in manager.bus.replay(after, run_id)]

    @app.get("/api/templates")
    async def list_templates() -> list[dict[str, Any]]:
        return templates.list()

    @app.post("/api/templates", status_code=201)
    async def create_template(body: TemplateFromRun) -> dict[str, Any]:
        try:
            return templates.create_from_run(body.runId, body.name)
        except TaskError as e:
            raise _err(e) from e

    @app.post("/api/templates/{template_id}/run", status_code=201)
    async def run_template(template_id: str, body: TemplateRun) -> dict[str, str]:
        try:
            task_id, run_id = await templates.run(template_id, body.overrides)
        except TaskError as e:
            raise _err(e) from e
        return {"taskId": task_id, "runId": run_id}

    @app.put("/api/templates/{template_id}/schedule")
    async def schedule_template(template_id: str, body: ScheduleBody) -> dict[str, Any]:
        try:
            return templates.set_schedule(template_id, body.schedule)
        except TaskError as e:
            raise _err(e) from e

    @app.delete("/api/templates/{template_id}", status_code=204)
    async def delete_template(template_id: str) -> None:
        try:
            templates.delete(template_id)
        except TaskError as e:
            raise _err(e) from e

    @app.get("/api/system")
    async def system() -> dict[str, Any]:
        return await asyncio.to_thread(system_status, manager)

    def _desktop() -> Any:
        wf = manager.workflows.get("desktop_routine")
        if wf is None:
            raise HTTPException(404, "Desktop-Bedienung nicht verfügbar")
        return wf.backend  # type: ignore[attr-defined]

    @app.get("/api/desktop/windows")
    async def desktop_windows() -> list[dict[str, Any]]:
        try:
            return await asyncio.to_thread(_desktop().list_windows)
        except DesktopError as e:
            raise HTTPException(409, str(e)) from e

    @app.get("/api/desktop/elements")
    async def desktop_elements(window: str = Query(min_length=1, max_length=200)) -> list[dict[str, Any]]:
        try:
            els = await asyncio.to_thread(_desktop().elements, window, 300)
        except DesktopError as e:
            raise HTTPException(409, str(e)) from e
        return [public_element(e) for e in els]

    @app.post("/api/ai/test")
    async def ai_test(body: AiTestRequest) -> dict[str, Any]:
        return await asyncio.to_thread(check_ai_connection, body.provider, manager.secrets)

    @app.post("/api/email/test")
    async def email_test(body: SmtpConfig) -> dict[str, Any]:
        wf = manager.workflows.get("send_email")
        if wf is None:
            raise HTTPException(404, "E-Mail-Versand nicht verfügbar")
        try:
            await asyncio.to_thread(wf.sender.verify, body)  # type: ignore[attr-defined]
            return {"ok": True, "message": f"Anmeldung bei {body.host} erfolgreich"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "message": f"Anmeldung fehlgeschlagen ({type(e).__name__})"}

    @app.put("/api/session/secrets", status_code=204)
    async def set_secrets(body: SecretsRequest) -> None:
        manager.secrets.clear()
        if body.anthropic:
            manager.secrets["anthropic"] = body.anthropic
        if body.openai:
            manager.secrets["openai"] = body.openai
        for cid, tok in body.connectors.items():
            if tok:
                manager.secrets[f"connector:{cid}"] = tok
        if body.smtp:
            manager.secrets["smtp"] = json.dumps(body.smtp)

    @app.get("/api/connectors")
    async def list_connectors() -> list[dict[str, Any]]:
        return connectors.list()

    @app.post("/api/connectors", status_code=201)
    async def add_connector(body: ConnectorRequest) -> dict[str, Any]:
        try:
            return connectors.add(body.name, body.url, body.token)
        except TaskError as e:
            raise _err(e) from e

    @app.delete("/api/connectors/{connector_id}", status_code=204)
    async def remove_connector(connector_id: str) -> None:
        try:
            connectors.remove(connector_id)
        except TaskError as e:
            raise _err(e) from e

    @app.post("/api/connectors/{connector_id}/test")
    async def test_connector(connector_id: str) -> dict[str, Any]:
        try:
            return await connectors.test(connector_id)
        except TaskError as e:
            raise _err(e) from e

    @app.get("/api/connectors/{connector_id}/tools")
    async def connector_tools(connector_id: str) -> list[dict[str, Any]]:
        try:
            return await connectors.tools(connector_id)
        except TaskError as e:
            raise _err(e) from e

    @app.websocket("/api/events")
    async def events_ws(ws: WebSocket) -> None:
        if not _host_ok(ws.headers.get("host")) or "origin" in ws.headers:
            await ws.close(code=4403)
            return
        await ws.accept()
        try:
            first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=5))
        except (asyncio.TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
            await ws.close(code=4401)
            return
        if not isinstance(first, dict) or first.get("type") != "auth" or not _token_ok(str(first.get("token", ""))):
            await ws.close(code=4401)
            return
        after = int(first.get("after", 0) or 0)
        queue = manager.bus.subscribe()  # vor dem Replay abonnieren → keine Lücke

        async def send_events() -> None:
            last = after
            for e in manager.bus.replay(after):
                await ws.send_text(e.model_dump_json(exclude_none=True))
                last = e.seq
            await ws.send_text(json.dumps({"type": "replay_done", "lastSeq": last}))
            while True:
                e = await queue.get()
                if e.seq <= last:
                    continue
                await ws.send_text(e.model_dump_json(exclude_none=True))
                last = e.seq

        async def watch_disconnect() -> None:
            # Ohne aktives Lesen würde ein Verbindungsabbruch nie bemerkt (hängender Shutdown).
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    return

        tasks = [asyncio.create_task(send_events()), asyncio.create_task(watch_disconnect())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except WebSocketDisconnect:
            pass
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            manager.bus.unsubscribe(queue)

    return app
