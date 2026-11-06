"""Persistent SQLite job queue with a single FFmpeg worker (local MVP)."""
import json
import os
import sqlite3
import subprocess
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v2", tags=["render-v2"])
ROOT = Path(os.getenv("CLIP_DATA", Path(__file__).resolve().parent.parent / "data")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
DB = ROOT / "jobs.sqlite3"
LOCK = threading.Lock()
STOP = threading.Event()
WORKER = None
PRESETS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350)}

def connect():
    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

def initialize():
    with connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, media_id TEXT NOT NULL, source TEXT NOT NULL,
            start REAL NOT NULL, end REAL NOT NULL, aspect TEXT NOT NULL,
            fit TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
            error TEXT, output TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
        )""")
        db.execute("UPDATE jobs SET status='queued', progress=0 WHERE status='running'")

def update(job_id, **values):
    if not values:
        return
    values["updated_at"] = time.time()
    with connect() as db:
        db.execute("UPDATE jobs SET " + ", ".join(f"{k}=?" for k in values) + " WHERE id=?",
                   [*values.values(), job_id])

def get_job(job_id):
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Không tìm thấy tác vụ")
    return dict(row)

class Request(BaseModel):
    media_id: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    aspect: str = "9:16"
    fit: str = "pad"

def run_job(job):
    job_id = job["id"]
    w, h = PRESETS[job["aspect"]]
    if job["fit"] == "crop":
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    else:
        vf = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
    output = ROOT / job["media_id"] / (job_id + ".mp4")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
           "-ss", str(job["start"]), "-i", job["source"], "-t", str(job["end"] - job["start"]),
           "-vf", vf + ",setsar=1", "-c:v", "libx264", "-preset", "veryfast",
           "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
           "-movflags", "+faststart", "-progress", "pipe:1", str(output)]
    try:
        update(job_id, status="running", progress=0)
        with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as proc:
            for line in proc.stdout:
                if line.startswith("out_time_ms="):
                    try:
                        p = int(line.split("=", 1)[1]) / 1e6 / (job["end"] - job["start"])
                        update(job_id, progress=max(0, min(99, int(p * 100))))
                    except ValueError:
                        pass
            error = proc.stderr.read()
            if proc.wait() != 0:
                raise RuntimeError(error[-1000:])
        update(job_id, status="completed", progress=100, output=str(output))
    except Exception as exc:
        output.unlink(missing_ok=True)
        update(job_id, status="failed", error=str(exc)[:1000])

def worker_loop():
    while not STOP.is_set():
        with connect() as db:
            row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
        if row:
            run_job(dict(row))
        else:
            STOP.wait(0.4)

def start_worker():
    global WORKER
    with LOCK:
        if WORKER is not None and WORKER.is_alive():
            return
        STOP.clear()
        initialize()
        WORKER = threading.Thread(target=worker_loop, daemon=True, name="clip-render-worker")
        WORKER.start()

def stop_worker():
    STOP.set()
    if WORKER:
        WORKER.join(timeout=2)

@router.post("/render")
def enqueue(req: Request):
    from backend import main
    media = main.MEDIA.get(req.media_id)
    if media is None:
        raise HTTPException(404, "Không tìm thấy video")
    if req.aspect not in PRESETS or req.fit not in ("pad", "crop"):
        raise HTTPException(400, "Preset không hợp lệ")
    if req.end <= req.start or req.end > media["info"]["duration"] + 0.1:
        raise HTTPException(400, "Khoảng cắt không hợp lệ")
    start_worker()
    job_id = uuid.uuid4().hex
    now = time.time()
    with connect() as db:
        db.execute("""INSERT INTO jobs
            (id,media_id,source,start,end,aspect,fit,status,progress,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,'queued',0,?,?)""",
            (job_id, req.media_id, media["path"], req.start, req.end, req.aspect, req.fit, now, now))
    return {"job_id": job_id, "status": "queued"}

@router.get("/jobs/{job_id}")
def status(job_id: str):
    job = get_job(job_id)
    return {key: job[key] for key in ("id", "status", "progress", "error")}

@router.get("/jobs/{job_id}/download")
def download(job_id: str):
    job = get_job(job_id)
    if job["status"] != "completed" or not job["output"] or not Path(job["output"]).is_file():
        raise HTTPException(404, "Video chưa sẵn sàng")
    return FileResponse(job["output"], filename="hoanggia-clip.mp4", media_type="video/mp4")
