"""MCP-Client gegen einen nachgebauten MCP-Server (JSON- und SSE-Antwort)."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from nexora_worker.mcp import McpClient, McpError, content_to_text, validate_url

TOOLS = [
    {"name": "echo", "description": "Gibt den Text zurück", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}}},
    {"name": "fail", "description": "schlägt fehl", "inputSchema": {"type": "object"}},
]


class Handler(BaseHTTPRequestHandler):
    sse_for: set[str] = set()
    token: str | None = None

    def _send(self, code: int, body: dict | None, *, sse: bool = False, session: str | None = None) -> None:
        self.send_response(code)
        if session:
            self.send_header("Mcp-Session-Id", session)
        if body is None:
            self.end_headers()
            return
        if sse:
            data = f"event: message\ndata: {json.dumps(body)}\n\n".encode()
            self.send_header("Content-Type", "text/event-stream")
        else:
            data = json.dumps(body).encode()
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(length) or b"{}")
        if Handler.token is not None and self.headers.get("Authorization") != f"Bearer {Handler.token}":
            self._send(401, {"jsonrpc": "2.0", "id": req.get("id"), "error": {"code": -32000, "message": "unauthorized"}})
            return
        method = req.get("method", "")
        rid = req.get("id")
        if method.startswith("notifications/"):
            self._send(202, None)
            return
        sse = method in Handler.sse_for
        if method == "initialize":
            self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"protocolVersion": "2025-06-18", "serverInfo": {"name": "FakeMCP", "version": "9.9"}}}, sse=sse, session="sess-1")
        elif method == "tools/list":
            self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}}, sse=sse)
        elif method == "tools/call":
            p = req.get("params", {})
            if p.get("name") == "echo":
                self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": "Echo: " + str(p.get("arguments", {}).get("text", ""))}]}}, sse=sse)
            elif p.get("name") == "fail":
                self._send(200, {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": "kaputt"}], "isError": True}}, sse=sse)
            else:
                self._send(200, {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown tool"}}, sse=sse)

    def log_message(self, *a):
        pass


@pytest.fixture
def server():
    Handler.sse_for = set()
    Handler.token = None
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/mcp"
    srv.shutdown()


def test_validate_url_requires_https_for_remote():
    assert validate_url("http://127.0.0.1:9/mcp")
    assert validate_url("https://mcp.example/x")
    with pytest.raises(McpError):
        validate_url("http://mcp.example/x")
    with pytest.raises(McpError):
        validate_url("ftp://x/y")


def test_handshake_list_and_call_json(server):
    c = McpClient(server)
    try:
        info = c.connect()
        assert info == {"name": "FakeMCP", "version": "9.9"}
        assert c._session_id == "sess-1"  # Session-Header übernommen
        tools = c.list_tools()
        assert [t.name for t in tools] == ["echo", "fail"]
        res = c.call_tool("echo", {"text": "hallo"})
        assert res["isError"] is False and content_to_text(res["content"]) == "Echo: hallo"
        bad = c.call_tool("fail", {})
        assert bad["isError"] is True
        with pytest.raises(McpError):
            c.call_tool("gibtsnicht", {})
    finally:
        c.close()


def test_sse_transport(server):
    Handler.sse_for = {"initialize", "tools/list", "tools/call"}
    c = McpClient(server)
    try:
        assert c.connect()["name"] == "FakeMCP"
        assert [t.name for t in c.list_tools()] == ["echo", "fail"]
        assert content_to_text(c.call_tool("echo", {"text": "ssehallo"})["content"]) == "Echo: ssehallo"
    finally:
        c.close()


def test_token_required(server):
    Handler.token = "geheim123"
    with_token = McpClient(server, token="geheim123")
    try:
        assert with_token.connect()["name"] == "FakeMCP"
    finally:
        with_token.close()
    without = McpClient(server)
    try:
        with pytest.raises(McpError) as e:
            without.connect()
        assert "abgelehnt" in str(e.value)
    finally:
        without.close()


def test_unreachable_is_clean_error():
    c = McpClient("http://127.0.0.1:1/mcp", client=httpx.Client(timeout=1))
    try:
        with pytest.raises(McpError) as e:
            c.connect()
        assert "nicht erreichbar" in str(e.value)
    finally:
        c.close()
