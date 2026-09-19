# AI StudyHub

Monorepo cho StudyHub. Mỗi thành viên chỉ cần làm việc trong đúng thư mục thuộc phạm vi của mình.

| Thư mục | Vai trò | Runtime mặc định |
| --- | --- | --- |
| `frontend/` | React/Vite UI | `npm run dev` trên cổng 5173 |
| `apps/python-api/` | API chính: auth, session, upload, tiến độ và AI Tutor local-RAG | `python run.py` trên cổng 5000 |
| `backend/` | Spring Boot thử nghiệm cho Gemini/AI | Không phải API mặc định |

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

### Chạy một giao diện thống nhất (production-like)

Sau khi hoàn tất thay đổi UI, build React rồi chỉ chạy Python API. Python sẽ tự phục vụ `frontend/dist`, vì vậy web và API dùng cùng một giao diện tại `http://127.0.0.1:5000`.

```powershell
cd frontend
npm run build

cd ../apps/python-api
python run.py
```

## Luồng đã tích hợp

- `POST /api/auth/register`, `/login`, `/logout` và `GET /api/auth/me`: session cookie thật.
- `POST /api/upload`: upload có xác thực.
- `GET /api/documents`, `GET /api/documents/:id`: kho học liệu.
- `GET` / `POST /api/progress`: lưu tiến độ theo user.
- `POST /api/ai/chat`: AI Tutor local-RAG; câu hỏi không hợp lệ hoặc tài liệu không tồn tại trả JSON lỗi an toàn.

Thanh toán, hủy gói và hoàn tiền là UI mockup; không được coi là giao dịch thật cho đến khi có payment provider và API riêng.

## Quy tắc làm việc nhóm

1. Không push trực tiếp vào `main`. Tạo nhánh `feat/<ten-tinh-nang>` và mở Pull Request.
2. Không commit `node_modules`, `.venv`, `.env`, database SQLite, upload runtime hoặc API key.
3. Thay đổi API phải cập nhật test ở `apps/python-api/tests/` và mô tả contract trong PR.
4. React frontend là UI duy nhất. `apps/python-api/web/` chỉ là legacy fallback khi chưa có `frontend/dist`; không phát triển tính năng mới ở đó.

## Kiểm tra trước khi mở PR

```powershell
cd frontend
npm run build
npm run lint

cd ../apps/python-api
python -m unittest discover -s tests -p "test_*.py" -v
```
