import httpx

from nexora_worker.system import check_ai_connection


def test_system_status_reports_real_values(api, folder):
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ["files.read", "files.move"]}).json()
    api.approval_id(t["runId"])
    s = api.get("/api/system").json()
    assert s["worker"]["version"] and s["worker"]["uptimeSeconds"] >= 0
    assert s["database"]["schemaVersion"] == 2 and s["database"]["runs"] == 1 and s["database"]["events"] >= 4
    assert s["disk"]["total"] > 0 and 0 <= s["disk"]["used"] <= s["disk"]["total"]
    assert set(s["workflows"]) >= {"organize_folder", "pdf_analysis"}
    assert s["ai"] == {"anthropic": False, "openai": False}
    assert isinstance(s["ocr"]["available"], bool) and isinstance(s["browserUse"]["installed"], bool)


def test_system_requires_token(api):
    assert api.c.get("/api/system").status_code == 401


def _client(status):
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        return httpx.Response(status, json={"data": []})

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


def test_ai_connection_check():
    assert check_ai_connection("anthropic", {})["ok"] is False
    c, calls = _client(200)
    r = check_ai_connection("anthropic", {"anthropic": "sk-ant-x"}, c)
    assert r["ok"] and calls[0].url.path == "/v1/models" and calls[0].method == "GET", "nur Modellliste – keine Token-Kosten"
    c, _ = _client(401)
    assert "abgelehnt" in check_ai_connection("openai", {"openai": "sk-x"}, c)["message"]
    c, _ = _client(500)
    assert "HTTP 500" in check_ai_connection("openai", {"openai": "sk-x"}, c)["message"]
