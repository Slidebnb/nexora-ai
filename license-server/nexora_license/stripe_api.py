"""Schlanker Stripe-Zugriff über die REST-API (keine SDK-Abhängigkeit) und Webhook-Signaturprüfung."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

import httpx

API = "https://api.stripe.com/v1"


class StripeError(Exception):
    pass


def verify_webhook(payload: bytes, header: str, secret: str, tolerance: int = 300, now: float | None = None) -> None:
    """Prüft den Stripe-Signature-Header (Schema v1, HMAC-SHA256 über „t.payload“)."""
    if not secret:
        raise StripeError("Webhook-Secret nicht konfiguriert")
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    signatures = [v for k, v in (p.split("=", 1) for p in header.split(",") if "=" in p) if k == "v1"]
    try:
        ts = int(parts.get("t", ""))
    except ValueError as e:
        raise StripeError("Ungültiger Signatur-Header") from e
    if abs((now or time.time()) - ts) > tolerance:
        raise StripeError("Webhook-Zeitstempel außerhalb der Toleranz")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in signatures):
        raise StripeError("Webhook-Signatur ungültig")


class Stripe:
    def __init__(self, secret_key: str, client: httpx.Client | None = None) -> None:
        if not secret_key:
            raise StripeError("STRIPE_SECRET_KEY fehlt")
        self._client = client or httpx.Client(timeout=20)
        self._auth = (secret_key, "")

    def _post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        r = self._client.post(f"{API}{path}", data=data, auth=self._auth)
        if r.status_code >= 400:
            raise StripeError(f"Stripe-Fehler HTTP {r.status_code}")
        return r.json()

    def create_checkout(self, plan: str, price_id: str, email: str | None, success_url: str, cancel_url: str) -> dict[str, Any]:
        data = {
            "mode": "subscription",
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": "1",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "allow_promotion_codes": "true",
            "subscription_data[trial_period_days]": "14",
            "metadata[plan]": plan,
            "subscription_data[metadata][plan]": plan,
        }
        if email:
            data["customer_email"] = email
        return self._post("/checkout/sessions", data)

    def create_portal(self, customer_id: str, return_url: str) -> dict[str, Any]:
        return self._post("/billing_portal/sessions", {"customer": customer_id, "return_url": return_url})
