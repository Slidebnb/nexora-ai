"""SQLite-Speicher für Abonnements, Lizenzschlüssel und Geräte-Aktivierungen."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_license_key() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne verwechselbare Zeichen
    return "NXR-" + "-".join("".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(4))


def key_hash(key: str) -> str:
    return hashlib.sha256(key.strip().upper().encode()).hexdigest()


class Store:
    def __init__(self, path: str) -> None:
        self._c = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._c.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._c.executescript(
                """
                CREATE TABLE IF NOT EXISTS licenses (
                    key_hash TEXT PRIMARY KEY,
                    key_hint TEXT NOT NULL,
                    email TEXT,
                    plan TEXT NOT NULL,
                    status TEXT NOT NULL,
                    stripe_customer TEXT,
                    stripe_subscription TEXT UNIQUE,
                    checkout_session TEXT UNIQUE,
                    issued_key TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS activations (
                    key_hash TEXT NOT NULL,
                    machine_id TEXT NOT NULL,
                    activated_at TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    PRIMARY KEY (key_hash, machine_id)
                );
                CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY);
                """
            )

    def q(self, sql: str, p: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._c.execute(sql, p).fetchall()

    def x(self, sql: str, p: tuple = ()) -> None:
        with self._lock:
            self._c.execute(sql, p)

    def event_seen(self, event_id: str) -> bool:
        """Idempotenz: Stripe kann Webhooks mehrfach zustellen."""
        with self._lock:
            try:
                self._c.execute("INSERT INTO processed_events(id) VALUES (?)", (event_id,))
                return False
            except sqlite3.IntegrityError:
                return True

    def create_license(self, *, email: str | None, plan: str, customer: str | None, subscription: str | None, session: str | None, status: str) -> str:
        key = new_license_key()
        ts = now().isoformat()
        # Der Klartextschlüssel wird nur bis zur Abholung über die Erfolgsseite gespeichert (issued_key), danach gelöscht.
        self.x(
            "INSERT INTO licenses VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (key_hash(key), key[-5:], email, plan, status, customer, subscription, session, key, ts, ts),
        )
        return key

    def by_key(self, key: str) -> sqlite3.Row | None:
        rows = self.q("SELECT * FROM licenses WHERE key_hash = ?", (key_hash(key),))
        return rows[0] if rows else None

    def by_subscription(self, sub: str) -> sqlite3.Row | None:
        rows = self.q("SELECT * FROM licenses WHERE stripe_subscription = ?", (sub,))
        return rows[0] if rows else None

    def claim_key_for_session(self, session: str) -> str | None:
        rows = self.q("SELECT key_hash, issued_key FROM licenses WHERE checkout_session = ?", (session,))
        if not rows or not rows[0]["issued_key"]:
            return None
        self.x("UPDATE licenses SET issued_key = NULL WHERE key_hash = ?", (rows[0]["key_hash"],))
        return rows[0]["issued_key"]

    def set_status(self, sub: str, status: str, plan: str | None = None) -> None:
        if plan:
            self.x("UPDATE licenses SET status = ?, plan = ?, updated_at = ? WHERE stripe_subscription = ?", (status, plan, now().isoformat(), sub))
        else:
            self.x("UPDATE licenses SET status = ?, updated_at = ? WHERE stripe_subscription = ?", (status, now().isoformat(), sub))

    def activations(self, kh: str) -> list[str]:
        return [r["machine_id"] for r in self.q("SELECT machine_id FROM activations WHERE key_hash = ?", (kh,))]

    def activate(self, kh: str, machine: str) -> None:
        ts = now().isoformat()
        self.x(
            "INSERT INTO activations VALUES (?,?,?,?) ON CONFLICT(key_hash, machine_id) DO UPDATE SET last_seen = excluded.last_seen",
            (kh, machine, ts, ts),
        )

    def deactivate(self, kh: str, machine: str) -> None:
        self.x("DELETE FROM activations WHERE key_hash = ? AND machine_id = ?", (kh, machine))
