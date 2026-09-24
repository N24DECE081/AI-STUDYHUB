# AI StudyHub

Monorepo cho StudyHub. Mỗi thành viên chỉ cần làm việc trong đúng thư mục thuộc phạm vi của mình.

| Thư mục | Vai trò | Runtime mặc định |
| --- | --- | --- |
| `frontend/` | React/Vite UI (Giao diện chính) | `npm run dev` trên cổng 5173 |
| `apps/python-api/` | API chính: auth, session, upload, tiến độ và AI Tutor local-RAG | `python run.py` trên cổng 5000 |
| `archive/` | Lưu trữ mã nguồn cũ (Spring Boot, Vanilla UI) | Không dùng để chạy |

## Cấu hình môi trường (Environment Setup)

Trước khi chạy dự án, cần tạo file `.env` từ `.env.example`:

**Backend:**
```powershell
cd apps/python-api
cp .env.example .env
# Chỉnh sửa .env nếu cần (port, database, CORS)
```

**Frontend:**
```powershell
cd frontend
cp .env.example .env
# Thường không cần chỉnh sửa cho local development
```

**Ghi chú:**
- File `.env` chứa cấu hình cục bộ, KHÔNG commit vào Git (đã có trong `.gitignore`)
- File `.env.example` là mẫu tham khảo, commit vào Git để team biết cần cấu hình gì

## Chạy dự án

Terminal 1:

```powershell
cd apps/python-api
python -m pip install -r requirements.txt
python run.py
```

Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

Mở URL Vite hiển thị, thường là `http://localhost:5173`. Vite tự proxy `/api` sang Python API ở `http://127.0.0.1:5000`.

**Nếu port 5173 bị chiếm:**
Vite tự động chạy trên port 5174, 5175, v.v. Backend CORS mặc định cho phép `localhost` và `127.0.0.1` trên các port 5173–5175. Nếu dùng origin khác, thêm chính xác origin đó vào `STUDYHUB_CORS_ORIGINS` trong `apps/python-api/.env`.

## Luồng đã tích hợp

- `POST /api/auth/register`, `/login`, `/logout` và `GET /api/auth/me`: session cookie thật.
- `POST /api/upload`: upload có xác thực.
- `GET /api/documents`, `GET /api/documents/:id`: kho học liệu.
- `GET` / `POST /api/progress`: lưu tiến độ theo user.
- `POST /api/ai/chat`: AI Tutor local-RAG; câu hỏi không hợp lệ hoặc tài liệu không tồn tại trả JSON lỗi an toàn.

Thanh toán là luồng demo: API không kích hoạt gói trả phí khi chưa có payment provider. Hạ gói/hủy gia hạn chỉ được lên lịch cho subscription đã tồn tại.

## Quy tắc làm việc nhóm

1. Không push trực tiếp vào `main`. Tạo nhánh `feat/<ten-tinh-nang>` và mở Pull Request.
2. Không commit `node_modules`, `.venv`, `.env`, database SQLite, upload runtime hoặc API key.
3. Thay đổi API phải cập nhật test ở `apps/python-api/tests/` và mô tả contract trong PR.
4. Không chỉnh đồng thời `frontend/` và `apps/python-api/web/` cho cùng một UI; React frontend là UI chính. Vanilla UI trong Python API chỉ giữ tương thích/preview.

## Kiểm tra trước khi mở PR

```powershell
cd frontend
npm run build
npm run lint

cd ../apps/python-api
python -m unittest discover -s tests -p "test_*.py" -v
```
