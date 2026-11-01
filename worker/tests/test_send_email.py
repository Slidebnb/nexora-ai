"""E-Mail wirklich senden (SMTP) – mit Freigabe, ohne echtes Netz (Fake-Sender)."""

from __future__ import annotations

import json

import pytest

from nexora_worker.workflows.send_email import SmtpConfig

CAPS = ["email.send"]
SMTP = {"host": "smtp.example.com", "port": 587, "security": "starttls", "user": "ich@example.com", "password": "geheim", "fromAddr": "ich@example.com"}


class FakeSender:
    def __init__(self) -> None:
        self.sent = []
        self.verified = []
        self.fail_on = None

    def send(self, cfg, msg):
        to = msg["To"]
        if self.fail_on and self.fail_on in to:
            import smtplib

            raise smtplib.SMTPRecipientsRefused({to: (550, b"no")})
        self.sent.append((to, msg["Subject"], msg.get_content()))

    def verify(self, cfg):
        self.verified.append(cfg.host)


@pytest.fixture
def sender(api):
    fs = FakeSender()
    api.manager.workflows["send_email"].sender = fs
    return fs


def set_smtp(api, cfg=SMTP):
    api.c.put("/api/session/secrets", headers=api.h, json={"smtp": cfg})


def test_sends_only_after_approval(api, sender):
    set_smtp(api)
    body = {"workflow": "send_email", "input": {"subject": "Angebot", "body": "Hallo, hier ist unser Angebot.", "recipients": [{"name": "Anna", "email": "anna@example.com"}]}}
    assert api.post("/api/tasks", {**body, "capabilities": []}).status_code == 403
    run = api.post("/api/tasks", {**body, "capabilities": CAPS}).json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    assert "anna@example.com" in req["target"] and "Angebot" in req["data"]
    assert sender.sent == [], "vor der Freigabe wird nichts gesendet"
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_succeeded", end
    assert len(sender.sent) == 1 and sender.sent[0][0] == "Anna <anna@example.com>" and sender.sent[0][1] == "Angebot"
    assert "1 von 1 E-Mail(s) über smtp.example.com gesendet" in end["payload"]["verification"]


def test_deny_sends_nothing(api, sender):
    set_smtp(api)
    run = api.post("/api/tasks", {"workflow": "send_email", "input": {"subject": "Hi", "body": "Testtext hier", "recipients": [{"email": "x@example.com"}]}, "capabilities": CAPS}).json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "deny"})
    assert api.wait_terminal(run)[-1]["type"] == "run_cancelled"
    assert sender.sent == []


def test_without_account_fails_cleanly(api, sender):
    # kein SMTP in den Secrets
    run = api.post("/api/tasks", {"workflow": "send_email", "input": {"subject": "Hi", "body": "Testtext hier", "recipients": [{"email": "x@example.com"}]}, "capabilities": CAPS}).json()["runId"]
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "E-Mail-Konto" in end["payload"]["error"]


def test_partial_failure_reported(api, sender):
    set_smtp(api)
    sender.fail_on = "boom@example.com"
    run = api.post("/api/tasks", {"workflow": "send_email", "input": {"subject": "Rundmail", "body": "Hallo zusammen hier", "recipients": [{"email": "ok@example.com"}, {"email": "boom@example.com"}]}, "capabilities": CAPS}).json()["runId"]
    req = [e for e in api.wait_type(run, "approval_requested") if e["type"] == "approval_requested"][-1]["payload"]
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_succeeded"
    assert "1 von 2" in end["payload"]["verification"] and "1 fehlgeschlagen" in end["payload"]["verification"]


def test_email_test_endpoint(api, sender):
    r = api.post("/api/email/test", SMTP)
    assert r.status_code == 200 and r.json()["ok"] is True and sender.verified == ["smtp.example.com"]


def test_header_injection_blocked(api, sender):
    set_smtp(api)
    assert api.post("/api/tasks", {"workflow": "send_email", "input": {"subject": "Hi\nBcc: evil@x", "body": "Text hier lang", "recipients": [{"email": "x@example.com"}]}, "capabilities": CAPS}).status_code == 400
    assert api.post("/api/tasks", {"workflow": "send_email", "input": {"subject": "Hi", "body": "Text hier lang", "recipients": [{"email": "keine-mail"}]}, "capabilities": CAPS}).status_code == 400


def test_invalid_smtp_config():
    with pytest.raises(Exception):
        SmtpConfig.model_validate({"host": "x", "port": 70000, "user": "u", "password": "p", "fromAddr": "ok@example.com"})
