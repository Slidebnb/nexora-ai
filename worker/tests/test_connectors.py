"""Konnektoren (MCP) über die API: hinzufügen, testen, Werkzeuge, Ausführung mit Freigabe, entfernen."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

CAPS = ["connectors.use"]
TOOLS = [
    {"name": "echo", "description": "Gibt den Text zurück", "inputSchema": {"type": "object"}},
    {"name": "fail", "description": "fehlerhaft", "inputSchema": {"type": "object"}},
]


class Handler(BaseHTTPRequestHandler):
    token: str | None = None

    def _send(self, code, body):
        data = json.dumps(body).encode() if body is not None else b""
        self.send_response(code)
        if body is not None:
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
        if body is None:
            self.send_header("Mcp-Session-Id", "s1")
        self.end_headers()
        if data:
            self.wfile.write(data)

    def do_POST(self):  # noqa: N802
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        if Handler.token and self.headers.get("Authorization") != f"Bearer {Handler.token}":
            self._send(401, {"jsonrpc": "2.0", "id": req.get("id"), "error": {"message": "unauthorized"}})
            return
        m, rid = req.get("method", ""), req.get("id")
        if m.startswith("notifications/"):
            self._send(202, None)
        elif m == "initialize":
            self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"serverInfo": {"name": "FakeMCP", "version": "1"}}})
        elif m == "tools/list":
            self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}})
        elif m == "tools/call":
            p = req.get("params", {})
            if p["name"] == "echo":
                self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": "Echo: " + str(p.get("arguments", {}).get("text", ""))}]}})
            else:
                self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": "kaputt"}], "isError": True}})

    def log_message(self, *a):
        pass


@pytest.fixture
def mcp():
    Handler.token = None
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/mcp"
    srv.shutdown()


def add(api, url, name="Test-Konnektor", token=None):
    r = api.post("/api/connectors", {"name": name, "url": url, "token": token})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_add_list_test_tools_and_remove(api, mcp):
    cid = add(api, mcp)
    lst = api.get("/api/connectors").json()
    assert len(lst) == 1 and lst[0]["id"] == cid and lst[0]["hasToken"] is False
    t = api.post(f"/api/connectors/{cid}/test").json()
    assert t["ok"] is True and t["toolCount"] == 2 and "FakeMCP" in t["message"]
    tools = api.get(f"/api/connectors/{cid}/tools").json()
    assert [x["name"] for x in tools] == ["echo", "fail"]
    assert api.c.delete(f"/api/connectors/{cid}", headers=api.h).status_code == 204
    assert api.get("/api/connectors").json() == []


def test_execute_tool_requires_capability_and_approval(api, mcp):
    cid = add(api, mcp)
    body = {"workflow": "connector_action", "input": {"connectorId": cid, "tool": "echo", "arguments": {"text": "hallo"}}}
    assert api.post("/api/tasks", {**body, "capabilities": []}).status_code == 403
    r = api.post("/api/tasks", {**body, "capabilities": CAPS})
    assert r.status_code == 201, r.text
    run = r.json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    assert "echo" in req["action"] and "hallo" in req["data"]
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_succeeded", end
    assert any(e["type"] == "artifact_created" and e["payload"]["name"] == "Konnektor-Ergebnis.txt" for e in api.events(run))


def test_deny_does_not_call(api, mcp):
    cid = add(api, mcp)
    run = api.post("/api/tasks", {"workflow": "connector_action", "input": {"connectorId": cid, "tool": "echo", "arguments": {}}, "capabilities": CAPS}).json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "deny"})
    assert api.wait_terminal(run)[-1]["type"] == "run_cancelled"


def test_unknown_tool_and_tool_error(api, mcp):
    cid = add(api, mcp)
    run = api.post("/api/tasks", {"workflow": "connector_action", "input": {"connectorId": cid, "tool": "gibtsnicht", "arguments": {}}, "capabilities": CAPS}).json()["runId"]
    assert api.wait_terminal(run)[-1]["type"] == "run_failed"
    # 'fail' liefert isError → nach Freigabe als Fehler gemeldet
    run = api.post("/api/tasks", {"workflow": "connector_action", "input": {"connectorId": cid, "tool": "fail", "arguments": {}}, "capabilities": CAPS}).json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    assert api.wait_terminal(run)[-1]["type"] == "run_failed"


def test_https_required_for_remote_and_token_used(api, mcp):
    assert api.post("/api/connectors", {"name": "x", "url": "http://fremd.example/mcp"}).status_code == 400
    Handler.token = "geheim"
    # Token über die Secrets-Übergabe der Sitzung einspielen (wie die App es tut)
    cid = add(api, mcp, token="geheim")
    assert api.post(f"/api/connectors/{cid}/test").json()["ok"] is True
    # ohne passendes Token meldet der Server „abgelehnt“
    api.c.put("/api/session/secrets", headers=api.h, json={"connectors": {cid: "falsch"}})
    assert api.post(f"/api/connectors/{cid}/test").json()["ok"] is False
