$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw "Thiếu Python launcher (py)" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Thiếu Node.js/npm" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw "Thiếu FFmpeg trong PATH" }
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) { throw "Thiếu FFprobe trong PATH" }
if (-not (Test-Path "backend/.venv/Scripts/python.exe")) {
    py -m venv backend/.venv
}
& backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Push-Location frontend
try {
    npm install --no-audit --no-fund
} finally { Pop-Location }
Write-Host "Backend: http://127.0.0.1:8000/docs"
Write-Host "Frontend: http://127.0.0.1:5173"
$api = Start-Process -FilePath (Resolve-Path "backend/.venv/Scripts/python.exe") -ArgumentList "-m","uvicorn","backend.main:app","--host","127.0.0.1","--port","8000" -PassThru
try {
    Push-Location frontend
    try { npm run dev } finally { Pop-Location }
} finally {
    Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
}
