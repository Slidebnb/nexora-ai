"""Sehr schlanker MCP-Client (Model Context Protocol) über HTTP, synchron.

NEXORA ist der Client: der Kunde trägt einen Konnektor (eine MCP-Server-URL, optional mit Token) ein,
NEXORA fragt dessen Werkzeuge ab und kann sie – nach Freigabe – aufrufen.

Sicherheit:
- Für entfernte Server ist HTTPS Pflicht; HTTP nur für lokale Server (127.0.0.1/localhost).
- Das Token wird nie geloggt und nicht in der Datenbank gespeichert (sicherer Speicher der App).
- Werkzeug-Ergebnisse sind nicht vertrauenswürdig (mögliche Prompt-Injection) und werden wie Web-/KI-Inhalte behandelt.
- Jede Werkzeugausführung verlangt im Workflow eine Freigabe (siehe workflows/connector.py).

Unterstützt die „Streamable HTTP“-Transportvariante: eine POST-Adresse, Antwort als JSON oder SSE.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlparse

import httpx

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "NEXORA", "version": "0.1.0"}


class McpError(Exception):
    pass


@dataclass(frozen=True)
class McpTool:
    name: str
    description: str
    input_schema: dict[str, Any]

    def public(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description[:500], "inputSchema": self.input_schema}


def _is_local(host: str) -> bool:
    if host in ("localhost",):
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def validate_url(url: str) -> str:
    p = urlparse(url.strip())
    if p.scheme not in ("http", "https") or not p.hostname:
        raise McpError("Ungültige Adresse (http/https erforderlich)")
    if p.scheme == "http" and not _is_local(p.hostname):
        raise McpError("Für entfernte Konnektoren ist HTTPS erforderlich")
    return url.strip()


class McpClient:
    def __init__(self, url: str, token: str | None = None, client: httpx.Client | None = None, timeout: float = 20.0) -> None:
        self.url = validate_url(url)
        self._token = token
        self._own = client is None
        self._client = client or httpx.Client(timeout=timeout)
        self._session_id: str | None = None
        self._next_id = 0

    def _headers(self) -> dict[str, str]:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
        }
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        if self._session_id:
            h["Mcp-Session-Id"] = self._session_id
        return h

    @staticmethod
    def _extract(resp: httpx.Response, want_id: int) -> dict[str, Any]:
        ctype = resp.headers.get("content-type", "")
        if ctype.startswith("application/json"):
            return resp.json()
        if "text/event-stream" in ctype:
            for raw in resp.text.splitlines():
                line = raw.strip()
                if not line.startswith("data:"):
                    continue
                try:
                    msg = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict) and msg.get("id") == want_id:
                    return msg
            raise McpError("Keine Antwort im Ereignisstrom des Konnektors")
        raise McpError(f"Unerwartetes Antwortformat des Konnektors ({ctype or 'ohne Typ'})")

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> Any:
        self._next_id += 1
        rid = self._next_id
        payload = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}
        try:
            resp = self._client.post(self.url, headers=self._headers(), json=payload)
        except httpx.HTTPError as e:
            raise McpError(f"Konnektor nicht erreichbar ({type(e).__name__})") from e
        sid = resp.headers.get("mcp-session-id")
        if sid:
            self._session_id = sid
        if resp.status_code == 401 or resp.status_code == 403:
            raise McpError("Konnektor hat den Zugang abgelehnt (Token prüfen)")
        if resp.status_code >= 400:
            raise McpError(f"Konnektor-Fehler (HTTP {resp.status_code})")
        msg = self._extract(resp, rid)
        if "error" in msg:
            err = msg["error"] or {}
            raise McpError(f"Konnektor meldet: {str(err.get('message', 'Fehler'))[:200]}")
        return msg.get("result", {})

    def _notify(self, method: str) -> None:
        payload = {"jsonrpc": "2.0", "method": method}
        try:
            self._client.post(self.url, headers=self._headers(), json=payload)
        except httpx.HTTPError:
            pass  # Benachrichtigung ist unkritisch

    def connect(self) -> dict[str, Any]:
        result = self._rpc(
            "initialize",
            {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": CLIENT_INFO},
        )
        self._notify("notifications/initialized")
        info = result.get("serverInfo", {}) if isinstance(result, dict) else {}
        return {"name": str(info.get("name", ""))[:100], "version": str(info.get("version", ""))[:50]}

    def list_tools(self) -> list[McpTool]:
        result = self._rpc("tools/list")
        out: list[McpTool] = []
        for t in (result.get("tools") or []) if isinstance(result, dict) else []:
            if isinstance(t, dict) and t.get("name"):
                out.append(McpTool(str(t["name"])[:100], str(t.get("description", "")), t.get("inputSchema") or {}))
        return out

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        if not isinstance(result, dict):
            raise McpError("Unerwartete Antwort des Konnektors")
        return {"content": result.get("content") or [], "isError": bool(result.get("isError"))}

    def close(self) -> None:
        if self._own:
            self._client.close()


def content_to_text(content: list[Any]) -> str:
    """Textanteile eines Werkzeug-Ergebnisses zusammenfassen (für Anzeige/Redaktion)."""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict):
            if block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            else:
                parts.append(f"[{block.get('type', 'inhalt')}]")
    return "\n".join(parts).strip()
