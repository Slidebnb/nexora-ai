"""HTTP-API des Lizenzdienstes.

Ablauf: Checkout (Stripe) → Webhook legt Lizenz an → Erfolgsseite zeigt Schlüssel einmalig →
Desktop-App aktiviert mit Schlüssel + Geräte-ID und erhält ein signiertes Token (14 Tage gültig, offline prüfbar).
"""

from __future__ import annotations

import json
import re
from datetime import timedelta
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator

from .config import PLANS, Settings
from .signing import load_private_key, public_key_pem, sign_token
from .store import Store, key_hash, now
from .stripe_api import Stripe, StripeError, verify_webhook

ACTIVE = {"active", "trialing"}
KEY_RE = re.compile(r"^NXR(-[A-Z2-9]{5}){4}$")


class CheckoutBody(BaseModel):
    plan: Literal["starter", "pro", "teams"]
    email: str | None = Field(default=None, max_length=200)


class ActivateBody(BaseModel):
    licenseKey: str
    machineId: str = Field(min_length=16, max_length=128)

    @field_validator("licenseKey")
    @classmethod
    def _key(cls, v: str) -> str:
        v = v.strip().upper()
        if not KEY_RE.match(v):
            raise ValueError("Ungültiges Format")
        return v


def plan_for_price(settings: Settings, price_id: str | None) -> str:
    for plan, pid in settings.price_ids.items():
        if pid and pid == price_id:
            return plan
    return "starter"


def create_app(settings: Settings | None = None, stripe: Stripe | None = None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.db_path)
    key = load_private_key(settings.signing_key_b64)
    app = FastAPI(title="NEXORA Lizenzdienst", docs_url=None, redoc_url=None)

    def get_stripe() -> Stripe:
        return stripe or Stripe(settings.stripe_secret_key)

    @app.get("/api/public-key")
    def public_key() -> dict[str, str]:
        return {"pem": public_key_pem(key)}

    @app.post("/api/checkout")
    def checkout(body: CheckoutBody) -> dict[str, str]:
        price = settings.price_ids.get(body.plan)
        if not price:
            raise HTTPException(503, "Plan ist nicht konfiguriert")
        try:
            s = get_stripe().create_checkout(
                body.plan, price, body.email,
                success_url=f"{settings.public_base_url}/danke?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.public_base_url}/preise",
            )
        except StripeError as e:
            raise HTTPException(502, str(e)) from e
        return {"url": s["url"]}

    @app.post("/api/stripe/webhook")
    async def webhook(request: Request) -> dict[str, str]:
        payload = await request.body()
        try:
            verify_webhook(payload, request.headers.get("stripe-signature", ""), settings.stripe_webhook_secret)
        except StripeError as e:
            raise HTTPException(400, str(e)) from e
        event = json.loads(payload)
        if store.event_seen(event["id"]):
            return {"status": "bereits verarbeitet"}
        obj: dict[str, Any] = event["data"]["object"]
        t = event["type"]
        if t == "checkout.session.completed" and obj.get("mode") == "subscription":
            if not store.by_subscription(obj["subscription"]):
                plan = (obj.get("metadata") or {}).get("plan", "starter")
                store.create_license(
                    email=(obj.get("customer_details") or {}).get("email") or obj.get("customer_email"),
                    plan=plan if plan in PLANS else "starter",
                    customer=obj.get("customer"), subscription=obj["subscription"], session=obj["id"], status="active",
                )
        elif t in ("customer.subscription.updated", "customer.subscription.created"):
            items = (obj.get("items") or {}).get("data") or []
            price = items[0]["price"]["id"] if items else None
            store.set_status(obj["id"], obj["status"], plan_for_price(settings, price) if price else None)
        elif t == "customer.subscription.deleted":
            store.set_status(obj["id"], "canceled")
        return {"status": "ok"}

    @app.get("/api/license/by-session/{session_id}")
    def claim(session_id: str) -> dict[str, str]:
        k = store.claim_key_for_session(session_id)
        if not k:
            raise HTTPException(404, "Kein (neuer) Schlüssel für diese Sitzung – bitte Support kontaktieren")
        return {"licenseKey": k}

    def issue(body: ActivateBody) -> dict[str, str]:
        lic = store.by_key(body.licenseKey)
        if lic is None:
            raise HTTPException(404, "Lizenzschlüssel unbekannt")
        if lic["status"] not in ACTIVE:
            raise HTTPException(402, "Abonnement ist nicht aktiv")
        plan = PLANS.get(lic["plan"], PLANS["starter"])
        kh = key_hash(body.licenseKey)
        machines = store.activations(kh)
        if body.machineId not in machines and len(machines) >= plan.seats:
            raise HTTPException(409, f"Maximale Anzahl Geräte erreicht ({plan.seats}). Bitte ein Gerät abmelden.")
        store.activate(kh, body.machineId)
        exp = now() + timedelta(days=settings.token_days)
        token = sign_token(key, {
            "v": 1, "sub": kh[:16], "plan": plan.id, "planName": plan.name, "features": list(plan.features),
            "machine": body.machineId, "iat": int(now().timestamp()), "exp": int(exp.timestamp()), "hint": lic["key_hint"],
        })
        return {"token": token}

    @app.post("/api/activate")
    def activate(body: ActivateBody) -> dict[str, str]:
        return issue(body)

    @app.post("/api/refresh")
    def refresh(body: ActivateBody) -> dict[str, str]:
        return issue(body)

    @app.post("/api/deactivate")
    def deactivate(body: ActivateBody) -> dict[str, str]:
        if store.by_key(body.licenseKey) is None:
            raise HTTPException(404, "Lizenzschlüssel unbekannt")
        store.deactivate(key_hash(body.licenseKey), body.machineId)
        return {"status": "abgemeldet"}

    @app.post("/api/portal")
    def portal(body: ActivateBody) -> dict[str, str]:
        lic = store.by_key(body.licenseKey)
        if lic is None or not lic["stripe_customer"]:
            raise HTTPException(404, "Kein Kundenkonto gefunden")
        try:
            return {"url": get_stripe().create_portal(lic["stripe_customer"], f"{settings.public_base_url}/konto")["url"]}
        except StripeError as e:
            raise HTTPException(502, str(e)) from e

    @app.get("/danke", response_class=HTMLResponse)
    def danke(session_id: str) -> str:
        k = store.claim_key_for_session(session_id)
        msg = (
            f"<p>Dein Lizenzschlüssel (bitte jetzt sichern, er wird nur einmal angezeigt):</p><p><code>{k}</code></p>"
            "<p>In NEXORA: Einstellungen → Lizenz → Schlüssel eingeben.</p>"
            if k else "<p>Der Schlüssel wurde bereits angezeigt oder die Zahlung wird noch verarbeitet. Bitte Seite in einer Minute neu laden oder Support kontaktieren.</p>"
        )
        return f"<!doctype html><meta charset='utf-8'><title>NEXORA AI – Danke</title><h1>Danke!</h1>{msg}"

    return app
