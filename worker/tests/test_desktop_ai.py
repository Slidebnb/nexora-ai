"""KI-Desktop-Modus (Computer Use) mit nachgestellter API (MockTransport) und Test-Bildschirm.

Ein echter Lauf gegen die Anthropic-API ist hier NICHT getestet (kein Schlüssel in der Testumgebung).
"""

from __future__ import annotations

import base64
import io
import json

import httpx
import pytest
from PIL import Image

from nexora_worker.computer import ActionError, frame_for, is_blocked, to_send_keys

CAPS = ["desktop.read", "desktop.control", "ai.cloud"]
KEY = {"anthropic": "sk-ant-test-123456789012345678901"}


def png_b64(w: int, h: int) -> str:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (20, 30, 40)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class FakeScreen:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def window_rect(self, window):
        if window != "Rechner":
            from nexora_worker.desktop import DesktopError

            raise DesktopError(f"Fenster „{window}“ nicht gefunden – ist das Programm geöffnet?")
        return (100, 50, 900, 650)  # 800×600

    def screenshot_png(self, rect, size):
        self.calls.append(("shot", rect, size))
        return png_b64(*size)

    def mouse(self, action, x, y, start=None):
        self.calls.append(("mouse", action, x, y, start))

    def scroll(self, x, y, direction, amount):
        self.calls.append(("scroll", x, y, direction, amount))

    def send_keys(self, keys):
        self.calls.append(("keys", keys))

    def cursor(self):
        return (150, 80)


def tool(i, name, **inp):
    return {"type": "tool_use", "id": f"toolu_{i}", "name": name, "toolset_name": "computer", "input": inp}


class ScriptedApi:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.anthropic.com/v1/messages"
        assert request.headers["x-api-key"] == KEY["anthropic"]
        self.requests.append(json.loads(request.content))
        return httpx.Response(200, json=self.replies.pop(0))


def reply(content, stop="tool_use", out=100):
    return {"content": content, "stop_reason": stop, "usage": {"input_tokens": 1000, "output_tokens": out}}


@pytest.fixture
def setup(api):
    def make(replies):
        screen, script = FakeScreen(), ScriptedApi(replies)
        wf = api.manager.workflows["desktop_ai"]
        wf.backend = screen
        wf.client_factory = lambda: httpx.Client(transport=httpx.MockTransport(script.handler))
        api.c.put("/api/session/secrets", headers=api.h, json=KEY)
        return screen, script

    return make


def start(api, goal="Rechne 2+3 aus"):
    r = api.post("/api/tasks", {"workflow": "desktop_ai", "input": {"window": "Rechner", "goal": goal}, "capabilities": CAPS})
    assert r.status_code == 201, r.text
    return r.json()["runId"]


def answer(api, run, decisions):
    """Freigaben der Reihe nach beantworten; gibt die angefragten Texte zurück."""
    seen = []
    for d in decisions:
        evs = api.wait_for(run, lambda e: len([x for x in e if x["type"] == "approval_requested"]) > len(seen))
        req = [x for x in evs if x["type"] == "approval_requested"][len(seen)]["payload"]
        seen.append(req["data"])
        api.post(f"/api/approvals/{req['approvalId']}/respond", {"decision": d})
    return seen


def test_key_mapping_and_blocking():
    assert to_send_keys("ctrl+s") == "^s" and to_send_keys("Return") == "{ENTER}" and to_send_keys("ctrl+shift+Tab") == "^+{TAB}"
    assert to_send_keys("+") == "{+}" and to_send_keys("ctrl++") == "^{+}"
    for bad in ("super+r", "Win+R", "alt+F4", "ctrl+alt+delete", "ctrl+shift+escape"):
        assert is_blocked(bad), bad
        with pytest.raises(ActionError):
            to_send_keys(bad)
    with pytest.raises(ActionError):
        to_send_keys("super")  # Windows-Taste allein wird nicht gesendet
    f = frame_for(0, 0, 3136, 1000)
    assert f.shot_size == (1568, 500) and f.to_screen([100, 10]) == (200, 20)
    with pytest.raises(ActionError):
        f.to_screen([1568, 0])


def test_full_loop_with_approvals_blocking_and_result(api, setup):
    screen, script = setup([
        reply([{"type": "thinking", "thinking": "", "signature": "sig-1"}, tool(1, "screenshot"), tool(2, "left_click", coordinate=[40, 30])]),
        reply([tool(3, "key", text="super+r"), tool(4, "type", text="2+3="), tool(5, "left_click", coordinate=[5000, 10])]),
        reply([{"type": "text", "text": "Ergebnis 5 steht im Rechner."}], stop="end_turn"),
    ])
    run = start(api)
    asked = answer(api, run, ["allow", "allow", "allow"])
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_succeeded", end
    assert asked[0].startswith("Fotos nur des Fensters „Rechner“")
    assert asked[1:] == ["Linksklick bei [40, 30]", "Text tippen: „2+3=“"], "gesperrte Taste und Klick außerhalb werden gar nicht erst gefragt"
    # Bildschirm: nur Fensterausschnitt, Klick in Bildschirmkoordinaten, Text maskiert, Win+R nie gesendet
    assert ("shot", (100, 50, 900, 650), (800, 600)) in screen.calls
    assert ("mouse", "left_click", 140, 80, None) in screen.calls
    assert ("keys", "2{+}3=") in screen.calls and not any(c[0] == "keys" and "r" == c[1] for c in screen.calls)
    # API-Vertrag: Toolset-Eintrag, Modell, Ergebnisse mit toolset_name, Denkblock unverändert zurück
    first, second, third = script.requests
    assert first["tools"] == [{"type": "computer_toolset_20260801"}] and first["model"] == "claude-opus-5-5"
    assert second["messages"][1]["content"][0] == {"type": "thinking", "thinking": "", "signature": "sig-1"}
    results = second["messages"][2]["content"]
    assert [r["tool_use_id"] for r in results] == ["toolu_1", "toolu_2"] and all(r["toolset_name"] == "computer" for r in results)
    assert results[0]["content"][0]["type"] == "image"
    errs = {r["tool_use_id"]: r for r in third["messages"][4]["content"]}
    assert errs["toolu_3"]["is_error"] and "gesperrt" in errs["toolu_3"]["content"]
    assert errs["toolu_5"]["is_error"] and "außerhalb" in errs["toolu_5"]["content"]
    assert "is_error" not in errs["toolu_4"]
    # Ergebnis: Abschlussbild, Kosten aus echter Nutzung, ehrliche Prüfangabe
    assert "2 freigegebene Aktion(en)" in end["payload"]["verification"] and "prüft NEXORA nicht selbst" in end["payload"]["verification"]
    evs = api.events(run)
    assert any(e["type"] == "artifact_created" and e["payload"]["name"] == "Abschlussbild.png" for e in evs)
    cost = [e for e in evs if e["type"] == "cost_updated"][-1]["payload"]["totalUsd"]
    assert cost == pytest.approx(3 * 1000 / 1e6 * 4.0 + 3 * 100 / 1e6 * 20.0)


def test_denied_action_stops_everything(api, setup):
    screen, script = setup([reply([tool(1, "left_click", coordinate=[10, 10]), tool(2, "type", text="x")])])
    run = start(api)
    answer(api, run, ["allow", "deny"])
    assert api.wait_terminal(run)[-1]["type"] == "run_cancelled"
    assert not any(c[0] in ("mouse", "keys") for c in screen.calls)
    assert len(script.requests) == 1


def test_no_consent_sends_nothing(api, setup):
    screen, script = setup([])
    run = start(api)
    answer(api, run, ["deny"])
    assert api.wait_terminal(run)[-1]["type"] == "run_cancelled"
    assert script.requests == [] and screen.calls == []


def test_refusal_missing_key_and_permissions(api, setup):
    _, _ = setup([reply([], stop="refusal")])
    run = start(api)
    answer(api, run, ["allow"])
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "abgelehnt" in end["payload"]["error"]

    api.c.put("/api/session/secrets", headers=api.h, json={})
    run = start(api)
    end = api.wait_terminal(run)[-1]
    assert end["type"] == "run_failed" and "Anthropic-Schlüssel" in end["payload"]["error"]

    body = {"workflow": "desktop_ai", "input": {"window": "Rechner", "goal": "Rechne 2+3 aus"}}
    assert api.post("/api/tasks", {**body, "capabilities": ["desktop.read", "desktop.control"]}).status_code == 403
    assert api.post("/api/tasks", {**body, "input": {"window": "NEXORA AI", "goal": "Rechne 2+3 aus"}, "capabilities": CAPS}).status_code == 400
