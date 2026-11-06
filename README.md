# HOANGGIA SOCIAL CLIP AI — V1.0 MVP

Ứng dụng độc lập: React/Vite frontend + FastAPI backend + FFmpeg. Hiện tại chạy local qua trình duyệt; có nền tảng để đóng gói Desktop/Hybrid trong giai đoạn tiếp theo.

## Yêu cầu
- Windows 10/11, Python 3.11+, Node.js 20+, FFmpeg và ffprobe trong PATH.
- FFmpeg cần có encoder libx264 và aac.

## Chạy trên Windows (PowerShell)

Terminal 1:
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Terminal 2:
```powershell
cd frontend
npm install
npm run dev
```

Mở http://127.0.0.1:5173 . API docs tại http://127.0.0.1:8000/docs .

## Đã lập trình
- Upload MP4/MOV/MKV/WebM, kiểm tra metadata qua ffprobe, giới hạn 2 GB.
- Preview video, chọn điểm đầu/cuối, preset 9:16, 16:9, 1:1, 4:5.
- Chọn letterbox/pad hoặc crop trung tâm, render MP4 H.264/AAC.
- Theo dõi tiến độ qua FFmpeg, tải clip hoàn thành.

## Chưa triển khai
- AI highlights, Whisper subtitle, smart subject tracking, GPU encoder selection, persistent database, desktop installer, cloud worker, multiuser/auth, production-grade queue/cancel/retry.

## Lưu ý bảo mật
- Backend chỉ bind localhost khi chạy theo hướng dẫn. Không expose trực tiếp API này lên Internet: hiện chưa có xác thực, rate limit, quota hay cơ chế dọn dữ liệu tự động.
- Dữ liệu media/job lưu trong RAM, mất metadata khi khởi động lại. Video lưu trong data/.
- Không đưa file nguồn không đáng tin lên một máy chủ công cộng.

## Kiểm thử
```powershell
py -m pip install -r backend/requirements.txt pytest httpx
py -m pytest -q tests
```

GitHub Actions CI gồm kiểm thử backend (kể cả render video FFmpeg mẫu) và build frontend.
Tại thời điểm tạo bản MVP, backend đã qua 5 bài kiểm thử trên môi trường phát triển; frontend chưa thể xác nhận build tại đây do npm registry không khả dụng.

## Nhánh phát triển
Mã nguồn đầu tiên nằm trên develop/v1-mvp. Không tự động triển khai web public hoặc gộp vào main.
