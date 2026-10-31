import asyncio
from datetime import datetime, timedelta

import pytest

from nexora_worker import db as dbmod
from nexora_worker.__main__ import build_manager
from nexora_worker.templates import Schedule, TemplateStore, next_due
from tests.conftest import ORG_CAPS


def organize_ok(api, folder):
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS}).json()
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "allow"})
    assert api.wait_terminal(t["runId"])[-1]["type"] == "run_succeeded"
    return t["runId"]


def test_template_from_successful_run_versioned_and_rerun_with_new_folder(api, folder, tmp_path):
    run_id = organize_ok(api, folder)
    r = api.post("/api/templates", {"runId": run_id, "name": "Downloads aufräumen"})
    assert r.status_code == 201, r.text
    t1 = r.json()
    assert t1["version"] == 1 and t1["workflow"] == "organize_folder" and t1["capabilities"] == sorted(ORG_CAPS)
    t2 = api.post("/api/templates", {"runId": run_id, "name": "Downloads aufräumen"}).json()
    assert t2["version"] == 2 and t2["versions"] == 2
    listed = api.get("/api/templates").json()
    assert len(listed) == 1 and listed[0]["version"] == 2

    other = tmp_path / "Neu"
    other.mkdir()
    (other / "bild.png").write_bytes(b"x")
    run = api.post(f"/api/templates/{t2['templateId']}/run", {"overrides": {"folder": str(other)}})
    assert run.status_code == 201, run.text
    new_run = run.json()["runId"]
    evs = api.wait_type(new_run, "approval_requested")
    assert str(other.resolve()) in [e for e in evs if e["type"] == "approval_requested"][0]["payload"]["target"]
    assert (other / "bild.png").exists(), "auch aus Vorlagen: nichts ohne Freigabe"
    api.post(f"/api/approvals/{api.approval_id(new_run)}/respond", {"decision": "allow"})
    assert api.wait_terminal(new_run)[-1]["type"] == "run_succeeded"
    assert (other / "Bilder" / "bild.png").exists()


def test_template_rules(api, folder):
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS}).json()
    api.approval_id(t["runId"])
    assert api.post("/api/templates", {"runId": t["runId"], "name": "X"}).status_code == 409, "laufende Vorgänge nicht"
    api.post(f"/api/tasks/{t['taskId']}/cancel")
    api.wait_terminal(t["runId"])
    assert api.post("/api/templates", {"runId": t["runId"], "name": "X"}).status_code == 409, "abgebrochene nicht"
    assert api.post("/api/templates", {"runId": "run-gibtsnicht", "name": "X"}).status_code == 404
    ok = organize_ok(api, folder)
    tid = api.post("/api/templates", {"runId": ok, "name": "Y"}).json()["templateId"]
    assert api.post(f"/api/templates/{tid}/run", {"overrides": {"capabilities": ["alles"]}}).status_code == 400
    assert api.c.delete(f"/api/templates/{tid}", headers=api.h).status_code == 204
    assert api.get("/api/templates").json() == []


def test_schedule_validation(api, folder):
    tid = api.post("/api/templates", {"runId": organize_ok(api, folder), "name": "Z"}).json()["templateId"]
    put = lambda s: api.c.put(f"/api/templates/{tid}/schedule", headers=api.h, json={"schedule": s})
    assert put({"type": "daily", "time": "25:00"}).status_code == 422
    assert put({"type": "interval", "minutes": 5}).status_code == 422
    assert put({"type": "daily"}).status_code == 400
    res = put({"type": "daily", "time": "7:30"}).json()
    assert res["schedule"] == {"type": "daily", "time": "07:30"}
    assert res["lastRunAt"] is None, "Zeitplan setzen ist keine Ausführung"
    assert put(None).json()["schedule"] is None


def test_next_due():
    now = datetime(2026, 10, 31, 12, 0)
    daily = Schedule(type="daily", time="08:00")
    assert next_due(daily, None, now) == datetime(2026, 10, 31, 8, 0)
    assert next_due(daily, datetime(2026, 10, 31, 8, 1), now) == datetime(2026, 11, 1, 8, 0)
    iv = Schedule(type="interval", minutes=60)
    assert next_due(iv, now - timedelta(minutes=30), now) == now + timedelta(minutes=30)


def test_scheduler_tick_starts_due_template_once(api, folder, data_dir):
    run_id = organize_ok(api, folder)
    tid = api.post("/api/templates", {"runId": run_id, "name": "Täglich"}).json()["templateId"]
    api.c.put(f"/api/templates/{tid}/schedule", headers=api.h, json={"schedule": {"type": "interval", "minutes": 15}})
    # Store über eine zweite Instanz auf derselben DB ansprechen
    m = build_manager(data_dir)
    store = TemplateStore(m)

    async def go(at):
        return await store.tick(now=at)

    assert asyncio.run(go(datetime.now())) == [], "noch nicht fällig"
    started = asyncio.run(go(datetime.now() + timedelta(minutes=16)))
    assert len(started) == 1


def test_migration_from_v1_database(tmp_path, monkeypatch):
    path = tmp_path / "alt.db"
    monkeypatch.setattr(dbmod, "MIGRATIONS", dbmod.MIGRATIONS[:1])
    old = dbmod.Database(path)
    assert old.schema_version == 1
    old.execute("INSERT INTO tasks VALUES ('task-a','organize_folder','{}','[]','2026-01-01T00:00:00Z')")
    old.close()
    monkeypatch.undo()
    new = dbmod.Database(path)
    assert new.schema_version == 2
    assert new.query_one("SELECT id FROM tasks")["id"] == "task-a", "Daten bleiben bei der Migration erhalten"
    assert new.query("SELECT * FROM templates") == []
    bak = path.with_name("alt.db.bak-v1")
    assert bak.exists(), "Sicherung vor der Migration"
    import sqlite3
    assert sqlite3.connect(bak).execute("SELECT id FROM tasks").fetchone()[0] == "task-a"
