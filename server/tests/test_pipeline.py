import subprocess
import uuid
import pytest
from fastapi.testclient import TestClient
from server import main as m

client=TestClient(m.app)

def test_health():
    assert client.get("/api/health").json()["status"]=="ok"

def test_platforms():
    info=client.get("/api/platforms").json()
    assert info["twitter"]["max_duration_seconds"]==140
    assert info["linkedin"]["aspect_ratio"]=="16:9"

def test_upload_rejects_bad_extension():
    response=client.post("/api/media",files={"file":("bad.exe",b"not a video")})
    assert response.status_code==400

def test_invalid_range():
    req=m.ClipRequest(media_id="0"*32,platform="tiktok",start=0,end=61)
    with pytest.raises(ValueError):m.output_spec(req,100)

def test_crop_geometry():
    req=m.ClipRequest(media_id="0"*32,platform="tiktok",start=0,end=5)
    aspect,flt=m.output_spec(req,10)
    assert aspect=="9:16" and "crop=1080:1920" in flt

def test_render_real_ffmpeg(tmp_path,monkeypatch):
    monkeypatch.setattr(m,"DATA",tmp_path)
    media_id=uuid.uuid4().hex
    directory=tmp_path/media_id
    directory.mkdir()
    source=directory/"source.mp4"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
        "-f","lavfi","-i","color=c=blue:s=160x90:r=10:d=2",
        "-c:v","libx264","-pix_fmt","yuv420p",str(source)],
        check=True,timeout=30)
    req=m.ClipRequest(media_id=media_id,platform="shorts",
        start=0,end=1,aspect="1:1",fit="pad")
    report=m.render(req)
    assert report["file"]["aspect_ratio"]=="1:1"
    for extension in ("mp4","jpg","json"):
        assert (directory/(report["clip_id"]+"."+extension)).is_file()
    assert m.probe(directory/(report["clip_id"]+".mp4"))["width"]==1080
