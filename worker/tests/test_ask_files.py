import json

import httpx
import pytest

from nexora_worker import llm

CAPS = ["files.read", "ai.cloud"]
ANSWER = "- Die Rechnung von Stadtwerke beträgt 142,50 Euro (aus rechnung.txt)."


@pytest.fixture
def docs(tmp_path):
    d = tmp_path / "Unterlagen"
    d.mkdir()
    (d / "rechnung.txt").write_text(
        "Rechnung der Stadtwerke Musterstadt.\nRechnungsbetrag: 142,50 Euro.\nZahlbar bis 30.11.2026.",
        encoding="utf-8",
    )
    (d / "notiz.md").write_text("# Notiz\nEinkaufsliste: Milch, Brot.", encoding="utf-8")
    (d / "bild.jpg").write_bytes(b"\xff\xd8\xff")  # wird ignoriert (kein Text/PDF)
    return d


def start(api, folder, question, caps=CAPS):
    r = api.post("/api/tasks", {"workflow": "ask_files", "input": {"folder": str(folder), "question": question}, "capabilities": caps})
    assert r.status_code == 201, r.text
    return r.json()["runId"]


@pytest.fixture
def fake_ai(monkeypatch):
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append({"url": str(request.url), "body": body})
        return httpx.Response(200, json={"content": [{"type": "text", "text": ANSWER}], "usage": {"input_tokens": 120, "output_tokens": 20}})

    real_client = httpx.Client
    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler)))
    return sent


def test_needs_ai_key(api, docs, fake_ai):
    """Ohne KI-Schlüssel wird nichts gesendet und der Lauf schlägt mit klarer Meldung fehl."""
    run_id = start(api, docs, "Wie hoch ist die Rechnung?")
    evs = api.wait_terminal(run_id)
    end = evs[-1]
    assert end["type"] == "run_failed", end
    assert "KI-Schlüssel" in end["payload"]["error"]
    assert not any(e["type"] == "approval_requested" for e in evs), "ohne Schlüssel keine Freigabe anfordern"
    assert fake_ai == []


def test_asks_before_sending_then_answers(api, docs, data_dir, fake_ai):
    api.c.put("/api/session/secrets", headers=api.h, json={"anthropic": "sk-ant-test-123456789012345678901"})
    run_id = start(api, docs, "Wie hoch ist der Rechnungsbetrag?")
    evs = api.wait_type(run_id, "approval_requested")
    req = [e for e in evs if e["type"] == "approval_requested"][0]["payload"]
    assert req["action"] == "Frage mit KI beantworten"
    assert fake_ai == [], "vor der Freigabe darf nichts an die KI gehen"

    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run_id)[-1]
    assert end["type"] == "run_succeeded", end
    assert "142,50 Euro" in end["payload"]["verification"]
    assert len(fake_ai) == 1
    body = fake_ai[0]["body"]
    assert "<frage>" in body["messages"][0]["content"] and "Rechnungsbetrag" in body["messages"][0]["content"]
    assert "rechnung.txt" in body["messages"][0]["content"]
    report = (data_dir / "runs" / run_id / "Antwort.md").read_text(encoding="utf-8")
    assert "142,50 Euro" in report and "rechnung.txt" in report
    # BYOK: Kosten sichtbar – nach dem KI-Aufruf wird ein cost_updated-Ereignis mit Betrag > 0 gemeldet.
    costs = [e for e in api.events(run_id) if e["type"] == "cost_updated"]
    assert costs and costs[-1]["payload"]["totalUsd"] > 0, costs


def test_denied_sends_nothing(api, docs, fake_ai):
    api.c.put("/api/session/secrets", headers=api.h, json={"anthropic": "sk-ant-test-123456789012345678901"})
    run_id = start(api, docs, "Wie hoch ist die Rechnung?")
    approval = api.approval_id(run_id)
    api.post(f"/api/approvals/{approval}/respond", {"decision": "deny"})
    end = api.wait_terminal(run_id)[-1]
    assert end["type"] in ("run_failed", "run_cancelled"), end
    assert fake_ai == [], "bei Ablehnung wird nichts gesendet"


def test_empty_folder_sends_nothing(api, tmp_path, fake_ai):
    api.c.put("/api/session/secrets", headers=api.h, json={"anthropic": "sk-ant-test-123456789012345678901"})
    empty = tmp_path / "leer"
    empty.mkdir()
    run_id = start(api, empty, "Gibt es hier etwas?")
    end = api.wait_terminal(run_id)[-1]
    assert end["type"] == "run_succeeded" and "keine lesbaren" in end["payload"]["summary"].lower()
    assert fake_ai == [], "leerer Ordner → keine KI-Anfrage"
