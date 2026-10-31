import json
import os
import subprocess
import sys
import time

import httpx

TOKEN = "p" * 48


def test_worker_process_lifecycle(tmp_path):
    env = {**os.environ, "NEXORA_WORKER_TOKEN": TOKEN}
    proc = subprocess.Popen(
        [sys.executable, "-m", "nexora_worker", "--data-dir", str(tmp_path / "d"), "--watch-stdin"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True,
    )
    try:
        line = proc.stdout.readline()
        assert line.startswith("NEXORA_WORKER_READY "), line + proc.stderr.read()
        port = json.loads(line.split(" ", 1)[1])["port"]
        base = f"http://127.0.0.1:{port}"
        r = httpx.get(f"{base}/api/health", headers={"Authorization": f"Bearer {TOKEN}"})
        assert r.status_code == 200 and "organize_folder" in r.json()["workflows"]
        assert httpx.get(f"{base}/api/health").status_code == 401
        assert (tmp_path / "d" / "nexora.db").is_file()
        log = (tmp_path / "d" / "logs" / "worker.log")
        assert TOKEN not in (log.read_text() if log.exists() else "")
        proc.stdin.close()  # Elternprozess „stirbt“
        assert proc.wait(timeout=10) == 0
    finally:
        if proc.poll() is None:
            proc.kill()


def test_refuses_short_token(tmp_path):
    env = {**os.environ, "NEXORA_WORKER_TOKEN": "kurz"}
    r = subprocess.run([sys.executable, "-m", "nexora_worker", "--data-dir", str(tmp_path)], env=env, capture_output=True, text=True, timeout=30)
    assert r.returncode == 2


def test_worker_exits_when_parent_dies_even_with_open_websocket(tmp_path):
    """Regression: offene WS-Verbindung darf das Beenden nicht blockieren (verwaiste Prozesse)."""
    import asyncio

    import websockets

    env = {**os.environ, "NEXORA_WORKER_TOKEN": TOKEN}
    proc = subprocess.Popen(
        [sys.executable, "-m", "nexora_worker", "--data-dir", str(tmp_path / "d"), "--watch-stdin"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True,
    )
    try:
        port = json.loads(proc.stdout.readline().split(" ", 1)[1])["port"]

        async def hold_open() -> None:
            async with websockets.connect(f"ws://127.0.0.1:{port}/api/events") as ws:
                await ws.send(json.dumps({"type": "auth", "token": TOKEN, "after": 0}))
                assert json.loads(await ws.recv())["type"] == "replay_done"
                proc.stdin.close()
                t0 = time.monotonic()
                while proc.poll() is None and time.monotonic() - t0 < 10:
                    await asyncio.sleep(0.1)

        asyncio.run(hold_open())
        assert proc.wait(timeout=1) == 0
    finally:
        if proc.poll() is None:
            proc.kill()
            raise AssertionError("Worker hat sich nicht beendet")


BUNDLED = os.path.join(os.path.dirname(__file__), "..", "..", "app", "build", "worker", "nexora-worker" + (".exe" if sys.platform == "win32" else ""))


def test_bundled_sidecar_starts(tmp_path):
    """Prüft die mit PyInstaller gebaute Programmdatei (nur wenn vorhanden: `uv run --group build python build_sidecar.py`)."""
    import pytest

    if not os.path.exists(BUNDLED):
        pytest.skip("Sidecar nicht gebaut")
    env = {**os.environ, "NEXORA_WORKER_TOKEN": TOKEN}
    proc = subprocess.Popen([BUNDLED, "--data-dir", str(tmp_path / "d"), "--watch-stdin"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
    try:
        line = proc.stdout.readline()
        assert line.startswith("NEXORA_WORKER_READY "), line + proc.stderr.read()
        port = json.loads(line.split(" ", 1)[1])["port"]
        health = httpx.get(f"http://127.0.0.1:{port}/api/health", headers={"Authorization": f"Bearer {TOKEN}"}).json()
        assert set(health["workflows"]) >= {"organize_folder", "undo_organize", "web_research", "pdf_analysis", "draft_emails", "desktop_routine", "connector_action"}
        # Desktop-Bedienung im gebündelten Programm: unter Windows müssen pywinauto/comtypes geladen sein
        win = httpx.get(f"http://127.0.0.1:{port}/api/desktop/windows", headers={"Authorization": f"Bearer {TOKEN}"})
        if sys.platform == "win32":
            assert win.status_code == 200 and isinstance(win.json(), list), win.text
        else:
            assert win.status_code == 409 and "nur unter Windows" in win.json()["detail"], win.text
        proc.stdin.close()
        assert proc.wait(timeout=15) == 0
    finally:
        if proc.poll() is None:
            proc.kill()
