# P1 — QA checklist (Windows / Hybrid foundation)

## CI
- Python backend unit tests and real FFmpeg render
- SQLite queue tests
- TypeScript compile and Vite build

## Windows manual acceptance
1. Install Python 3.11+, Node 20+, FFmpeg/FFprobe; run scripts/start-windows.ps1.
2. Confirm UI at 127.0.0.1:5173 and health at 127.0.0.1:8000/api/health.
3. Upload an MP4 with audio and verify duration, dimensions and preview.
4. Export a 5-second 9:16 padded clip; verify audio, video and duration.
5. Export a cropped 1:1 clip; verify aspect ratio and no unexpected distortion.
6. Attempt invalid time range and unsupported extension; verify errors.
7. Restart backend and verify existing SQLite job status via /api/v2/jobs/{id}.
8. Test a second queued job and confirm serial execution.

## Known limits
- UI still uses /api/render v1. /api/v2/render is available for integration next.
- Media metadata remains in RAM; upload references do not survive process restart.
- SQLite worker is one-process only. Do not run uvicorn with multiple workers.
- No authentication, quotas, cancellation, automatic cleanup or sandbox isolation.
- Windows hardware, Tauri packaging and cloud deployment are not yet verified.
