# Changelog StudyHub

Tài liệu này ghi nhận các thay đổi đã được đưa vào nhánh `main` để thành viên dễ kiểm tra phạm vi và thời điểm cập nhật.

## 2026-09-19 — Nova AI Tutor, giao diện và luồng subscription

### Frontend

- Giữ React/Vite là giao diện chính tại `frontend/` và giữ nguyên luồng Nova AI Tutor.
- Bổ sung trang AI Tutor Nova: tạo, tìm, xóa nhiều hội thoại; chế độ Explain, Solve, Hint, Summarize, Generate Quiz; retry lỗi; sao chép câu trả lời; upload/chọn tài liệu làm ngữ cảnh.
- Loại bỏ AI Tutor cũ khỏi Dashboard và loại bỏ UI “không gian học nhóm”.
- Sửa scroll trang và trạng thái đăng xuất để xóa phiên giao diện hiện tại.
- Áp dụng theme tối đỏ–xanh dương, font và phong cách card/navbar từ giao diện backend cũ vào React; không ghép hai website.
- Khi mở một tài liệu và chọn “Hỏi Nova”, document ID được chuyển vào AI Tutor thay vì upload lại tệp.

### API và backend

- Bổ sung contract `POST /api/ai-tutor/chat` cho Nova, không đưa API key AI vào frontend.
- Bổ sung API subscription:
  - `GET /api/subscription`
  - `POST /api/subscription/checkout`
  - `POST /api/subscription/cancel`
- Thêm bảng `subscription_changes` để lưu thay đổi gói chờ áp dụng.
- Nâng gói được áp dụng ngay trong môi trường demo; hạ gói hoặc hủy gia hạn chỉ được lên lịch cuối chu kỳ, tránh mất quyền lợi hiện tại.
- Checkout là demo an toàn: không thu thập hoặc lưu số thẻ/cổng thanh toán thật.

### Kiểm tra đã chạy

- Frontend: `npm run lint` đạt.
- Backend: 15/15 tests đạt, gồm đăng nhập, upload, AI Tutor, nâng gói và hạ gói theo lịch.

## Quy ước cập nhật tiếp theo

- Mỗi thay đổi chức năng đưa vào `main` phải bổ sung một mục mới theo ngày ở đầu file này.
- Không ghi mật khẩu, API key, token hoặc dữ liệu người dùng vào changelog.
