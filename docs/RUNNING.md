# Chạy StudyHub sau khi clone

Stack chuẩn của repository là **React (`frontend/`) + Python API (`apps/python-api/`)**.
Nova AI đang dùng stack này. Không chạy các dự án lịch sử trong `archive/` hoặc cổng `8081`
cho luồng demo hiện tại.

## Yêu cầu

- Git
- Python 3.10 trở lên
- Node.js 20.19 trở lên (hoặc Node 22.12 trở lên)

MySQL, PostgreSQL, Docker và Java 17 là tùy chọn; không cần cho bản demo local mặc định.

## Khởi động lần đầu

Mở hai terminal tại thư mục gốc repository.

```powershell
cd apps/python-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python run.py
```

```powershell
cd frontend
npm ci
npm run dev
```

Mở URL Vite in ra (thường là `http://localhost:5173`). Frontend dùng đường dẫn
tương đối `/api`, Vite chuyển yêu cầu đến Python API ở `http://127.0.0.1:5000`.
Điều này tiếp tục hoạt động nếu Vite chuyển sang cổng 5174 hoặc 5175. Đổi
`VITE_API_PROXY_TARGET` nếu API local chạy ở host/cổng khác. Chỉ đặt
`VITE_API_BASE_URL` khi triển khai frontend và API ở các origin riêng.

Lần chạy đầu, Python API tự tạo SQLite tại `apps/python-api/data/studyhub.db` và
dữ liệu demo. File này, `.venv`, `node_modules`, `.env` và tài liệu người dùng tải
lên là dữ liệu riêng của máy; chúng không được GitHub đồng bộ.

## Quy ước cho cả nhóm

- Viết API frontend bằng đường dẫn tương đối `/api/...` hoặc qua `frontend/src/api.js`.
  Không ghi cứng `localhost:8081`.
- Chỉ chạy và phát triển `apps/python-api` khi làm backend cho giao diện Nova.
- `archive/` chỉ lưu phần thử nghiệm/lịch sử; không phải dependency của bản demo.
- Khi thêm biến môi trường, cập nhật file `.env.example` tương ứng, nhưng không commit
  giá trị bí mật hay database/upload runtime.

## API behavior verified by tests

- The API gateway applies per-IP token-bucket limits to `/api` requests (default 120 requests/minute, burst 30); login and registration have a stricter default (10/minute, burst 5). Excess requests return JSON `429` and `Retry-After`.
- API concurrency is capped at 32 requests per process by default. When all slots are occupied, new connections receive `503` with `Retry-After: 1`. Tune these values with `STUDYHUB_API_RATE_LIMIT_PER_MINUTE`, `STUDYHUB_API_BURST`, `STUDYHUB_AUTH_RATE_LIMIT_PER_MINUTE`, `STUDYHUB_AUTH_BURST`, and `STUDYHUB_MAX_CONCURRENT_REQUESTS` in `.env`.
- Limits use the client IP from the TCP connection (not client-supplied `X-Forwarded-For`). They are in-memory and per process; deployments with multiple API workers/replicas should enforce a shared limit at a trusted reverse proxy or Redis-backed gateway.

- `GET /api/quizzes/:id` returns questions and choices without answer keys or explanations. `POST /api/quizzes/:id/submit` returns grading and explanations, and quiz IDs are scoped to the signed-in user.
- Uploads accept files up to 20 MiB. Oversize requests return JSON `413`; failed size checks do not create a document row or file.
- Paid-plan upgrades return `501` while no payment provider is configured. A client-supplied payment method or status does not grant a plan. Existing downgrades are scheduled with an application-calculated effective date.
- CORS defaults to exact `localhost` and `127.0.0.1` origins on ports 5173–5175. Set `STUDYHUB_CORS_ORIGINS` to a comma-separated list of exact origins for another local setup.
- MySQL schema generation targets MySQL 8.0.16 or newer for enforced `CHECK` constraints and generated-column uniqueness.

## Kiểm tra trước khi push

```powershell
cd frontend
npm run lint
npm run build

cd ../apps/python-api
python -m unittest discover -s tests -p "test_*.py" -v
```
