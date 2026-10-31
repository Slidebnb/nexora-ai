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
