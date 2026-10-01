# STUDYHUB – FINAL QA REPORT

Ngày: 2026-09-30. Phạm vi: document autofill, flashcard color/pronunciation, streak/fire.

## MODULE 1 – AI DOCUMENT AUTOFILL

PASS: 6 test unit/API chuyên biệt. FAIL: 0. BLOCKED: 0 trong phạm vi kiểm thử tự động.

Đã kiểm tra JSON thiếu/sai field, exception/timeout provider, file rỗng/hỏng/quá lớn, TXT/MD/CSV, PDF nhiều trang, DOCX/PPTX/XLSX, tiếng Việt/Anh, tài liệu dài, preview không tự lưu. E2E dùng một lượt upload/extraction thật với engine offline và một lượt suggestion có cấu trúc được mock: lưu nguyên đề xuất, sửa một phần, reload bản nháp, lỗi API giữ dữ liệu người dùng.

## MODULE 2 – FLASHCARD

PASS: 7 test unit/API chuyên biệt. FAIL: 0. BLOCKED: 0 trong phạm vi kiểm thử tự động.

Đã kiểm tra toàn bộ palette, màu không hợp lệ, màu thẻ kế thừa deck, schema lỗi, ID thẻ trùng, database round-trip, sửa/xóa/tạo lại, cô lập theo user, review. IPA có/không có audio, từ/cụm từ và chữ hoa/thường, timeout và dữ liệu thiếu được kiểm tra. E2E kiểm tra play/pause/resume/replay, hủy audio khi đổi thẻ, audio chậm timeout, offline vẫn lật/học được thẻ, reload đúng màu và viewport mobile.

## MODULE 3 – STREAK

PASS: 7 test unit/database và 1 test HTTP chuyên biệt. FAIL: 0. BLOCKED: 0 trong phạm vi kiểm thử tự động.

Đã kiểm tra GMT+7 trước/sau nửa đêm, nhiều sự kiện cùng ngày, ngày cách quãng, ngày tương lai, counter cũ không tạo lịch sử giả, cuối năm và năm nhuận. Login/GET không tạo study event. E2E kiểm tra review ghi nhận streak và animation ở mức 0/1/2/≥3, bao gồm reduced motion.

## FULL REGRESSION

| Suite | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| Python API (`tests/`) | 159 | 0 | 2 |
| Backend/database (`backend/tests/`) | 32 | 0 | 0 |
| Playwright Chromium | 6 | 0 | 0 |
| Tổng | 197 | 0 | 2 |

Các số theo module là tập con của test Python; E2E kiểm tra chéo nhiều module nên không cộng lại theo module. Hai test skip thuộc giao diện vanilla cũ không có trong repo, đã xuất hiện ở baseline.

Baseline trước thay đổi: API 146 pass / 2 skip; backend 28 pass; lint/build pass.

Happy-path E2E chính không có page error. Các lỗi mạng/503 trong test âm thanh và preview là lỗi chủ động mô phỏng để xác nhận fallback. Không khẳng định không bao giờ có API/console error trong mọi môi trường.

## BUILD

Frontend: PASS (`npm run lint`, `npm run build`).
Backend: PASS (`python -m compileall -q server.py backend/app`).
Local smoke sau restart: frontend 5173 HTTP 200, API qua proxy `/api/health` HTTP 200.

## CRITICAL BUGS

Không còn lỗi chặn được phát hiện trong phạm vi các test trên.

## ROOT CAUSE

- Bộ thẻ chỉ lưu localStorage; thiếu API/database và contract phát âm.
- Màu không được chuẩn hóa thống nhất; CSS thẻ chưa thể hiện rõ màu, màu mặc định từ suggestion bị hiểu là override thay vì kế thừa deck.
- GET/login tự tạo activity day; logic recovery cộng streak qua các ngày bị bỏ lỡ. CSS animation bật cả khi streak bằng 0.
- Chưa có bước upload → extract → đề xuất JSON → người dùng xác nhận riêng cho flashcard.

## FIX APPLIED

- Thêm preview chỉ đọc file tạm, validate/normalize JSON, fallback có cảnh báo; form chỉnh sửa và bản nháp theo user/deck.
- Thêm API CRUD/review với user scope và bảng `flashcard_decks`; chuyển bộ thẻ local sang database trước khi xóa cache.
- Màu theo palette, nullable override để kế thừa deck, preview/render/persistence thống nhất.
- Contract pronunciation thống nhất; IPA và audio tùy chọn, audio timeout/cleanup và TTS thiết bị khi thiếu URL.
- Streak tính từ tập ngày liên tiếp GMT+7; chỉ ghi ngày học từ hoạt động học, fire theo mức streak, tôn trọng reduced motion.

## FILES CHANGED

Backend:
- `apps/python-api/backend/app/flashcards/__init__.py`
- `apps/python-api/backend/app/flashcards/service.py`
- `apps/python-api/backend/app/ai_tutor/engine.py` (thêm prompt cho task metadata)
- `apps/python-api/backend/app/db/schema.sql`
- `apps/python-api/backend/app/security/service.py` (logic streak dùng chung)
- `apps/python-api/server.py` (endpoint flashcard và study-event hooks)

Frontend:
- `frontend/src/App.jsx`, `frontend/src/api.js`
- `frontend/src/components/StudyDeckSession.jsx`
- `frontend/src/components/flashcard/FlashcardDeckForm.jsx`
- `frontend/src/components/flashcard/Pronunciation.jsx`
- `frontend/src/components/flashcard/flashcardTheme.js`
- `frontend/src/components/flashcard/flashcard.css`
- `frontend/src/components/streak/streak.css`
- `frontend/src/components/progress/ProgressDashboard.jsx` (fire theo streak)

Tests và tài liệu:
- `apps/python-api/tests/test_flashcards.py`
- `apps/python-api/tests/test_server_integration.py`
- `apps/python-api/backend/tests/test_auth.py`
- `apps/python-api/backend/tests/test_database.py`
- `apps/python-api/backend/tests/test_streak.py`
- `frontend/tests/flashcards.e2e.cjs`, `frontend/playwright.config.cjs`
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/.gitignore`
- `docs/qa/flashcards-streak-contract.md`, báo cáo này.

## OUT OF SCOPE / REGRESSION FINDINGS

- Cảnh báo Vite chunk lớn hơn 500 kB đã có ở baseline; không refactor các module khác.
- `npm audit` báo một dependency gián tiếp `brace-expansion` mức high; không tự nâng dependency ngoài phạm vi.
- Một lượt regression trung gian gặp timeout khởi tạo fixture provider; test provider chạy riêng và toàn bộ suite lần cuối đều pass, không sửa phần không liên quan.

## GIỚI HẠN XÁC MINH

- Browser mobile là viewport Chromium, chưa xác nhận trên thiết bị vật lý/Safari.
- Test provider và âm thanh có mock; không gọi AI trả phí, không đánh giá chất lượng nội dung của model thật hay âm thanh qua loa thực.
- Database đã kiểm thử bằng SQLite; chưa chạy với MySQL server thật.
- DOC/PPT nhị phân cũ hoặc tài liệu scan không có text có thể bị extractor hiện tại từ chối 422; không bổ sung OCR/chuyển đổi Office legacy ngoài phạm vi này.

## FINAL STATUS

READY cho kiểm thử local trong phạm vi đã xác minh. Đây không phải chứng nhận tất cả provider, thiết bị và database production.

## Bổ sung sửa lỗi ngày 2026-10-01

Phát hiện thiếu tích hợp: tính năng gợi ý trước đây chỉ có ở form flashcard, chưa được gọi từ form upload Kho học liệu. Đã thêm `/api/documents/preview` và nối cả chọn file lẫn kéo-thả; giữ nguyên phần người dùng tự sửa, chống response cũ khi đổi file. Cải thiện fallback để bỏ marker trang/header trường và giữ tên AI hợp lệ ngay cả khi nội dung flashcard AI lỗi.

Xác minh sau sửa:
- API regression: 162 pass, 2 skip (164 test).
- Playwright: 8 pass, gồm 2 test mới cho tên upload, lưu/reload, gõ trong khi AI đang chạy và đổi file liên tiếp.
- Lint/build: PASS.
- Kiểm tra trực tiếp backend đang chạy với DeepSeek, file mẫu `scan001.txt` chứa nội dung Java OOP: trả tên **Lập trình hướng đối tượng trong Java**, không có warning. Chỉ preview, không lưu tài liệu mẫu vào kho.
- Backend đã restart để áp dụng endpoint mới.

## Bổ sung giao diện bộ thẻ ngày 2026-10-01

- Màu và mẫu bìa phủ toàn bộ card trong danh sách, thay vì chỉ một dải màu phía trên. Màu chữ đổi theo palette để đọc rõ cả màu tối.
- Nút ôn tập có hàng riêng; Chỉnh sửa/Xóa bộ thẻ nằm cạnh nhau, có icon, chiều cao tối thiểu 44px và trạng thái hover/focus.
- Lint/build pass. Chạy lại 2 E2E liên quan đến tạo/sửa/xóa, màu và reload: pass.
- Kiểm tra trực quan cả 7 màu ở desktop, dark mode và viewport 390px; không tràn ngang hoặc page error. Các thao tác sửa/xóa đã được thực hiện trên database QA tạm, không thay đổi dữ liệu người dùng.
