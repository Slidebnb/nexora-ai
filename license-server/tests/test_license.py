import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi.testclient import TestClient

from nexora_license.app import create_app
from nexora_license.config import Settings
from nexora_license.signing import b64u_decode, generate_key_b64
from nexora_license.stripe_api import Stripe, StripeError, verify_webhook

WH = "whsec_test"
MACHINE = "machine-0123456789abcdef"


@pytest.fixture
def stripe_calls():
    return []


@pytest.fixture
def client(tmp_path, stripe_calls):
    def handler(request: httpx.Request) -> httpx.Response:
        stripe_calls.append((str(request.url), request.content.decode()))
        if request.url.path.endswith("/checkout/sessions"):
            return httpx.Response(200, json={"id": "cs_1", "url": "https://checkout.stripe.test/cs_1"})
        return httpx.Response(200, json={"url": "https://billing.stripe.test/p"})

    settings = Settings(stripe_secret_key="sk_test_x", stripe_webhook_secret=WH, price_ids={"starter": "price_s", "pro": "price_p", "teams": ""},
                        signing_key_b64=generate_key_b64(), db_path=str(tmp_path / "l.db"), public_base_url="https://nexora.test")
    stripe = Stripe("sk_test_x", client=httpx.Client(transport=httpx.MockTransport(handler)))
    return TestClient(create_app(settings, stripe))


def send(client, event, secret=WH, ts=None):
    body = json.dumps(event).encode()
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return client.post("/api/stripe/webhook", content=body, headers={"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"})


def completed(plan="pro", sub="sub_1", session="cs_1", evt="evt_1"):
    return {"id": evt, "type": "checkout.session.completed", "data": {"object": {
        "id": session, "mode": "subscription", "subscription": sub, "customer": "cus_1",
        "customer_details": {"email": "kunde@example.com"}, "metadata": {"plan": plan}}}}


def buy(client, plan="pro"):
    assert send(client, completed(plan)).status_code == 200
    return client.get("/api/license/by-session/cs_1").json()["licenseKey"]


def verify(token: str, pem: str) -> dict:
    body, sig = token.split(".")
    load_pem_public_key(pem.encode()).verify(b64u_decode(sig), body.encode())
    return json.loads(b64u_decode(body))


def test_checkout_uses_configured_price_and_metadata(client, stripe_calls):
    r = client.post("/api/checkout", json={"plan": "pro", "email": "a@b.de"})
    assert r.json()["url"].startswith("https://checkout.stripe.test")
    body = stripe_calls[0][1]
    assert "price_p" in body and "metadata%5Bplan%5D=pro" in body and "trial_period_days%5D=14" in body
    assert client.post("/api/checkout", json={"plan": "teams"}).status_code == 503, "nicht konfigurierter Plan"


def test_webhook_signature_is_enforced(client):
    assert send(client, completed(), secret="falsch").status_code == 400
    assert send(client, completed(), ts=int(time.time()) - 3600).status_code == 400, "Replay außerhalb der Toleranz"
    with pytest.raises(StripeError):
        verify_webhook(b"{}", "kaputt", WH)


def test_purchase_activation_and_offline_token(client):
    key = buy(client)
    assert key.startswith("NXR-")
    assert client.get("/api/license/by-session/cs_1").status_code == 404, "Schlüssel nur einmal abrufbar"
    assert send(client, completed()).json()["status"] == "bereits verarbeitet", "Webhook idempotent"
    tok = client.post("/api/activate", json={"licenseKey": key.lower(), "machineId": MACHINE}).json()["token"]
    payload = verify(tok, client.get("/api/public-key").json()["pem"])
    assert payload["plan"] == "pro" and "schedules" in payload["features"] and payload["machine"] == MACHINE
    assert 13 * 86400 < payload["exp"] - payload["iat"] <= 14 * 86400
    assert key not in tok, "Klartextschlüssel steckt nicht im Token"


def test_seat_limit_and_deactivation(client):
    key = buy(client, "starter")
    assert client.post("/api/activate", json={"licenseKey": key, "machineId": MACHINE}).status_code == 200
    assert client.post("/api/activate", json={"licenseKey": key, "machineId": MACHINE}).status_code == 200, "gleiches Gerät erneut ok"
    other = {"licenseKey": key, "machineId": "machine-zzzzzzzzzzzzzzzz"}
    assert client.post("/api/activate", json=other).status_code == 409
    client.post("/api/deactivate", json={"licenseKey": key, "machineId": MACHINE})
    assert client.post("/api/activate", json=other).status_code == 200


def test_cancellation_blocks_refresh(client):
    key = buy(client)
    send(client, {"id": "evt_2", "type": "customer.subscription.deleted", "data": {"object": {"id": "sub_1"}}})
    r = client.post("/api/refresh", json={"licenseKey": key, "machineId": MACHINE})
    assert r.status_code == 402


def test_rejects_bad_keys(client):
    assert client.post("/api/activate", json={"licenseKey": "abc", "machineId": MACHINE}).status_code == 422
    assert client.post("/api/activate", json={"licenseKey": "NXR-AAAAA-AAAAA-AAAAA-AAAAA", "machineId": MACHINE}).status_code == 404


def test_portal(client, stripe_calls):
    key = buy(client)
    assert client.post("/api/portal", json={"licenseKey": key, "machineId": MACHINE}).json()["url"].startswith("https://billing")
    assert "customer=cus_1" in stripe_calls[-1][1]
