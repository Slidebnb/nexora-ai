"""Echte Desktop-Bedienung unter Windows: Editor (notepad.exe) öffnen, Text eintragen, zurücklesen.

Läuft nur unter Windows (CI-Job „Windows“). Keine Attrappe: echtes UI Automation über pywinauto.
"""

from __future__ import annotations

import subprocess
import sys
import time

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="nur unter Windows")


@pytest.fixture
def notepad():
    proc = subprocess.Popen(["notepad.exe"])  # noqa: S607 – festes Systemprogramm, keine Shell
    yield proc
    subprocess.run(["taskkill", "/F", "/IM", "notepad.exe"], capture_output=True, check=False)  # noqa: S607


def _wait_window(api, timeout=20.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        r = api.get("/api/desktop/windows")
        assert r.status_code == 200, r.text
        titles = [w["title"] for w in r.json() if "notepad" in w["title"].lower() or "editor" in w["title"].lower()]
        if titles:
            return titles[0]
        time.sleep(0.5)
    raise AssertionError(f"Editor-Fenster nicht gefunden: {api.get('/api/desktop/windows').json()}")


def test_real_notepad_type_and_read_back(api, notepad):
    window = _wait_window(api)
    els = api.get("/api/desktop/elements", params={"window": window}).json()
    print("Fenster:", window, "Elemente:", [(e["control_type"], e["name"], e["automation_id"]) for e in els][:20])
    target = next(e for e in els if e["control_type"] in ("Edit", "Document") and (e["name"] or e["automation_id"]) and not e["is_password"])
    ref = {k: target[k] for k in ("control_type", "name", "automation_id", "parent_name", "left", "top", "right", "bottom")}
    text = "NEXORA Desktop-Test 123"
    r = api.post("/api/tasks", {"workflow": "desktop_routine", "input": {"window": window, "steps": [{"action": "type", "element": ref, "text": text}]},
                                "capabilities": ["desktop.read", "desktop.control"]})
    assert r.status_code == 201, r.text
    run = r.json()["runId"]
    api.post(f"/api/approvals/{api.approval_id(run)}/respond", {"decision": "allow"})
    evs = api.wait_terminal(run)
    end = evs[-1]
    assert end["type"] == "run_succeeded", [e["payload"] for e in evs if e["type"] in ("step_failed", "run_failed")]
    assert "1/1 Texteingaben zurückgelesen und gleich" in end["payload"]["verification"]
    backend = api.manager.workflows["desktop_routine"].backend
    from nexora_worker.desktop import ElementSnapshot

    assert backend.read_text(window, ElementSnapshot(**{**ref})) == text
