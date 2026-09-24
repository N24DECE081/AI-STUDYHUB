# AI StudyHub

Monorepo cho StudyHub. Mỗi thành viên chỉ cần làm việc trong đúng thư mục thuộc phạm vi của mình.

| Thư mục | Vai trò | Runtime mặc định |
| --- | --- | --- |
| `frontend/` | React/Vite UI (Giao diện chính) | `npm run dev` trên cổng 5173 |
| `apps/python-api/` | API chính: auth, session, upload, tiến độ và AI Tutor local-RAG | `python run.py` trên cổng 5000 |
| `archive/` | Lưu trữ mã nguồn cũ (Spring Boot, Vanilla UI) | Không dùng để chạy |

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

## Luồng đã tích hợp

- `POST /api/auth/register`, `/login`, `/logout` và `GET /api/auth/me`: session cookie thật.
- `POST /api/upload`: upload có xác thực.
- `GET /api/documents`, `GET /api/documents/:id`: kho học liệu.
- `GET` / `POST /api/progress`: lưu tiến độ theo user.
- `POST /api/ai/chat`: AI Tutor local-RAG; câu hỏi không hợp lệ hoặc tài liệu không tồn tại trả JSON lỗi an toàn.
- `POST /api/ai-tutor/chat`, `/assessment/start`, `/assessment/submit`, `/roadmap`, `/exercises`, `/exercises/:id/submit`: luồng AI Tutor (chat, đánh giá năng lực, lộ trình, luyện tập & chấm điểm).
- `GET /api/ai-tutor/conversations`: lịch sử hội thoại của chính người đang đăng nhập (tin nhắn lưu ở server; frontend cache thêm ở localStorage để hiện ngay).

## AI Tutor (Nova)

Nova trả lời theo hai chế độ, tự chọn khi backend khởi động:

- **Provider thật** (mô hình ngôn ngữ): bật bằng cách tạo `apps/python-api/.env` từ `.env.example` và điền **một** API key
  (ví dụ `DEEPSEEK_API_KEY=...` hoặc `OPENAI_API_KEY=...`), hoặc đặt `STUDYHUB_AI_PROVIDER` / `STUDYHUB_AI_API_KEY` /
  `STUDYHUB_AI_BASE_URL` / `STUDYHUB_AI_MODEL`. Có thể dùng Ollama local, khi đó không cần key.
- **Offline local-RAG**: khi không có key, Nova vẫn trả lời nhưng chỉ dựa trên tài liệu anh tải lên
  (trích câu liên quan, giải thích, ví dụ, tạo quiz có đáp án kiểm chứng, tóm tắt, chấm điểm tất định).
  Nếu chưa có tài liệu phù hợp, Nova nói rõ là chưa tìm thấy nội dung và liệt kê tài liệu đang có, **không bịa**.

`GET /api/ai-tutor/engine` cho biết đang chạy chế độ nào và tên model (không bao giờ trả về API key); UI hiển thị badge
"Nova offline (bám theo tài liệu của bạn)" hoặc tên model ở góc phải trang Trò chuyện.

**Khi model lỗi (hết quota, key bị từ chối, provider sập, mất mạng):** Nova không sập. Backend tự trả lời bằng
engine offline (kèm dòng cảnh báo lý do trong câu trả lời), badge đổi thành "… — tạm lỗi: <lý do>" và lộ trình/bài tập
vẫn sinh được. Khi provider hoạt động lại, lần gọi thành công kế tiếp tự xoá cảnh báo — không cần khởi động lại.

**Chấm điểm:** trắc nghiệm và bài tính toán luôn do backend đối chiếu đáp án/số (không thể sai). Bài viết và bài
lập trình do model chấm theo rubric khi có key (nhận xét cụ thể từng ý); không có key thì backend chấm theo từ khoá.
Mỗi kết quả có nhãn `graded_by` để UI hiện "Nova (AI) chấm" hay "Chấm tự động".

API key **chỉ** nằm ở backend: frontend không nhận key và không gọi trực tiếp provider. Test tự động đặt
`STUDYHUB_NO_DOTENV=1` nên không bao giờ đọc `.env` thật hay gọi model tốn tiền.

Thanh toán, hủy gói và hoàn tiền là UI mockup; không được coi là giao dịch thật cho đến khi có payment provider và API riêng.

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
