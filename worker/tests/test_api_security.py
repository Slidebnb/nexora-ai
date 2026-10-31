import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import TOKEN

# Der Starlette-Testclient setzt bei WebSockets sonst Host „testserver“
WS_HOST = {"host": "127.0.0.1"}


def test_requires_token(api):
    assert api.c.get("/api/health").status_code == 401
    assert api.c.get("/api/health", headers={"Authorization": "Bearer falsch"}).status_code == 401
    assert api.get("/api/health").json()["status"] == "ok"


def test_rejects_browser_origin_and_foreign_host(api):
    h = {**api.h, "Origin": "https://evil.example"}
    assert api.c.get("/api/health", headers=h).status_code == 403
    assert api.c.get("/api/health", headers={**api.h, "Host": "evil.example"}).status_code == 403


def test_unknown_workflow_and_missing_capabilities(api, folder):
    assert api.post("/api/tasks", {"workflow": "rm_rf", "input": {}}).status_code == 400
    r = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ["files.read"]})
    assert r.status_code == 403 and "files.move" in r.json()["detail"]


def test_websocket_requires_auth_and_replays(api, folder):
    tid = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ["files.read", "files.move"]}).json()
    api.wait_type(tid["runId"], "approval_requested")
    with pytest.raises(WebSocketDisconnect) as exc:
        with api.c.websocket_connect("/api/events", headers=WS_HOST) as ws:
            ws.send_json({"type": "auth", "token": "falsch"})
            ws.receive_text()
    assert exc.value.code == 4401
    with api.c.websocket_connect("/api/events", headers=WS_HOST) as ws:
        ws.send_json({"type": "auth", "token": TOKEN, "after": 2})
        first = ws.receive_json()
        assert first["seq"] == 3
        msgs = [first]
        while True:
            m = ws.receive_json()
            if m.get("type") == "replay_done":
                break
            msgs.append(m)
        assert [m["seq"] for m in msgs] == sorted(m["seq"] for m in msgs)
        assert any(m["type"] == "approval_requested" for m in msgs)


def test_websocket_rejects_browser_origin(api):
    with pytest.raises(WebSocketDisconnect) as exc:
        with api.c.websocket_connect("/api/events", headers={**WS_HOST, "origin": "https://evil.example"}) as ws:
            ws.receive_text()
    assert exc.value.code == 4403


def test_events_match_renderer_contract(api, folder):
    """Der Renderer akzeptiert keine null-Felder – sie müssen fehlen (Regression)."""
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ["files.read", "files.move"]}).json()
    evs = api.wait_type(t["runId"], "approval_requested")
    for e in evs:
        assert None not in e.values(), e
        assert e["source"] == "live" and isinstance(e["seq"], int)
    created = evs[0]
    assert created["type"] == "run_created" and "stepId" not in created
