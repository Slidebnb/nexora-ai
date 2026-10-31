import json
import os
import sys
from pathlib import Path

import pytest

from tests.conftest import ORG_CAPS


def start(api, folder):
    r = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": str(folder)}, "capabilities": ORG_CAPS})
    assert r.status_code == 201, r.text
    return r.json()


def files(root: Path) -> set[str]:
    return {str(p.relative_to(root)).replace("\\", "/") for p in root.rglob("*") if p.is_file()}


def test_nothing_moves_before_approval_then_allow_moves_and_verifies(api, folder, data_dir):
    before = files(folder)
    t = start(api, folder)
    evs = api.wait_type(t["runId"], "approval_requested")
    assert files(folder) == before, "vor der Freigabe darf nichts verändert werden"
    req = [e for e in evs if e["type"] == "approval_requested"][0]["payload"]
    assert req["action"] == "Dateien verschieben" and req["target"] == str(folder.resolve())
    assert "7 Dateien" in req["data"]
    plan = [e for e in evs if e["type"] == "plan_ready"][0]["payload"]["steps"]
    assert [s["id"] for s in plan] == ["scan", "plan", "move", "verify"]

    assert api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"}).status_code == 200
    evs = api.wait_terminal(t["runId"])
    end = evs[-1]
    assert end["type"] == "run_succeeded", end
    assert "7/7" in end["payload"]["verification"]
    assert files(folder) == {
        "Bilder/urlaub.jpg", "Bilder/foto.PNG", "PDFs/rechnung.pdf", "Dokumente/notizen.txt",
        "Tabellen/tabelle.xlsx", "Archive/archiv.zip", "Sonstiges/unbekannt.xyz", ".versteckt",
    }
    names = [e["payload"]["name"] for e in evs if e["type"] == "artifact_created"]
    assert names == ["Sortierplan.csv", "Undo-Protokoll.json"]
    assert (data_dir / "journals" / f"{t['runId']}.json").is_file()
    # Freigabe kann nicht zweimal beantwortet werden
    assert api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"}).status_code == 409


def test_undo_restores_original_state(api, folder):
    before = files(folder)
    t = start(api, folder)
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "allow"})
    assert api.wait_terminal(t["runId"])[-1]["type"] == "run_succeeded"

    u = api.post("/api/tasks", {"workflow": "undo_organize", "input": {"runId": t["runId"]}, "capabilities": ["files.move"]}).json()
    api.post(f"/api/approvals/{api.approval_id(u['runId'])}/respond", {"decision": "allow"})
    end = api.wait_terminal(u["runId"])[-1]
    assert end["type"] == "run_succeeded", end
    assert files(folder) == before
    assert not (folder / "Bilder").exists(), "leere, von NEXORA angelegte Ordner werden entfernt"
    assert (folder / "Unterordner").is_dir(), "vorhandene Ordner bleiben"

    again = api.post("/api/tasks", {"workflow": "undo_organize", "input": {"runId": t["runId"]}, "capabilities": ["files.move"]}).json()
    assert api.wait_terminal(again["runId"])[-1]["type"] == "run_failed"


def test_deny_changes_nothing(api, folder):
    before = files(folder)
    t = start(api, folder)
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "deny"})
    end = api.wait_terminal(t["runId"])[-1]
    assert end["type"] == "run_cancelled" and "keine Datei" in end["payload"]["reason"]
    assert files(folder) == before


def test_cancel_while_waiting_for_approval(api, folder):
    before = files(folder)
    t = start(api, folder)
    api.approval_id(t["runId"])
    assert api.post(f"/api/tasks/{t['taskId']}/cancel").status_code == 200
    evs = api.wait_terminal(t["runId"])
    assert evs[-1]["type"] == "run_cancelled"
    assert any(e["type"] == "approval_resolved" and e["payload"]["decision"] == "cancel" for e in evs)
    assert files(folder) == before
    assert api.post(f"/api/tasks/{t['taskId']}/cancel").status_code == 409


def test_never_overwrites_existing_files(api, folder):
    (folder / "Bilder").mkdir()
    (folder / "Bilder" / "urlaub.jpg").write_bytes(b"ALT")
    t = start(api, folder)
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "allow"})
    assert api.wait_terminal(t["runId"])[-1]["type"] == "run_succeeded"
    assert (folder / "Bilder" / "urlaub.jpg").read_bytes() == b"ALT"
    assert (folder / "Bilder" / "urlaub (1).jpg").read_bytes() == b"jpg"


def test_file_changed_after_analysis_is_skipped(api, folder):
    t = start(api, folder)
    approval = api.approval_id(t["runId"])
    (folder / "notizen.txt").write_bytes(b"neu und laenger")
    api.post(f"/api/approvals/{approval}/respond", {"decision": "allow"})
    end = api.wait_terminal(t["runId"])[-1]
    assert end["type"] == "run_succeeded"
    assert "1 übersprungen" in end["payload"]["verification"]
    assert (folder / "notizen.txt").exists()


@pytest.mark.skipif(sys.platform == "win32", reason="Symlinks unter Windows benötigen Rechte")
def test_symlinks_are_ignored(api, folder, tmp_path):
    outside = tmp_path / "geheim.pdf"
    outside.write_bytes(b"x")
    os.symlink(outside, folder / "link.pdf")
    t = start(api, folder)
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "allow"})
    assert api.wait_terminal(t["runId"])[-1]["type"] == "run_succeeded"
    assert (folder / "link.pdf").is_symlink() and outside.exists()


def test_rejects_dangerous_roots(api, tmp_path):
    for bad in ["/", str(Path.home()), "relativ/pfad", str(tmp_path / "gibtsnicht")]:
        r = api.post("/api/tasks", {"workflow": "organize_folder", "input": {"folder": bad}, "capabilities": ORG_CAPS})
        assert r.status_code == 400, bad


def test_empty_folder_succeeds_without_changes(api, tmp_path):
    empty = tmp_path / "leer"
    empty.mkdir()
    t = start(api, empty)
    end = api.wait_terminal(t["runId"])[-1]
    assert end["type"] == "run_succeeded" and "keine Dateien" in end["payload"]["verification"]


def test_undo_rejects_tampered_journal(api, folder, data_dir):
    t = start(api, folder)
    api.post(f"/api/approvals/{api.approval_id(t['runId'])}/respond", {"decision": "allow"})
    api.wait_terminal(t["runId"])
    j = data_dir / "journals" / f"{t['runId']}.json"
    journal = json.loads(j.read_text(encoding="utf-8"))
    journal["entries"][0]["src"] = str(Path("/etc/passwd"))
    j.write_text(json.dumps(journal), encoding="utf-8")
    u = api.post("/api/tasks", {"workflow": "undo_organize", "input": {"runId": t["runId"]}, "capabilities": ["files.move"]}).json()
    end = api.wait_terminal(u["runId"])[-1]
    assert end["type"] == "run_failed" and "außerhalb" in end["payload"]["error"]


def test_events_are_redacted_and_ordered(api, tmp_path):
    secret_dir = tmp_path / "password=supergeheim123"
    secret_dir.mkdir()
    (secret_dir / "a.txt").write_text("x")
    t = start(api, secret_dir)
    evs = api.wait_type(t["runId"], "approval_requested")
    assert "supergeheim123" not in json.dumps(evs)
    assert [e["seq"] for e in evs] == sorted(e["seq"] for e in evs)
