import sqlite3
import time
from pathlib import Path

import pytest

from backend import worker

def test_queue_database(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "ROOT", tmp_path)
    monkeypatch.setattr(worker, "DB", tmp_path / "jobs.sqlite3")
    worker.initialize()
    with worker.connect() as db:
        db.execute("""INSERT INTO jobs
          (id,media_id,source,start,end,aspect,fit,status,progress,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,'running',0,?,?)""",
          ("job1", "media1", "source.mp4", 0, 1, "9:16", "pad", time.time(), time.time()))
    worker.initialize()
    assert worker.get_job("job1")["status"] == "queued"
    worker.update("job1", status="completed", progress=100)
    assert worker.get_job("job1")["progress"] == 100

def test_missing_job(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "ROOT", tmp_path)
    monkeypatch.setattr(worker, "DB", tmp_path / "jobs.sqlite3")
    worker.initialize()
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        worker.get_job("missing")
    assert exc.value.status_code == 404
