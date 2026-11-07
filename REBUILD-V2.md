# HOANGGIA SOCIAL CLIP AI — Clean Rebuild V2.0 (Preview)

Bản dựng lại độc lập, dựa trên đặc tả agent [social-media-clip-creator](https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/agents/ffmpeg-clip-team/social-media-clip-creator.md) của davila7.

## Kiến trúc
- Frontend HTML/CSS/JS ở thư mục gốc: xem video, chọn đoạn cắt, preset, thumbnail, lệnh FFmpeg và JSON ngay trên trình duyệt.
- Backend FastAPI + FFmpeg tại server/: upload, trim, crop/pad, encode MP4 H.264/AAC, thumbnail JPEG, JSON report.
- Giao diện tiếng Việt với logo và bảng màu HOANGGIA STUDIO; responsive.

## Quy trình
1. Chọn video nguồn và mốc thời gian.
2. Chọn preset TikTok, Instagram Reels, YouTube Shorts, X/Twitter, LinkedIn.
3. Chọn tỷ lệ và crop/pad; kiểm tra độ dài theo preset.
4. Kết nối backend có FFmpeg để xuất MP4 và thumbnail.
5. Xem/tải JSON metadata; SRT thủ công có thể lưu như tệp riêng.

Các mức giới hạn nền tảng trong agent gốc chỉ là preset tham khảo, không phải thông số chính sách được xác minh cho năm 2026.

## Trạng thái
| Chức năng | Trạng thái |
| --- | --- |
| Web preview, IN/OUT timeline, preset và metadata | Đã lập trình |
| Thumbnail trong trình duyệt | Đã lập trình, tùy codec |
| FFmpeg backend xuất MP4, JPG, JSON | Đã lập trình, cần chạy backend |
| Phụ đề SRT | Nhập và lưu sidecar, chưa auto và chưa burn-in |
| AI Highlight, nhận dạng tiếng nói | Chưa triển khai |
| Triển khai public website | Chưa xác minh; GitHub Pages cũ đang bị lỗi deployment |

## Chạy web preview
Mở index.html bằng Chrome/Edge hoặc đưa các file web lên static host. Khi chưa kết nối API, nút xuất MP4 bị khóa theo thiết kế.

## Chạy backend cục bộ
Cài Python 3.11+, FFmpeg, FFprobe rồi chạy từ thư mục root:
~~~powershell
python -m pip install -r server/requirements.txt
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
~~~
Nhập địa chỉ http://127.0.0.1:8000 ở trường API trong web preview dùng từ localhost.

## QA
~~~powershell
python -m pip install -r server/requirements.txt
python -m pytest -q server/tests
~~~
CI xác minh mã JS và kiểm thử API với video FFmpeg mẫu.

## Bảo mật
Backend này dành cho localhost. Không đưa thẳng lên Internet khi chưa có xác thực, quota, cách ly FFmpeg, hàng đợi công việc, giới hạn tài nguyên, dọn file và chính sách dữ liệu.

Bản mới nằm trên nhánh rebuild-v2-clean. Giữ nguyên main và gh-pages lỗi để tránh phá dữ liệu.


## Triển khai web trực tiếp trên Render

Đã có Dockerfile và render.yaml cho một dịch vụ duy nhất, cùng origin:
- Render đóng gói Python FastAPI + FFmpeg + web HTML/JS.
- Website truy cập root /, API /api/health, upload /api/media, tạo clip /api/clips.
- Render Blueprint đặt plan free dành cho preview; cần kiểm tra hạn mức Render trước khi triển khai.
- Biến môi trường APP_ACCESS_TOKEN được Render tạo ngẫu nhiên. Người dùng có quyền truy cập cần nhập giá trị token trong UI để upload/render.
- Không đưa token vào repository hoặc HTML public.
- Free instance có RAM hạn chế, tự ngủ và filesystem tạm thời; file upload và clip bị mất sau khi service khởi động lại. Chỉ xử lý clip nhỏ trong thời gian thử nghiệm.
- Để public production cần worker queue, quota/rate-limit, storage ngoài, làm sạch dữ liệu và kiểm soát truy cập đầy đủ.

Khi kết nối Render với ChatGPT hoặc sử dụng Dashboard của Render, chọn repository này và nhánh rebuild-v2-clean, sau đó triển khai Blueprint. Không triển khai nhánh gh-pages đang bị lỗi.

## Bảo vệ file đầu ra
Các endpoint upload, render và tải MP4/JPG/JSON/SRT đều yêu cầu X-App-Token khi APP_ACCESS_TOKEN được cấu hình. Trình duyệt dùng fetch kèm header, tải về bằng Blob URL cục bộ thay vì liên kết tải trực tiếp không xác thực. Không chia sẻ khóa này công khai.
