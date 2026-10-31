from nexora_worker.__main__ import build_manager


def test_interrupted_runs_are_marked_failed(data_dir):
    m = build_manager(data_dir)
    m.db.execute("INSERT INTO tasks VALUES ('task-1','organize_folder','{}','[]','2026-01-01T00:00:00Z')")
    m.db.execute("INSERT INTO runs VALUES ('run-1','task-1','organize_folder','x','agent-sortierer','running','2026-01-01T00:00:00Z',NULL)")
    m.db.close()
    m2 = build_manager(data_dir)
    assert m2.recover_interrupted() == 1
    ev = m2.bus.replay(0, "run-1")[-1]
    assert ev.type == "run_failed" and "beendet" in ev.payload["error"]
    assert m2.db.query_one("SELECT status, ended_at FROM runs WHERE id='run-1'")["status"] == "failed"
    assert m2.db.schema_version == 3
