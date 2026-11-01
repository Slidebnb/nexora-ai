import json
from email import policy
from email.parser import BytesParser

import httpx
import pytest

from nexora_worker import llm

CAPS = ["drafts.write", "files.write"]


def payload(out, **kw):
    base = {
        "subject": "Termin nächste Woche",
        "briefing": "Wir möchten einen Termin für die Projektbesprechung vereinbaren. Bitte nennen Sie zwei Vorschläge.",
        "recipients": [{"name": "Anna Muster", "email": "anna@example.com"}, {"name": "", "email": "bob@example.org"}, {"name": "Anna doppelt", "email": "ANNA@example.com"}],
        "outFolder": str(out),
    }
    base.update(kw)
    return base


@pytest.fixture
def out(tmp_path):
    d = tmp_path / "Entwuerfe"
    d.mkdir()
    return d


def test_drafts_saved_only_after_approval_and_never_sent(api, out):
    r = api.post("/api/tasks", {"workflow": "draft_emails", "input": payload(out), "capabilities": CAPS})
    assert r.status_code == 201, r.text
    run_id = r.json()["runId"]
    evs = api.wait_type(run_id, "approval_requested")
    req = [e for e in evs if e["type"] == "approval_requested"][0]["payload"]
    assert req["action"] == "E-Mail-Entwürfe speichern" and "NICHTS versendet" in req["impact"]
    assert "2 .eml-Dateien" in req["data"], "Duplikat muss entfernt sein"
    assert list(out.iterdir()) == [], "vor der Freigabe keine Dateien"
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run_id)[-1]
    assert end["type"] == "run_succeeded" and "Nichts wurde versendet" in end["payload"]["verification"]
    files = sorted(out.iterdir())
    assert [f.name for f in files] == ["Entwurf 01 - Anna Muster.eml", "Entwurf 02 - bob.eml"]
    msg = BytesParser(policy=policy.default).parsebytes(files[0].read_bytes())
    assert msg["X-Unsent"] == "1" and msg["Subject"] == "Termin nächste Woche" and "anna@example.com" in msg["To"]
    body = msg.get_content()
    assert body.startswith("Hallo Anna Muster,") and "Projektbesprechung" in body


def test_deny_writes_nothing(api, out):
    run_id = api.post("/api/tasks", {"workflow": "draft_emails", "input": payload(out), "capabilities": CAPS}).json()["runId"]
    api.post(f"/api/approvals/{api.approval_id(run_id)}/respond", {"decision": "deny"})
    assert api.wait_terminal(run_id)[-1]["type"] == "run_cancelled"
    assert list(out.iterdir()) == []


def test_existing_files_are_not_overwritten(api, out):
    (out / "Entwurf 01 - Anna Muster.eml").write_text("ALT")
    run_id = api.post("/api/tasks", {"workflow": "draft_emails", "input": payload(out), "capabilities": CAPS}).json()["runId"]
    api.post(f"/api/approvals/{api.approval_id(run_id)}/respond", {"decision": "allow"})
    assert api.wait_terminal(run_id)[-1]["type"] == "run_succeeded"
    assert (out / "Entwurf 01 - Anna Muster.eml").read_text() == "ALT"
    assert (out / "Entwurf 01 - Anna Muster (1).eml").exists()


def test_header_injection_and_bad_addresses_rejected(api, out):
    for bad in [
        payload(out, subject="Hallo\r\nBcc: alle@evil.example"),
        payload(out, recipients=[{"name": "X\nBcc: y@evil.example", "email": "a@example.com"}]),
        payload(out, recipients=[{"name": "", "email": "keine-adresse"}]),
        payload(out, outFolder="/"),
    ]:
        assert api.post("/api/tasks", {"workflow": "draft_emails", "input": bad, "capabilities": CAPS}).status_code == 400


def test_cloud_ai_text_after_second_approval(api, out, monkeypatch):
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"content": [{"type": "text", "text": "gerne würden wir einen Termin vereinbaren."}], "usage": {"input_tokens": 50, "output_tokens": 20}})

    real = httpx.Client
    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler)))
    api.c.put("/api/session/secrets", headers=api.h, json={"anthropic": "sk-ant-test-123456789012345678901"})
    r = api.post("/api/tasks", {"workflow": "draft_emails", "input": payload(out, useCloudAi=True), "capabilities": CAPS})
    assert r.status_code == 403  # ai.cloud fehlt
    run_id = api.post("/api/tasks", {"workflow": "draft_emails", "input": payload(out, useCloudAi=True), "capabilities": CAPS + ["ai.cloud"]}).json()["runId"]
    first = api.wait_type(run_id, "approval_requested")
    p1 = [e for e in first if e["type"] == "approval_requested"][0]["payload"]
    assert p1["action"] == "Briefing an KI-Anbieter senden" and sent == []
    assert "anna@example.com" not in json.dumps(p1), "Empfängeradressen gehen nicht an die KI"
    api.post(f"/api/approvals/{p1['approvalId']}/respond", {"decision": "allow"})
    second = api.wait_for(run_id, lambda evs: sum(e["type"] == "approval_requested" for e in evs) == 2)
    p2 = [e for e in second if e["type"] == "approval_requested"][-1]["payload"]
    assert "<briefing>" in sent[0]["messages"][0]["content"] and "anna@example.com" not in json.dumps(sent)
    api.post(f"/api/approvals/{p2['approvalId']}/respond", {"decision": "allow"})
    assert api.wait_terminal(run_id)[-1]["type"] == "run_succeeded"
    body = BytesParser(policy=policy.default).parsebytes(sorted(out.iterdir())[0].read_bytes()).get_content()
    assert "gerne würden wir" in body
    costs = [e for e in api.events(run_id) if e["type"] == "cost_updated"]
    assert costs and costs[-1]["payload"]["totalUsd"] > 0, "BYOK: KI-Kosten müssen sichtbar sein"
