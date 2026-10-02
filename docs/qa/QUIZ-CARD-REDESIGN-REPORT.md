# Quiz Card redesign — 02/10/2026

Triển khai theo `StudyHub_Quiz_Card_Implementation_Spec.md`. Phân tích trước code ở [QUIZ-CARD-REDESIGN-ANALYSIS.md](QUIZ-CARD-REDESIGN-ANALYSIS.md). Figma Make không đọc được bằng công cụ hiện tại: layout/flow theo file đặc tả, màu/font/radius theo StudyHub; chưa đối chiếu pixel với canvas Figma.

## Luồng đã triển khai

- Hero gọn với hai CTA; danh sách Flashcard và trắc nghiệm riêng, dữ liệu tài khoản thực, loading/error/empty states.
- Modal chọn môn trước rồi fetch tài liệu đúng môn. Đổi môn xóa lựa chọn cũ; chọn nhiều tài liệu, tối đa 20 file. API kiểm tra ownership và cùng môn, không tin `user_id` client.
- Tạo Flashcard từ tài liệu trong kho bằng Nova; tên/mô tả, số lượng AI đề xuất hoặc 10/20/30/50 trong giới hạn nội dung; sáu màu lấy trực tiếp token StudyHub.
- Tự mở màn học sau tạo; giữ thao tác flip, âm thanh và đổi màu thẻ. Đã nhớ/chưa nhớ persist. Ôn tất cả hoặc subset chưa nhớ theo ID cố định: việc đánh dấu không làm thẻ biến mất giữa phiên, không ghi đè mất các thẻ ngoài subset.
- Đổi tên/xóa dùng modal thật và API; vẫn giữ trình sửa/tạo thẻ thủ công cũ qua menu/link phụ. Màu và tiến độ bộ cũ được giữ.
- Quiz chọn số câu nguyên dương, tối đa 100. Giới hạn nội dung: dưới 800 từ → 20; 800–2999 → 50; từ 3000 → 100. Đây là trần kỹ thuật theo lượng chữ, không cam kết mọi tài liệu đều đủ nội dung tốt để tạo số câu tối đa.
- Quiz có Dễ/Trung bình/Khó/Hỗn hợp, không giới hạn giờ hoặc 1–240 phút. Backend áp dụng difficulty cho generator và giữ kiểm tra đáp án/evidence đã có.
- Làm bài bắt đầu câu 1, giữ lựa chọn khi điều hướng, lưu snapshot đáp án lên server. Đồng hồ dùng deadline server; đến hạn tự nộp. Backend chỉ dùng snapshot trước hạn nếu nhận bài sau deadline.
- Server chấm điểm, lưu duration/correct/wrong/answers và mỗi lần làm mới là một attempt. Retry cùng run trả lại kết quả đã hoàn tất, không nhân đôi attempt. UI hiển thị điểm gần nhất và số lần làm; làm lại tạo run mới.
- Result có điểm, đúng/sai, thời gian, xem đáp án, làm lại và về Quiz Card. Xác nhận bài chưa xong vẫn giữ giao diện phía sau.

## API và lưu trữ

Reuse GET `/api/subjects?scope=mine`, GET `/api/documents` (thêm `subject_id`), CRUD `/api/flashcards`, review, quizzes/history/detail/generate/submit.

API bổ sung:

| API | Payload / tác dụng |
|---|---|
| POST `/api/quizzes/limits` | subject_id, document_ids → max_questions, max_flashcards, suggested_flashcards |
| POST `/api/flashcards/generate` | subject_id, document_ids, name, description, color, requested_count (null=auto) |
| POST `/api/flashcards/:id/rename` | name; không sửa tiến độ |
| POST `/api/quizzes/:id/rename` | name; giữ attempt |
| DELETE `/api/quizzes/:id` | xóa quiz/questions/runs/attempts qua cascade |
| POST `/api/quizzes/:id/start` | trả run_id, started_at, deadline, server_now |
| POST `/api/quizzes/:id/answers` | run_id, revision, answers; bỏ autosave cũ và không nhận sau deadline |
| POST `/api/quizzes/:id/submit` | answers, run_id; không nhận score/duration từ client làm nguồn tính điểm |

Generate Quiz thêm subject_id, title, question_count, difficulty, time_limit (0=không giới hạn). Frontend mặc định 30 rồi giảm theo trần nội dung; client legacy bỏ question_count vẫn dùng default 10 để tương thích. Quiz cũ có hơn 100 câu vẫn đọc/làm được; trần 100 áp dụng tạo mới.

Không thêm bảng hoặc migration destructive. Reuse `flashcard_decks.payload` cho subject_id/document_ids/cards/progress; `chat_sessions` có subject_id sẵn. Reuse `chat_messages`: assistant = định nghĩa quiz, system/quiz_run = đồng hồ và snapshot, user/quiz_attempt = kết quả. Conditional UPDATE claim run trước ghi attempt trong transaction. Record cũ dùng defaults time_limit=0, difficulty=mixed; old colors tiếp tục hợp lệ.

## Kiểm tra đã thực hiện

- Python API: 183 tests, 181 pass, 2 skip legacy UI.
- Backend database/auth/migration/MySQL adapter/streak: 32 pass.
- Frontend lint và production build: pass (cảnh báo chunk lớn có sẵn).
- Playwright: **11/11 pass**; bộ regression 8 test cũ được cập nhật theo menu/CTA mới; thêm ba flow Quiz Card cho subject filtering, 100 câu, timer, retake/delete và flashcard progress/subset.
- HTTP integration chạy provider fixture qua HTTP thật, DB test tạm: tạo 100 câu, lấy/đổi tên/xóa, chấm bài; khác user/cùng môn; expired deadline không nhận đáp án sửa muộn; retry không thêm attempt; snapshot cũ không ghi đè revision mới.
- Smoke Nova thật bằng fixture CSDL: tạo thành công 10 Flashcard và 2 câu mức khó. Không dùng dữ liệu tài liệu cá nhân cho smoke.
- Đã xem screenshot homepage, modal mobile và xác nhận nộp bài. Screenshot runtime trong `frontend/test-results/` không thuộc dữ liệu production.

## Test nhanh trên host

1. Vào Kho học liệu, tạo môn, upload ít nhất hai tài liệu cùng môn (có thể dùng fixture `fixtures/quiz-transactions.txt`).
2. Vào Quiz Card → Tạo bộ Flashcard → chọn môn/tài liệu → nhập tên → Nova → học, đánh dấu một số thẻ → đóng/reload. Kiểm tra progress, Ôn lại phần chưa nhớ, đổi tên và xóa.
3. Tạo trắc nghiệm: thử nhập 0, -1, 1.5, abc, 101; nút tạo bị chặn. Đổi môn phải mất chọn tài liệu môn trước.
4. Tạo 10 câu Hỗn hợp, Không giới hạn. Đáp án phải giữ khi đi tới/lùi lại. Nộp thiếu câu → làm tiếp vẫn giữ bài. Nộp thật → kết quả cập nhật trên card.
5. Làm lại → câu 1, đáp án rỗng, attempt mới. Chọn đề có hạn 1 phút → hết giờ tự nộp theo snapshot trước hạn.
6. Xóa bài → reload không còn bài; tài khoản khác không lấy/đổi/xóa được tài nguyên này.

## Giới hạn

Generation vẫn đồng bộ theo batch, đề dài có thể cần nhiều thời gian và phụ thuộc timeout provider/proxy. Không có job nền hoặc resume-generation. Kiểm tra evidence/schema không thay thế thẩm định chuyên môn của câu hỏi. Không thay đổi gói học, thanh toán, auth, roadmap hay AI chat; không tự push hoặc merge lần redesign này.
