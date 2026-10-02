# Phân tích trước implementation — Quiz Card, 02/10/2026

Nguồn: `/home/khang/Downloads/StudyHub_Quiz_Card_Implementation_Spec.md`. Figma Make không truy cập được bằng công cụ hiện tại; sử dụng phân cấp, nội dung và flow trong spec, không tuyên bố đối chiếu pixel Figma. Giới hạn mới 100 thay thế yêu cầu 120 của phiên sửa trước.

## Frontend

React 19/Vite; App.jsx ánh xạ `/app/quiz` tới view quiz, giữ nguyên route/header/nav. Thay JSX danh sách dài trong App bằng QuizCardPage; state bộ thẻ trong App vẫn được dùng bởi dashboard. QuizWorkspace tái sử dụng làm màn làm bài, QuizFlashCard và QuizResultSummary giữ rendering câu hỏi/chấm điểm. StudyDeckSession mở rộng review subset theo ID ổn định, giữ âm thanh, chỉnh màu, tiến độ. FlashcardDeckForm giữ chức năng tạo/sửa thủ công cũ.

Thêm component cục bộ QuizCardPage, LearningCreateModal dùng chung chọn môn/tài liệu cho hai loại, LearningDialog dùng native dialog cho tạo/xác nhận/đổi tên/ôn lại. Thêm CSS scope Quiz Card; dùng tokens index.css: primary-pink, secondary-mint, pink-soft, mint-soft, bg-main/bg-alt, text-dark/text-body, border-color, radius, shadow và Nunito Sans. Palette mới cho generation dùng token màu, tiếp tục hỗ trợ màu legacy để không mất màu bộ cũ.

API client api.js mở rộng getDocuments lọc subject_id, generate flashcards, quiz limits/start/rename/delete và thông tin time/difficulty của createQuiz. Không gọi provider từ trình duyệt. Authentication vẫn cookie/session, user trong App. Không gửi user_id làm nguồn quyền.

## Backend

server.py đang chứa routing; helpers get_engine, extract_document_text, document_text, require_user, update_streak, advance_document_progress được tái sử dụng. Service quizzes/service.py mở rộng count <=100, độ khó và giới hạn theo lượng nội dung. Service flashcards/service.py mở rộng tạo từ nguồn đã sở hữu, dùng get_engine.complete_json task riêng qua AI client hiện tại. Thêm quizzes/repository.py cho đọc/đổi tên/lưu lượt bắt đầu quiz, dùng bảng chat đang tồn tại.

Reuse: GET /subjects?scope=mine; GET /documents; GET/POST/DELETE /flashcards; POST /flashcards/:id/review; GET /quizzes/history; GET /quizzes/:id; POST /quizzes/generate; POST /quizzes/:id/submit.
Thêm: POST /flashcards/generate; POST /flashcards/:id/rename; POST /quizzes/limits; POST /quizzes/:id/start; POST /quizzes/:id/rename; DELETE /quizzes/:id. Giữ naming convention hiện tại. Ownership phải kiểm tra mọi đường vào; tài liệu phải cùng subject và đều do user sở hữu. POST submit tính điểm/duration từ server, bỏ score client; lượt bắt đầu có thời điểm và deadline server, kết quả submit idempotent cho cùng run.

## Database

Reuse users -> subjects(created_by) -> documents(uploaded_by,subject_id) -> document_chunks. File gốc tại storage_path; text lấy cache chunks hoặc extractor hiện tại. Danh sách subject là của user; query documents luôn filtered uploaded_by và subject_id.

Reuse flashcard_decks(user_id,id,payload): extend JSON subject_id/document_ids và mã theme; cards/remembered đã persist. Không tạo bảng cards/progress trùng.
Reuse chat_sessions(user_id,subject_id,document_id,title QUIZ_CARD:...) -> chat_messages: assistant JSON chứa quiz/questions; user JSON kind=quiz_attempt chứa kết quả/answers. Extend JSON time_limit/difficulty/subject và duration/correct_count/wrong_count. System JSON kind=quiz_run lưu start/deadline/completed result. Run gắn session và scope user, claim submit bằng conditional UPDATE trong transaction, không tạo duplicate attempt khi retry.
Không cần migration schema: payload cũ đọc với default time_limit=0, difficulty=mixed, subject chưa phân loại; existing attempts/decks giữ nguyên. Test khởi tạo lại DB và mở dữ liệu cũ, kiểm tra SQLite/MySQL adapter không có SQL dialect-specific mới.

## Không cần sửa

Không sửa AI chat/memory/assessment/roadmap behavior, payment/subscription, auth, upload extraction flow, focus space, mobile/Java archive, global navigation hoặc global palette. Chỉ thêm task prompt vào Nova client. Dashboard/streak tiếp tục nhận quiz_attempt và remembered như trước. Không triển khai prompt phân gói chưa commit, không tự push/merge từ yêu cầu sửa UI này.

## Kiểm thử theo phase

Backend: ownership, mixed subject, limit 100 và dynamic 20/50/100, generation/metadata, difficulty, rename/delete persist, clock/timer, idempotent submit và attempt history. Frontend: subject-first/reset selection, disabled input, flashcard generation->review->persist, subset stable, quiz create->timer->submit->result->retake, rename/delete, loading/errors, mobile/no overflow. Regression lint/build + backend suites + Playwright các flow cũ còn áp dụng.
