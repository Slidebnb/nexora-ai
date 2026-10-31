"""Verwaltung der Konnektoren (MCP) und ein Workflow, der ein Konnektor-Werkzeug mit Freigabe ausführt.

- Konnektoren (Name, URL) stehen in der Datenbank; das Token liegt im sicheren Speicher der App und wird
  je Sitzung als `connector:<id>` in die Secrets des Workers übergeben (wie die KI-Schlüssel).
- „Verbindung testen“ und „Werkzeuge anzeigen“ sind rein lesend.
- Ein Werkzeug auszuführen ist ein Workflow mit Berechtigung `connectors.use` UND einer Freigabe je Aufruf:
  NEXORA kann nicht wissen, ob ein fremdes Werkzeug nur liest oder etwas verändert/sendet, daher wird jeder
  Aufruf vorher einzeln gezeigt und bestätigt. Ergebnisse sind nicht vertrauenswürdig und werden redigiert.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Callable, ClassVar

from pydantic import BaseModel, Field

from .bus import now_iso
from .mcp import McpClient, McpError, content_to_text, validate_url
from .runner import RunContext, TaskError, TaskManager, Workflow, WorkflowError
from .safety import redact_text

ClientFactory = Callable[[str, str | None], McpClient]


def _default_factory(url: str, token: str | None) -> McpClient:
    return McpClient(url, token)


class ConnectorStore:
    def __init__(self, manager: TaskManager, client_factory: ClientFactory | None = None) -> None:
        self.manager = manager
        self.db = manager.db
        self.client_factory = client_factory or _default_factory

    def _token(self, connector_id: str) -> str | None:
        return self.manager.secrets.get(f"connector:{connector_id}")

    def list(self) -> list[dict[str, Any]]:
        rows = self.db.query("SELECT id, name, url, has_token, created_at FROM connectors ORDER BY created_at")
        return [{"id": r["id"], "name": r["name"], "url": r["url"], "hasToken": bool(r["has_token"]), "createdAt": r["created_at"]} for r in rows]

    def get(self, connector_id: str) -> dict[str, Any]:
        row = self.db.query_one("SELECT id, name, url, has_token FROM connectors WHERE id = ?", (connector_id,))
        if not row:
            raise TaskError("Konnektor nicht gefunden", 404)
        return {"id": row["id"], "name": row["name"], "url": row["url"], "hasToken": bool(row["has_token"])}

    def add(self, name: str, url: str, token: str | None) -> dict[str, Any]:
        name = name.strip()
        if not (1 <= len(name) <= 80):
            raise TaskError("Name fehlt oder ist zu lang")
        try:
            url = validate_url(url)
        except McpError as e:
            raise TaskError(str(e)) from e
        cid = f"con-{uuid.uuid4().hex[:16]}"
        self.db.execute(
            "INSERT INTO connectors(id, name, url, has_token, created_at) VALUES (?,?,?,?,?)",
            (cid, name, url, 1 if token else 0, now_iso()),
        )
        if token:
            self.manager.secrets[f"connector:{cid}"] = token
        return self.get(cid)

    def remove(self, connector_id: str) -> None:
        self.get(connector_id)
        self.db.execute("DELETE FROM connectors WHERE id = ?", (connector_id,))
        self.manager.secrets.pop(f"connector:{connector_id}", None)

    def _client(self, connector_id: str) -> McpClient:
        c = self.get(connector_id)
        return self.client_factory(c["url"], self._token(connector_id))

    async def test(self, connector_id: str) -> dict[str, Any]:
        def run() -> dict[str, Any]:
            client = self._client(connector_id)
            try:
                info = client.connect()
                tools = client.list_tools()
                return {"ok": True, "server": info, "toolCount": len(tools), "message": f"Verbunden{' – ' + info['name'] if info.get('name') else ''}, {len(tools)} Werkzeug(e)"}
            except McpError as e:
                return {"ok": False, "server": {}, "toolCount": 0, "message": str(e)}
            finally:
                client.close()

        return await asyncio.to_thread(run)

    async def tools(self, connector_id: str) -> list[dict[str, Any]]:
        def run() -> list[dict[str, Any]]:
            client = self._client(connector_id)
            try:
                client.connect()
                return [t.public() for t in client.list_tools()]
            except McpError as e:
                raise TaskError(str(e), 409) from e
            finally:
                client.close()

        return await asyncio.to_thread(run)


class ConnectorInput(BaseModel):
    connectorId: str = Field(min_length=1, max_length=40)
    tool: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)


class ConnectorAction(Workflow):
    name: ClassVar[str] = "connector_action"
    agent_id: ClassVar[str] = "agent-konnektor"
    agent_name: ClassVar[str] = "Konnektor"
    capabilities: ClassVar[frozenset[str]] = frozenset({"connectors.use"})
    Input = ConnectorInput

    def __init__(self, store: ConnectorStore) -> None:
        self.store = store

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, ConnectorInput)
        return f"Konnektor-Werkzeug „{data.tool}“ ausführen"

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, ConnectorInput)
        try:
            conn = self.store.get(data.connectorId)
        except TaskError as e:
            raise WorkflowError(str(e)) from e
        ctx.plan([("connect", "Mit Konnektor verbinden"), ("approve", "Ausführung freigeben"), ("call", f"Werkzeug „{data.tool}“ ausführen"), ("verify", "Ergebnis prüfen")])

        ctx.step_started("connect", "Mit Konnektor verbinden")
        client = self.store.client_factory(conn["url"], self.store._token(data.connectorId))
        try:
            available = await asyncio.to_thread(lambda: (client.connect(), [t.name for t in client.list_tools()])[1])
        except McpError as e:
            await asyncio.to_thread(client.close)
            raise WorkflowError(str(e)) from e
        if data.tool not in available:
            await asyncio.to_thread(client.close)
            ctx.step_failed("connect", "Werkzeug nicht vorhanden")
            raise WorkflowError(f"Der Konnektor kennt das Werkzeug „{data.tool}“ nicht (mehr).")
        ctx.step_succeeded("connect", f"{len(available)} Werkzeug(e) verfügbar")

        import json as _json

        preview = redact_text(_json.dumps(data.arguments, ensure_ascii=False))[:500]
        ctx.step_started("approve", "Ausführung freigeben")
        decision = await ctx.approve(
            action=f"Konnektor „{conn['name']}“: Werkzeug „{data.tool}“ ausführen",
            target=conn["url"],
            data=f"Eingabe: {preview}" if data.arguments else "ohne Eingabe",
            impact="NEXORA weiß nicht, ob dieses Werkzeug nur liest oder etwas verändert/sendet. Was der Konnektor daraufhin tut, kann NEXORA nicht rückgängig machen.",
        )
        if decision != "allow":
            await asyncio.to_thread(client.close)
            ctx.cancelled("Nicht freigegeben – das Werkzeug wurde nicht ausgeführt")
            return
        ctx.step_succeeded("approve", "freigegeben")

        ctx.step_started("call", f"Werkzeug „{data.tool}“ ausführen")
        try:
            result = await asyncio.to_thread(client.call_tool, data.tool, data.arguments)
        except McpError as e:
            raise WorkflowError(str(e)) from e
        finally:
            await asyncio.to_thread(client.close)
        text = redact_text(content_to_text(result["content"]))
        out = ctx.data_dir / "runs" / ctx.run_id / "Konnektor-Ergebnis.txt"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text or "(kein Textinhalt)", encoding="utf-8")
        ctx.artifact("file", "Konnektor-Ergebnis.txt", out)
        if result["isError"]:
            ctx.step_failed("call", "Der Konnektor meldet einen Fehler")
            raise WorkflowError(f"Das Werkzeug meldete einen Fehler: {text[:200] or 'ohne Text'}")
        ctx.step_succeeded("call", "ausgeführt")
        ctx.step_started("verify", "Ergebnis prüfen")
        ctx.step_succeeded("verify", "gespeichert")
        ctx.succeed(
            f"Werkzeug „{data.tool}“ bei Konnektor „{conn['name']}“ ausgeführt; Ergebnis gespeichert ({len(text)} Zeichen Text). "
            "Inhalte stammen vom Konnektor und sind ungeprüft.",
            f"„{data.tool}“ ausgeführt – Ergebnis unter Dateien.",
        )
