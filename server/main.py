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
RATIOS = {"9:16": (540, 960), "16:9": (960, 540),
          "1:1": (540, 540), "4:5": (540, 675)}
HD_RATIOS = {"9:16": (720, 1280), "16:9": (1280, 720),
             "1:1": (720, 720), "4:5": (720, 900)}
# Conservative resolution for Render Free; upgrade only after measuring peak memory.

class ClipRequest(BaseModel):
    media_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    platform: Literal["tiktok","reels","shorts","twitter","linkedin"]
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    aspect: Literal["9:16","16:9","1:1","4:5"] | None = None
    fit: Literal["crop","pad"] = "crop"
    quality: Literal["standard","hd"] = "standard"
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
    w,h=(HD_RATIOS if req.quality=="hd" else RATIOS)[target]
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
    if req.quality=="hd" and req.end-req.start>15:
        raise HTTPException(400,"720p thử nghiệm giới hạn 15 giây để tránh quá tải Render Free")
    clip_id=uuid.uuid4().hex
    folder=DATA/req.media_id
    output=folder/(clip_id+".mp4")
    thumb=folder/(clip_id+".jpg")
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
         "-ss",str(req.start),"-i",str(path),"-t",str(req.end-req.start),
         "-vf",flt,"-c:v","libx264","-crf","24","-preset","ultrafast",
         "-threads","1", "-filter_threads","1",
         "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
         "-movflags","+faststart",str(output)]
    try:
        subprocess.run(cmd,check=True,capture_output=True,timeout=180)
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
            "encoding":{"video":"H.264","crf":24,"audio":"AAC","audio_bitrate":"128k","profile":"low_memory_"+("720p" if req.quality=="hd" else "540p")},
            "notes":["Preset thời lượng lấy từ đặc tả agent tham khảo.",
                     "AI highlights và tạo phụ đề tự động chưa có."]}
    (folder/(clip_id+".json")).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return report


class Segment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)

class MontageRequest(BaseModel):
    media_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    segments: list[Segment] = Field(min_length=2,max_length=8)
    platform: Literal["tiktok","reels","shorts","twitter","linkedin"]
    aspect: Literal["9:16","16:9","1:1","4:5"] | None = None
    fit: Literal["crop","pad"] = "crop"
    quality: Literal["standard","hd"] = "standard"

@app.post("/api/montage", dependencies=[Depends(require_access)])
def montage(req: MontageRequest):
    """Join selected ranges from ONE source. Encode each part consistently, then concat."""
    import tempfile
    path=source(req.media_id)
    total=probe(path)["duration"]
    duration=sum(p.end-p.start for p in req.segments)
    limit=min(PLATFORMS[req.platform][1],15 if req.quality=="hd" else 60)
    if duration>limit or duration<=0:
        raise HTTPException(400,"Tổng thời lượng vượt giới hạn xử lý")
    spec=ClipRequest(media_id=req.media_id,platform=req.platform,start=0,end=1,
                     aspect=req.aspect,fit=req.fit,quality=req.quality)
    target,flt=output_spec(spec,total)
    for p in req.segments:
        if p.end<=p.start+.05 or p.end>total+.1:
            raise HTTPException(400,"Đoạn cắt không hợp lệ")
    folder=DATA/req.media_id
    clip_id=uuid.uuid4().hex
    output=folder/(clip_id+".mp4")
    thumb=folder/(clip_id+".jpg")
    try:
        with tempfile.TemporaryDirectory(dir=folder) as temp:
            temp=Path(temp)
            parts=[]
            for i,p in enumerate(req.segments):
                part=temp/("part_"+str(i)+".mp4")
                cmd=["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
                     "-ss",str(p.start),"-i",str(path),"-t",str(p.end-p.start),
                     "-vf",flt,"-c:v","libx264","-crf","24","-preset","ultrafast",
                     "-threads","1","-filter_threads","1","-pix_fmt","yuv420p",
                     "-c:a","aac","-b:a","128k","-ar","44100","-ac","2",str(part)]
                subprocess.run(cmd,check=True,capture_output=True,timeout=120)
                parts.append(part)
            manifest=temp/"list.txt"
            manifest.write_text("".join("file '"+p.name+"'\\n" for p in parts),encoding="utf-8")
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
                "-f","concat","-safe","1","-i",str(manifest),"-c","copy",
                "-movflags","+faststart",str(output)],
                check=True,capture_output=True,timeout=90)
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
            "-i",str(output),"-frames:v","1",str(thumb)],check=True,capture_output=True,timeout=45)
        info=probe(output)
    except (subprocess.SubprocessError,OSError,ValueError) as exc:
        output.unlink(missing_ok=True)
        thumb.unlink(missing_ok=True)
        raise HTTPException(500,"Không thể ghép các đoạn video") from exc
    report={"clip_id":clip_id,"platform":req.platform,
            "file":{"filename":output.name,"duration":info["duration"],
                    "aspect_ratio":target,"file_size":info["size"]},
            "segments":[p.model_dump() for p in req.segments],
            "quality":req.quality,"thumbnail_filename":thumb.name,
            "notes":["Ghép nhiều đoạn từ cùng một video nguồn; chưa hỗ trợ nhiều video nguồn."]}
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
