"""Local FFmpeg processing API for HOANGGIA Social Clip AI.
Do not expose on the public internet without auth, isolation, quotas, job queue.
"""
from __future__ import annotations
import json
import os
import secrets
import subprocess
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(parents=True, exist_ok=True)
SITE_ROOT = ROOT.parent
ACCESS_TOKEN = os.environ.get("APP_ACCESS_TOKEN", "")

def require_access(x_app_token: str | None = Header(default=None)):
    if ACCESS_TOKEN and not secrets.compare_digest(x_app_token or "", ACCESS_TOKEN):
        raise HTTPException(401, "Access token không hợp lệ")

app = FastAPI(title="HOANGGIA SOCIAL CLIP AI — FFmpeg Clip Team", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[
    "http://localhost:8080", "http://127.0.0.1:8080",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "https://hoanggiaktsda-beep.github.io"
], allow_methods=["GET", "POST"], allow_headers=["*"])
PLATFORMS = {"tiktok": ("9:16", 60), "reels": ("9:16", 60),
             "shorts": ("9:16", 60), "twitter": ("16:9", 140),
             "linkedin": ("16:9", 600)}
RATIOS = {"9:16": (1080, 1920), "16:9": (1920, 1080),
          "1:1": (1080, 1080), "4:5": (1080, 1350)}

class ClipRequest(BaseModel):
    media_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    platform: Literal["tiktok","reels","shorts","twitter","linkedin"]
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    aspect: Literal["9:16","16:9","1:1","4:5"] | None = None
    fit: Literal["crop","pad"] = "crop"
    subtitles: str | None = Field(None, max_length=50000)

def probe(path: Path):
    result = subprocess.run(["ffprobe","-v","error","-show_streams",
        "-show_format","-of","json",str(path)],
        capture_output=True,text=True,timeout=30)
    if result.returncode: raise ValueError("FFprobe không đọc được video")
    data=json.loads(result.stdout)
    video=next((x for x in data.get("streams",[]) if x.get("codec_type")=="video"),None)
    if not video: raise ValueError("Tệp không chứa video")
    return {"duration":float(data["format"].get("duration") or 0),
            "width":video["width"],"height":video["height"],
            "codec":video.get("codec_name"),"size":path.stat().st_size}

def source(media_id: str):
    folder=DATA/media_id
    matches=list(folder.glob("source.*")) if folder.is_dir() else []
    if not matches: raise HTTPException(404,"Không tìm thấy video")
    return matches[0]

def output_spec(req: ClipRequest, total: float):
    target=req.aspect or PLATFORMS[req.platform][0]
    limit=PLATFORMS[req.platform][1]
    if req.end<=req.start or req.end>total+.1 or req.end-req.start>limit:
        raise ValueError("Khoảng cắt vượt giới hạn preset hoặc nguồn")
    w,h=RATIOS[target]
    mode="increase" if req.fit=="crop" else "decrease"
    flt="scale="+str(w)+":"+str(h)+":force_original_aspect_ratio="+mode
    flt+=(",crop="+str(w)+":"+str(h)) if req.fit=="crop" else (
        ",pad="+str(w)+":"+str(h)+":(ow-iw)/2:(oh-ih)/2")
    return target,flt+",setsar=1"

@app.get("/api/health")
def health():
    return {"status":"ok","version":"2.0.0","engine":"FFmpeg local"}

@app.get("/api/platforms")
def platforms():
    return {k:{"aspect_ratio":v[0],"max_duration_seconds":v[1]}
            for k,v in PLATFORMS.items()}

@app.post("/api/media", dependencies=[Depends(require_access)])
async def upload(file: UploadFile=File(...)):
    ext=Path(file.filename or "").suffix.lower()
    if ext not in {".mp4",".mov",".mkv",".webm"}:
        raise HTTPException(400,"Định dạng video không hỗ trợ")
    media_id=uuid.uuid4().hex
    folder=DATA/media_id
    folder.mkdir()
    path=folder/("source"+ext)
    try:
        size=0
        with path.open("wb") as output:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>500*1024*1024:
                    raise HTTPException(413,"Giới hạn thử nghiệm: 500 MB")
                output.write(chunk)
        metadata=probe(path)
    except Exception as exc:
        path.unlink(missing_ok=True)
        folder.rmdir()
        if isinstance(exc,HTTPException): raise
        raise HTTPException(400,str(exc))
    return {"media_id":media_id,"filename":file.filename,**metadata}

@app.post("/api/clips", dependencies=[Depends(require_access)])
def render(req: ClipRequest):
    path=source(req.media_id)
    try:target,flt=output_spec(req,probe(path)["duration"])
    except ValueError as exc:raise HTTPException(400,str(exc))
    clip_id=uuid.uuid4().hex
    folder=DATA/req.media_id
    output=folder/(clip_id+".mp4")
    thumb=folder/(clip_id+".jpg")
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
         "-ss",str(req.start),"-i",str(path),"-t",str(req.end-req.start),
         "-vf",flt,"-c:v","libx264","-crf","23","-preset","fast",
         "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
         "-movflags","+faststart",str(output)]
    try:
        subprocess.run(cmd,check=True,capture_output=True,timeout=900)
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
            "-i",str(output),"-frames:v","1",str(thumb)],
            check=True,capture_output=True,timeout=60)
        info=probe(output)
    except (subprocess.SubprocessError,OSError,ValueError) as exc:
        output.unlink(missing_ok=True)
        thumb.unlink(missing_ok=True)
        raise HTTPException(500,"FFmpeg không xuất được clip") from exc
    caption="not_generated"
    if req.subtitles:
        (folder/(clip_id+".srt")).write_text(req.subtitles,encoding="utf-8")
        caption="provided_sidecar"
    report={"clip_id":clip_id,"platform":req.platform,
            "file":{"filename":output.name,"duration":info["duration"],
                    "aspect_ratio":target,"file_size":info["size"]},
            "caption_status":caption,
            "thumbnail_filename":thumb.name,
            "encoding":{"video":"H.264","crf":23,"audio":"AAC","audio_bitrate":"128k"},
            "notes":["Preset thời lượng lấy từ đặc tả agent tham khảo.",
                     "AI highlights và tạo phụ đề tự động chưa có."]}
    (folder/(clip_id+".json")).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return report

@app.get("/api/clips/{media_id}/{clip_id}/{kind}", dependencies=[Depends(require_access)])
def download(media_id: str,clip_id: str,kind: Literal["mp4","jpg","json","srt"]):
    for key in (media_id,clip_id):
        if len(key)!=32 or any(ch not in "0123456789abcdef" for ch in key):
            raise HTTPException(400,"ID không hợp lệ")
    path=DATA/media_id/(clip_id+"."+kind)
    if not path.is_file():raise HTTPException(404,"Tệp không tồn tại")
    return FileResponse(path,filename="HOANGGIA-CLIP-"+clip_id[:8]+"."+kind)


# Same-origin static frontend for a single-service Render deployment.
@app.get("/")
def frontend_home():
    return FileResponse(SITE_ROOT / "index.html", media_type="text/html")

@app.get("/clip-app.js")
def frontend_js():
    return FileResponse(SITE_ROOT / "clip-app.js", media_type="text/javascript")

@app.get("/assets/logo.svg")
def brand_icon():
    return FileResponse(SITE_ROOT / "assets" / "logo.svg", media_type="image/svg+xml")
