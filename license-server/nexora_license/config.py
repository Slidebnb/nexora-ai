"""Konfiguration ausschließlich über Umgebungsvariablen (Secrets nie im Code oder in der Desktop-App)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    seats: int  # aktivierbare Geräte
    features: tuple[str, ...]


PLANS: dict[str, Plan] = {
    "starter": Plan("starter", "Starter", 1, ("workflows",)),
    "pro": Plan("pro", "Pro", 2, ("workflows", "schedules", "cloud_ai")),
    "teams": Plan("teams", "Teams", 5, ("workflows", "schedules", "cloud_ai")),
}


@dataclass
class Settings:
    stripe_secret_key: str = field(default_factory=lambda: os.environ.get("STRIPE_SECRET_KEY", ""))
    stripe_webhook_secret: str = field(default_factory=lambda: os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    price_ids: dict[str, str] = field(
        default_factory=lambda: {p: os.environ.get(f"STRIPE_PRICE_{p.upper()}", "") for p in PLANS}
    )
    signing_key_b64: str = field(default_factory=lambda: os.environ.get("LICENSE_SIGNING_KEY", ""))
    public_base_url: str = field(default_factory=lambda: os.environ.get("PUBLIC_BASE_URL", "http://localhost:8800"))
    db_path: str = field(default_factory=lambda: os.environ.get("LICENSE_DB", "licenses.db"))
    token_days: int = 14  # Offline-Gnadenfrist der Desktop-App
