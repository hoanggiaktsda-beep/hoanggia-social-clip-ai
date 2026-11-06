import json, os, shutil, subprocess, threading, uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(os.getenv('CLIP_DATA', Path(__file__).resolve().parent.parent / 'data')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
app = FastAPI(title='HOANGGIA SOCIAL CLIP AI', version='1.0.0-mvp')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])
MEDIA, JOBS = {}, {}
PRESETS = {'9:16':(1080,1920),'16:9':(1920,1080),'1:1':(1080,1080),'4:5':(1080,1350)}

class RenderRequest(BaseModel):
    media_id: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    aspect: str = '9:16'
    fit: str = 'pad'

def probe(path):
    p = subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)], capture_output=True,text=True,timeout=30)
    if p.returncode: raise ValueError('Video không hợp lệ hoặc ffprobe không đọc được')
    data=json.loads(p.stdout)
    video=next((s for s in data.get('streams',[]) if s.get('codec_type')=='video'),None)
    if not video: raise ValueError('Tệp không chứa luồng video')
    return {'duration':float(data['format'].get('duration') or 0),'width':video.get('width'),'height':video.get('height'),'codec':video.get('codec_name')}

@app.get('/api/health')
def health():
    return {'status':'ok','ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe')),'version':'1.0.0-mvp'}

@app.post('/api/media')
async def upload(file: UploadFile=File(...)):
    if Path(file.filename or '').suffix.lower() not in {'.mp4','.mov','.mkv','.webm'}: raise HTTPException(400,'Định dạng không hỗ trợ')
    mid=uuid.uuid4().hex
    folder=ROOT/mid; folder.mkdir()
    path=folder/('source'+Path(file.filename).suffix.lower())
    size=0
    try:
        with path.open('wb') as dest:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>2*1024**3: raise HTTPException(413,'Giới hạn 2 GB')
                dest.write(chunk)
        info=probe(path)
    except Exception as e:
        shutil.rmtree(folder,ignore_errors=True)
        if isinstance(e,HTTPException): raise
        raise HTTPException(400,str(e))
    MEDIA[mid]={'path':str(path),'info':info}
    return {'id':mid,'filename':file.filename,**info}

@app.get('/api/media/{media_id}')
def media_file(media_id:str):
    item=MEDIA.get(media_id)
    if not item: raise HTTPException(404,'Không tìm thấy video')
    return FileResponse(item['path'])

def render(job_id, req):
    job=JOBS[job_id]
    item=MEDIA[req.media_id]
    w,h=PRESETS[req.aspect]
    if req.fit=='crop': vf=f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}'
    else: vf=f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2'
    output=ROOT/req.media_id/(job_id+'.mp4')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-ss',str(req.start),'-i',item['path'],'-t',str(req.end-req.start),'-vf',vf+',setsar=1','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-progress','pipe:1',str(output)]
    try:
        job['status']='running'
        with subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as proc:
            for line in proc.stdout:
                if line.startswith('out_time_ms='):
                    try: job['progress']=min(99,round(int(line.split('=',1)[1])/1e6/(req.end-req.start)*100))
                    except ValueError: pass
            error=proc.stderr.read()
            if proc.wait()!=0: raise RuntimeError(error[-1000:])
        job.update(status='completed',progress=100)
    except Exception as exc:
        job.update(status='failed',error=str(exc))
        output.unlink(missing_ok=True)

@app.post('/api/render')
def start_render(req:RenderRequest):
    item=MEDIA.get(req.media_id)
    if not item: raise HTTPException(404,'Không tìm thấy video')
    if req.aspect not in PRESETS or req.fit not in {'pad','crop'}: raise HTTPException(400,'Preset không hợp lệ')
    if req.end<=req.start or req.end>item['info']['duration']+0.1: raise HTTPException(400,'Khoảng cắt không hợp lệ')
    job_id=uuid.uuid4().hex
    JOBS[job_id]={'status':'queued','progress':0,'media_id':req.media_id}
    threading.Thread(target=render,args=(job_id,req),daemon=True).start()
    return {'job_id':job_id}

@app.get('/api/jobs/{job_id}')
def job_status(job_id:str):
    if job_id not in JOBS: raise HTTPException(404,'Không tìm thấy tác vụ')
    return JOBS[job_id]

@app.get('/api/jobs/{job_id}/download')
def download(job_id:str):
    job=JOBS.get(job_id)
    if not job or job['status']!='completed': raise HTTPException(404,'Chưa có video đầu ra')
    return FileResponse(ROOT/job['media_id']/(job_id+'.mp4'),filename='hoanggia-clip.mp4',media_type='video/mp4')
