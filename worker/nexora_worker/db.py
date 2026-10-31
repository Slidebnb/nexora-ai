"""SQLite-Speicher mit versionierten Migrationen (Aufgaben, Runs, Events, Freigaben, Artefakte)."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

MIGRATIONS: list[str] = [
    # 1: Grundschema
    """
    CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        workflow TEXT NOT NULL,
        input_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        workflow TEXT NOT NULL,
        title TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ended_at TEXT
    );
    CREATE TABLE events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        agent_id TEXT,
        step_id TEXT,
        payload_json TEXT NOT NULL
    );
    CREATE INDEX events_run ON events(run_id, seq);
    CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        decision TEXT,
        requested_at TEXT NOT NULL,
        resolved_at TEXT
    );
    CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT,
        created_at TEXT NOT NULL
    );
    """,
    # 2: Vorlagen (versioniert) mit optionalem Zeitplan
    """
    CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version INTEGER NOT NULL,
        workflow TEXT NOT NULL,
        input_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        source_run_id TEXT NOT NULL,
        schedule_json TEXT,
        last_run_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(name, version)
    );
    CREATE INDEX templates_name ON templates(name, version)
    """,
    # 3: Konnektoren (MCP). Das Zugangstoken liegt NICHT hier, sondern im sicheren Speicher der App.
    """
    CREATE TABLE connectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        has_token INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """,
]


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._migrate()

    def _migrate(self) -> None:
        with self._lock:
            self._conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
            row = self._conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
            current = row["v"] or 0
            if 0 < current < len(MIGRATIONS):
                # Vor dem Umbau eine vollständige Sicherung anlegen (konsistent über die SQLite-Backup-API)
                backup = sqlite3.connect(self.path.with_name(f"{self.path.name}.bak-v{current}"))
                try:
                    self._conn.backup(backup)
                finally:
                    backup.close()
            for version, sql in enumerate(MIGRATIONS, start=1):
                if version <= current:
                    continue
                self._conn.execute("BEGIN")
                try:
                    for statement in filter(str.strip, sql.split(";")):
                        self._conn.execute(statement)
                    self._conn.execute("INSERT INTO schema_version(version) VALUES (?)", (version,))
                    self._conn.execute("COMMIT")
                except Exception:
                    self._conn.execute("ROLLBACK")
                    raise

    @property
    def schema_version(self) -> int:
        return self.query_one("SELECT MAX(version) AS v FROM schema_version")["v"]

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
        with self._lock:
            return self._conn.execute(sql, params)

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def query_one(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
