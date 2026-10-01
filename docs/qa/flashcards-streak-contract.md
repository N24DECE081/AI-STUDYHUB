# Flashcard và streak: phạm vi, contract và kiểm thử

## Dependency map

- Tạo/sửa thẻ: `App.jsx` → `FlashcardDeckForm` → `api.js` → `/api/flashcards` → `flashcards/service.py` → bảng `flashcard_decks`.
- Gợi ý tài liệu: `FlashcardDeckForm` → `/api/flashcards/preview` → extractor hiện có → `ProviderEngine.complete_json(flashcard_metadata)` → schema chuẩn hóa → form chỉnh sửa. Preview không tạo document/deck; file tạm được dọn sau extraction.
- Màu: palette frontend/backend → nullable card color (kế thừa màu deck) → JSON trong database → chuẩn hóa khi render. Màu ngoài palette về xanh mặc định.
- Phát âm: `StudyDeckSession` → `Pronunciation` → `/api/flashcards/pronunciation` → dictionary. Âm thanh phát bằng HTML Audio; thiếu audio thì thử speech synthesis của thiết bị. Không lưu key ở frontend.
- Chuỗi ngày: đọc tài liệu, nộp quiz/bài tập hoặc đánh giá flashcard → `update_streak(record=True)` → `user_activity_days` → chuỗi ngày GMT+7 → animation. Đăng nhập và GET streak không tạo ngày học.

Các thay đổi ở auth chỉ thay hành vi hàm streak dùng chung. Các thay đổi trong progress/quiz/exercise chỉ ghi nhận study event hoặc điều khiển biểu tượng streak; không thay cách chấm, course, roadmap hay chat.

## API (yêu cầu đăng nhập)

| Request | Dữ liệu | Thành công | Lỗi chính |
| --- | --- | --- | --- |
| POST `/api/flashcards/preview` | multipart, một `file`, tối đa 20 MiB | 200 `{suggestion, warning}` | 400 file rỗng/format, 413 quá lớn, 422 không đọc được |
| GET `/api/flashcards` | — | 200 danh sách deck của chính user | 401 |
| POST `/api/flashcards` | deck JSON | 201 tạo / 200 sửa | 400 schema, 401 |
| DELETE `/api/flashcards/:id` | — | 200 `{ok:true}` | 401, 404 không thuộc user |
| POST `/api/flashcards/:id/review` | `{card_id, rating:"known"\|"again"}` | 200 `{deck, streak}` | 400 rating, 401, 404 |
| GET `/api/flashcards/pronunciation?term=...` | từ/cụm tiếng Anh | 200 `{term,pronunciation,audioUrl}` | 401; lỗi dictionary trả các trường trống |
| GET `/api/streak` | — | 200 trạng thái tính từ các ngày hoạt động | 401 |

Schema deck:

```json
{
  "id": "uuid",
  "name": "Tên bộ thẻ",
  "subject": "English",
  "description": "Mô tả người dùng đã xác nhận",
  "keywords": ["vocabulary"],
  "difficulty": "beginner",
  "color": "#38bdf8",
  "cover": "plain",
  "cards": [{
    "id": "card-uuid",
    "front": "important",
    "back": "quan trọng",
    "color": null,
    "language": "en",
    "pronunciation": "/ɪmˈpɔːrtənt/",
    "audioUrl": "",
    "remembered": false
  }]
}
```

`difficulty`: beginner/intermediate/advanced. `cover`: plain/lines/grid. Một deck có 1–100 thẻ, ID thẻ không trùng. `color:null` ở thẻ nghĩa là kế thừa deck. IPA/audio là tùy chọn, không cản trở việc học. Chỉ nhận URL audio HTTPS từ các host dictionary đã cho phép.

Bản nháp form lưu theo user và deck trong localStorage; đóng/reload giữ bản nháp, save thành công xóa bản nháp. Upload mới phải xác nhận trước khi thay dữ liệu đã nhập. Trường nhập bị khóa trong lúc phân tích; lỗi AI/API giữ bản nháp. Bộ thẻ local cũ được chuyển lên API trước khi xóa cache local.

Streak chỉ nối các ngày liền nhau. Chuỗi của hôm qua còn hiệu lực trong hôm nay; nếu đã bỏ qua trọn một ngày thì current streak về 0. Lần học tiếp theo bắt đầu từ 1. Không còn khôi phục tự động vượt khoảng trống. Ngày hiện tại do server xác định theo GMT+7, không nhận ngày do client tự gửi. Lịch sử ngày thực có là nguồn dữ liệu chính, không suy diễn lịch sử từ counter cũ.

## Chạy kiểm thử

```bash
cd apps/python-api
STUDYHUB_NO_DOTENV=1 .venv/bin/python -m unittest discover -s tests -p 'test_*.py'
PYTHONPATH=backend STUDYHUB_NO_DOTENV=1 .venv/bin/python -m unittest discover -s backend/tests -p 'test_*.py'
.venv/bin/python -m compileall -q server.py backend/app

cd ../../frontend
npm ci
npx playwright install chromium
npm run lint
npm run build
npm run test:e2e
```

E2E tự mở backend 5013 và Vite 5183 với database/upload trong thư mục tạm riêng, không đọc `.env` và không dùng database thật. Kiểm thử browser dùng Chromium, có viewport mobile và reduced motion. Test IPA/audio dùng dữ liệu hoặc media mock để không phụ thuộc mạng và loa thiết bị. Provider lỗi/timeout/JSON sai được kiểm tra bằng mock; không sử dụng API key trả phí trong test.

## Bổ sung 2026-10-01: gợi ý tên trong Kho học liệu

`POST /api/documents/preview` dùng cùng bước validate/extract của preview flashcard, nhưng gọi task `document_metadata` và trả `{suggestion: {title, description}, warning}`. Không lưu document trong bước preview.

Chọn file hoặc kéo thả trong **Upload tài liệu mới** sẽ tự gọi endpoint này. Tên/mô tả tự điền chỉ khi người dùng chưa chỉnh trường tương ứng. Người dùng có thể chủ động chọn **Dùng tên gợi ý**. Khi đổi file/hủy modal, request cũ được hủy; kết quả cũ không được áp vào file mới. Khi provider lỗi, fallback bỏ qua marker trang/tên trường và ưu tiên heading nội dung.
