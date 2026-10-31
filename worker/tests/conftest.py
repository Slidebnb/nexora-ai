from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from nexora_worker.__main__ import build_manager
from nexora_worker.api import create_app

TOKEN = "t" * 48


class Api:
    def __init__(self, client: TestClient) -> None:
        self.c = client
        self.h = {"Authorization": f"Bearer {TOKEN}"}

    def get(self, path: str, **kw: Any):
        return self.c.get(path, headers=self.h, **kw)

    def post(self, path: str, json: Any = None, **kw: Any):
        return self.c.post(path, headers=self.h, json=json, **kw)

    def events(self, run_id: str) -> list[dict]:
        r = self.get(f"/api/runs/{run_id}/events")
        assert r.status_code == 200, r.text
        return r.json()

    def wait_for(self, run_id: str, pred: Callable[[list[dict]], bool], timeout: float = 10) -> list[dict]:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            evs = self.events(run_id)
            if pred(evs):
                return evs
            time.sleep(0.02)
        raise AssertionError(f"Timeout; Events: {[e['type'] for e in self.events(run_id)]}")

    def wait_type(self, run_id: str, type_: str) -> list[dict]:
        return self.wait_for(run_id, lambda evs: any(e["type"] == type_ for e in evs))

    def wait_terminal(self, run_id: str) -> list[dict]:
        return self.wait_for(run_id, lambda evs: any(e["type"] in ("run_succeeded", "run_failed", "run_cancelled") for e in evs))

    def approval_id(self, run_id: str) -> str:
        evs = self.wait_type(run_id, "approval_requested")
        return [e for e in evs if e["type"] == "approval_requested"][-1]["payload"]["approvalId"]


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture
def api(data_dir: Path) -> Iterator[Api]:
    manager = build_manager(data_dir)
    app = create_app(manager, TOKEN)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        yield Api(client)


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    root = tmp_path / "Downloads-Test"
    root.mkdir()
    for name, content in {
        "urlaub.jpg": b"jpg",
        "foto.PNG": b"png!",
        "rechnung.pdf": b"%PDF-1",
        "notizen.txt": b"hallo",
        "tabelle.xlsx": b"xl",
        "archiv.zip": b"PK",
        "unbekannt.xyz": b"?",
        ".versteckt": b"x",
    }.items():
        (root / name).write_bytes(content)
    (root / "Unterordner").mkdir()
    return root


ORG_CAPS = ["files.read", "files.move"]
