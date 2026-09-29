# Chuyen_Gia_AI knowledge base

Đặt tài liệu được phép sử dụng cho knowledge base tại thư mục này. Không commit tài liệu riêng tư, dữ liệu cá nhân hoặc nội dung có bản quyền khi chưa được phép.

## Quy ước nhập liệu

- Định dạng dự kiến: PDF, DOCX và Markdown.
- Giữ tên file ổn định để citation không bị thay đổi ngoài ý muốn.
- Với PDF scan, chạy OCR trước khi index.
- Kiểm tra metadata số trang sau khi parse; không tạo citation trang nếu parser không cung cấp metadata này.

## Trạng thái tích hợp

Cấu hình đích nằm tại `../settings/knowledge.yaml`. Python API hiện tại chưa tích hợp Docling/LightRAG và vẫn dùng các document chunk trong database cùng bộ xếp hạng từ khóa nội bộ.
