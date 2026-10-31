"""Desktop-Ablauf (Recorder/Replay aus ClawBridge) – Logik mit einem Test-Backend.

Die echte Windows-Bedienung prüft `test_desktop_windows.py` mit dem Windows-Editor (nur in der Windows-CI).
"""

from __future__ import annotations

import sys

import pytest

from nexora_worker.desktop import DesktopError, ElementSnapshot, UnavailableBackend, find_matching_element, get_element_at_point

EDIT = ElementSnapshot("Edit", "Kundennummer", "txtKunde", "Formular", 10, 10, 210, 40)
SAVE = ElementSnapshot("Button", "Speichern", "", "Formular", 10, 50, 110, 80)
PWD = ElementSnapshot("Edit", "Kennwort", "txtPass", "Formular", 10, 90, 210, 120, is_password=True)
CAPS = ["desktop.read", "desktop.control"]


class FakeBackend:
    """Verhält sich wie ein Programmfenster mit drei Elementen."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.clicks: list[str] = []
        self.window = "Kundenverwaltung"
        self.swallow = False

    def list_windows(self):
        return [{"title": self.window, "pid": 42}]

    def elements(self, window, max_elements=150):
        if window != self.window:
            raise DesktopError(f"Fenster „{window}“ nicht gefunden – ist das Programm geöffnet?")
        return [EDIT, SAVE, PWD]

    def _find(self, window, el):
        m, _ = find_matching_element(el, self.elements(window))
        if not m:
            raise DesktopError(f"{el.describe()} nicht sicher wiedergefunden")
        return m

    def invoke(self, window, el):
        self.clicks.append(self._find(window, el).name)

    def set_text(self, window, el, text):
        m = self._find(window, el)
        if m.is_password:
            raise DesktopError("In Passwortfelder schreibt NEXORA nicht")
        self.values[m.name] = text[:3] if self.swallow else text

    def read_text(self, window, el):
        return self.values.get(self._find(window, el).name, "")


@pytest.fixture
def fake(api):
    fb = FakeBackend()
    api.manager.workflows["desktop_routine"].backend = fb
    return fb


def ref(el: ElementSnapshot) -> dict:
    d = el.to_dict()
    d.pop("is_password")
    return d


def routine(steps):
    return {"workflow": "desktop_routine", "input": {"window": "Kundenverwaltung", "steps": steps}, "capabilities": CAPS}


def test_matcher_prefers_ids_and_refuses_position_guessing():
    moved = ElementSnapshot("Edit", "Kundennr.", "txtKunde", "", 300, 300, 500, 330)
    assert find_matching_element(EDIT, [moved])[1] == 1.0, "Automation-ID trägt auch nach Verschieben/Umbenennen"
    renamed = ElementSnapshot("Button", "Sichern", "", "Formular", 12, 52, 112, 82)
    assert find_matching_element(SAVE, [renamed]) == (None, 0.0), "nur ähnliche Position genügt nicht zum Bedienen"
    assert find_matching_element(SAVE, [renamed], threshold=0.6)[0] is renamed
    assert get_element_at_point(20, 20, [EDIT, SAVE]) is EDIT and get_element_at_point(999, 999, [EDIT]) is None


def test_recorder_lists_windows_and_elements(api, fake):
    assert api.get("/api/desktop/windows").json() == [{"title": "Kundenverwaltung", "pid": 42}]
    els = api.get("/api/desktop/elements", params={"window": "Kundenverwaltung"}).json()
    assert [e["label"] for e in els] == ["Eingabefeld „Kundennummer“", "Schaltfläche „Speichern“", "Eingabefeld „Kennwort“"]
    assert els[2]["is_password"] is True
    assert api.get("/api/desktop/elements", params={"window": "Gibtsnicht"}).status_code == 409


def test_replay_types_verifies_and_clicks_after_approval(api, fake):
    r = api.post("/api/tasks", routine([{"action": "type", "element": ref(EDIT), "text": "K-1042"}, {"action": "click", "element": ref(SAVE)}]))
    assert r.status_code == 201, r.text
    run = r.json()["runId"]
    evs = api.wait_type(run, "approval_requested")
    req = [e for e in evs if e["type"] == "approval_requested"][-1]["payload"]
    assert "„K-1042“ in Eingabefeld „Kundennummer“ eintragen" in req["data"] and "Schaltfläche „Speichern“ auslösen" in req["data"]
    assert fake.values == {} and fake.clicks == [], "vor der Freigabe wird nichts bedient"
    api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": "allow"})
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_succeeded", end
    assert "1/1 Texteingaben zurückgelesen" in end["payload"]["verification"]
    assert fake.values == {"Kundennummer": "K-1042"} and fake.clicks == ["Speichern"]


def test_deny_changes_nothing(api, fake):
    run = api.post("/api/tasks", routine([{"action": "click", "element": ref(SAVE)}])).json()["runId"]
    api.post(f"/api/approvals/{api.approval_id(run)}/respond", {"decision": "deny"})
    assert api.wait_terminal(run)[-1]["type"] == "run_cancelled"
    assert fake.clicks == []


def test_failures_are_reported_not_hidden(api, fake):
    gone = ElementSnapshot("Button", "Drucken", "btnPrint", "Formular")
    run = api.post("/api/tasks", routine([{"action": "click", "element": ref(gone)}])).json()["runId"]
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "Drucken" in end["payload"]["error"]

    run = api.post("/api/tasks", routine([{"action": "type", "element": ref(PWD), "text": "geheim"}])).json()["runId"]
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "Passwort" in end["payload"]["error"]

    fake.swallow = True  # Programm übernimmt den Text nicht vollständig
    run = api.post("/api/tasks", routine([{"action": "type", "element": ref(EDIT), "text": "K-1042"}])).json()["runId"]
    api.post(f"/api/approvals/{api.approval_id(run)}/respond", {"decision": "allow"})
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "Prüfung fehlgeschlagen" in end["payload"]["error"]


def test_input_rules(api, fake):
    assert api.post("/api/tasks", {**routine([{"action": "click", "element": ref(SAVE)}]), "capabilities": ["desktop.read"]}).status_code == 403
    bad = [
        {"window": "NEXORA AI", "steps": [{"action": "click", "element": ref(SAVE)}]},
        {"window": "X", "steps": [{"action": "click", "element": {"control_type": "Button"}}]},
        {"window": "X", "steps": [{"action": "type", "element": ref(EDIT), "text": ""}]},
        {"window": "X", "steps": []},
    ]
    for inp in bad:
        assert api.post("/api/tasks", {"workflow": "desktop_routine", "input": inp, "capabilities": CAPS}).status_code == 400, inp


@pytest.mark.skipif(sys.platform == "win32", reason="prüft die ehrliche Meldung auf anderen Systemen")
def test_other_systems_say_so(api):
    api.manager.workflows["desktop_routine"].backend = UnavailableBackend()
    r = api.get("/api/desktop/windows")
    assert r.status_code == 409 and "nur unter Windows" in r.json()["detail"]
