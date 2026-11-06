import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from backend import main as app_module

client = TestClient(app_module.app)

def test_health():
    response = client.get('/api/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['version'] == '1.0.0-mvp'

def test_upload_rejects_extension():
    response = client.post('/api/media', files={'file': ('malicious.exe', b'not video', 'application/octet-stream')})
    assert response.status_code == 400

def test_render_unknown_media():
    response = client.post('/api/render', json={'media_id': 'missing', 'start': 0, 'end': 1})
    assert response.status_code == 404

def test_job_unknown():
    assert client.get('/api/jobs/missing').status_code == 404

@pytest.mark.skipif(not (shutil.which('ffmpeg') and shutil.which('ffprobe')), reason='FFmpeg not installed')
def test_upload_probe_and_render(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, 'ROOT', tmp_path)
    video = tmp_path / 'input.mp4'
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(video)
    ], check=True, timeout=30)
    with video.open('rb') as stream:
        upload = client.post('/api/media', files={'file': ('sample.mp4', stream, 'video/mp4')})
    assert upload.status_code == 200, upload.text
    info = upload.json()
    assert info['width'] == 160
    assert info['height'] == 90
    assert info['duration'] >= 1.9
    invalid = client.post('/api/render', json={
        'media_id': info['id'], 'start': 0, 'end': info['duration'] + 5,
        'aspect': '9:16', 'fit': 'pad'
    })
    assert invalid.status_code == 400
    request = app_module.RenderRequest(media_id=info['id'], start=0, end=1, aspect='1:1', fit='pad')
    job_id = 'test-render-job'
    app_module.JOBS[job_id] = {'status': 'queued', 'progress': 0, 'media_id': info['id']}
    app_module.render(job_id, request)
    assert app_module.JOBS[job_id]['status'] == 'completed', app_module.JOBS[job_id]
    result = tmp_path / info['id'] / f'{job_id}.mp4'
    assert result.exists() and result.stat().st_size > 0
    rendered = app_module.probe(result)
    assert (rendered['width'], rendered['height']) == (1080, 1080)
    assert client.get(f'/api/jobs/{job_id}/download').status_code == 200
