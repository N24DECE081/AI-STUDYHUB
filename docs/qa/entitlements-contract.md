# StudyHub: quyền gói và kiểm thử

## Policy hiện tại

| Quyền / hạn mức | Free (Khởi Động) | Plus (Pro Sinh Viên) | Pro (Master Thủ Khoa) |
| --- | --- | --- | --- |
| Giá niêm yết / tháng | 0đ | 199.000đ | 299.000đ |
| Nova AI Tutor | 10 lượt thành công/ngày | Không giới hạn | Không giới hạn |
| Tài liệu đang lưu | 5 | Không giới hạn | Không giới hạn |
| Tổng thẻ flashcard đang lưu | 20 | Không giới hạn | Không giới hạn |
| Đề Quiz đang lưu | 2 | Không giới hạn | Không giới hạn |
| Lộ trình | Mẫu chuẩn, LocalEngine | Cá nhân hóa | Cá nhân hóa |
| Chấm bài tập | LocalEngine, không trừ lượt Tutor | Engine cấu hình, không trừ lượt Tutor | Engine cấu hình, không trừ lượt Tutor |
| Preview flashcard AI, tạo Quiz từ tài liệu / chat | Cần Plus | Có | Có |
| Đề mẫu cơ bản, flashcard thủ công | Có | Có | Có |

Mọi quyền được tính từ subscription còn hiệu lực trong DB. Client chỉ hiển thị snapshot từ `GET /api/me/entitlements`; `localStorage` không lưu subscription. Ngày quota và `resets_at` dùng múi giờ Việt Nam. `remaining` trừ cả lượt đã dùng và lượt đang reserve. Lượt bị lỗi được release; retry cùng `Idempotency-Key` của lượt đã hoàn tất trả lại kết quả đã lưu.

## Contract API

| API | Kết quả chính |
| --- | --- |
| `GET /api/me/entitlements` (`/api/subscription` là alias) | `plan`, `status`, `expires_at`, `scheduled_change`, `capabilities`, `usage`, `authority: "server"` |
| `POST /api/upload` | `201` khi lưu; `409 resource_limit_exceeded` khi vượt 5 tài liệu Free. File tạm được dọn nếu bị từ chối. |
| `POST /api/flashcards` | `200/201`; `409 resource_limit_exceeded` khi vượt tổng 20 thẻ Free. |
| `POST /api/quizzes/basic` | `201` với `sample: true`, `sample_notice`; tối đa 2 đề Free. `GET /api/quizzes/:id` giữ nhãn đề mẫu. |
| `POST /api/quizzes/generate`, `POST /api/flashcards/preview` | `403 feature_not_in_plan` cho Free, `required_plan: "plus"`. |
| `POST /api/ai-tutor/roadmap` | Free trả `roadmap_kind: "standard"`; Plus/Pro trả `"personalized"`. GET giữ trường này. |
| `POST /api/ai-tutor/exercises/:id/submit` | Free chấm tại chỗ; không thay đổi `usage.tutor_chat`. |
| `POST /api/ai/chat`, `POST /api/ai-tutor/chat` | Chấp nhận header `Idempotency-Key`; Free hết lượt trả `429 quota_exceeded`, `resets_at`, `Retry-After`. CORS cho phép header này. |
| `POST /api/subscription/checkout` | Nâng gói trả `501 payment_unavailable`, không kích hoạt. Hạ gói được lên lịch tại `expires_at` đã lưu; nếu subscription không có ngày hết hạn, dùng ranh giới chu kỳ được chọn. |
| `POST /api/subscription/cancel` | Lên lịch về Free tại `expires_at` đã lưu; nếu không có, dùng ranh giới tháng. |
| `POST /api/mock-exam`, `/api/knowledge-gap`, `/api/thesis-cv-advisor`, `/api/offline-export`, `/api/nova-voice` | `501 feature_unavailable`, kể cả Pro; yêu cầu đăng nhập. |

Lỗi API giữ `status`, `code`, `detail` ở frontend để giao diện có thể phân biệt `403`, `409`, `429` và `501`. Draft Quiz và flashcard được giữ khi yêu cầu lỗi. Các tính năng **Sắp có**: Mock Exam, phân tích lỗ hổng kiến thức, cố vấn đồ án/CV, xuất offline và Nova Voice. Giá gói không đại diện cho việc các tính năng này đã hoạt động.

## Migration và rollback

Khởi động DB tạo `subscription_changes`, `entitlement_usage`, `entitlement_reservations` nếu thiếu. Migration catalog chỉ chuyển hàng `plans.name = standard` có giá 199.000đ và `ai_daily_limit = 100` sang `NULL` (không giới hạn); giá và giới hạn tùy chỉnh không bị thay. DB SQLite và MySQL đều chạy migration idempotent.

Trước rollback, sao lưu DB. Nếu cần khôi phục chính sách cũ, chỉ đặt `plans.ai_daily_limit = 100` cho hàng Standard có giá 199.000đ và `ai_daily_limit IS NULL` **sau khi xác nhận không có cấu hình không giới hạn do quản trị viên đặt**. Không xóa ba bảng entitlement khi còn lịch hạ gói hoặc reservation; phiên bản cũ không đọc các bảng đó và có thể để nguyên. Đổi lại mã ứng dụng trước khi xóa schema nếu thật sự cần rollback schema.

## Kiểm thử ba gói

Kết quả xác minh ngày 01/10/2026: 171 unittest API (`2 skipped`), 32 unittest backend, frontend ESLint và Vite build đều qua; Playwright E2E qua 8/8 ca.

Ví dụ cấp quyền trực tiếp trên SQLite test cho hai tài khoản riêng (sau khi đăng ký):

```sql
INSERT INTO subscriptions(user_id, plan_id, status, expires_at)
SELECT u.id, p.id, 'active', datetime('now', '+30 days')
FROM users u, plans p
WHERE u.email = 'plus-test@example.test' AND lower(p.name) = 'standard';

INSERT INTO subscriptions(user_id, plan_id, status, expires_at)
SELECT u.id, p.id, 'active', datetime('now', '+30 days')
FROM users u, plans p
WHERE u.email = 'pro-test@example.test' AND lower(p.name) = 'premium';
```

Chạy tại `apps/python-api`:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py' -q
PYTHONPATH=backend python -m unittest discover -s backend/tests -p 'test_*.py' -q
```

Chạy tại `frontend`: `npm install`, `npm run lint`, `npm run build`, `npm run test:e2e`. Cấu hình Playwright tự tạo SQLite tạm; test UI mock snapshot Plus cho đường preview, còn test HTTP cấp Plus bằng SQL trực tiếp. Để kiểm tra thủ công Plus/Pro, tạo user test riêng rồi `INSERT INTO subscriptions(user_id,plan_id,status,expires_at)` với `plan_id` của Standard/Premium; gọi lại `GET /api/me/entitlements` sau mỗi thay đổi. Với Free, dùng user mới chưa có subscription. Kiểm tra Free bị chặn preview/tạo Quiz AI, vẫn làm đề mẫu, và lần upload thứ sáu trả `409` mà không sinh file.
