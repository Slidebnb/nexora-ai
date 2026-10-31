import time

from tests.conftest import ORG_CAPS


def test_pause_holds_after_approval_and_resume_finishes(api, folder):
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS}).json()
    approval = api.approval_id(t["runId"])
    assert api.post(f"/api/tasks/{t['taskId']}/pause").status_code == 200
    api.post(f"/api/approvals/{approval}/respond", {"decision": "allow"})
    time.sleep(0.5)
    evs = api.events(t["runId"])
    assert any(e["type"] == "run_paused" for e in evs)
    assert not any(e["type"] == "step_started" and e.get("stepId") == "move" for e in evs), "pausiert: es wird nichts verschoben"
    assert not any(p.is_dir() for p in folder.iterdir() if p.name != "Unterordner"), "keine Datei bewegt"
    assert api.post(f"/api/tasks/{t['taskId']}/resume").status_code == 200
    end = api.wait_terminal(t["runId"])
    assert end[-1]["type"] == "run_succeeded"
    assert [e["type"] for e in end].count("run_resumed") == 1


def test_cancel_while_paused(api, folder):
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS}).json()
    approval = api.approval_id(t["runId"])
    api.post(f"/api/tasks/{t['taskId']}/pause")
    api.post(f"/api/approvals/{approval}/respond", {"decision": "allow"})
    time.sleep(0.3)
    api.post(f"/api/tasks/{t['taskId']}/cancel")
    end = api.wait_terminal(t["runId"])[-1]
    assert end["type"] == "run_cancelled"


def test_pause_rules(api, folder):
    assert api.post("/api/tasks/task-gibtsnicht/pause").status_code == 404
    t = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS}).json()
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "deny"})
    api.wait_terminal(t["runId"])
    assert api.post(f"/api/tasks/{t['taskId']}/pause").status_code == 409, "abgeschlossene Läufe nicht pausierbar"
