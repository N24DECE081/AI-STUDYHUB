# Tạo Flashcard và bài trắc nghiệm thủ công

Hai nút tạo mới trong Quiz Card mở hộp thoại có lựa chọn Tự động / Thủ công. Tự động vẫn dùng Nova và tài liệu. Thủ công chọn môn học, nhập tên và tự nhập nội dung; không cần tài liệu hoặc nhà cung cấp AI.

- Flashcard: 1–100 thẻ, mặt trước/mặt sau, thêm/xóa thẻ, mô tả và màu bộ.
- Trắc nghiệm: 1–100 câu, mỗi câu 4 đáp án khác nhau, một đáp án đúng, giải thích tùy chọn, thời gian 0–240 phút (0 là không giới hạn).
- Giữ bản nháp khi chuyển qua lại hai chế độ trong cùng hộp thoại.
- Chặn nội dung thiếu, đáp án trùng, chưa chọn đáp án đúng; backend kiểm tra lại dữ liệu và quyền truy cập môn học.
- Lưu vào kho dữ liệu hiện có, dùng chung chức năng ôn tập, chấm điểm và lịch sử làm bài.

## API

`POST /api/flashcards/manual`: subject_id, name, description, color, cards[{front, back}].

`POST /api/quizzes/manual`: subject_id, title, time_limit, questions[{question, options[4], correct_index, explanation}].

Cả hai yêu cầu đăng nhập, tạo ID phía server, trả HTTP 201. Đáp án đúng không xuất hiện trong phản hồi tạo/đọc quiz trước khi nộp bài. Không gọi model AI.

## Test nhanh

1. Mở `/app/quiz`, chọn Tạo bộ Flashcard → Thủ công.
2. Chọn môn, nhập tên, mặt trước “Atomicity là gì?”, mặt sau “Tất cả thành công hoặc cùng rollback”. Thêm rồi xóa một thẻ trống; chuyển tab và quay lại để kiểm tra bản nháp.
3. Lưu, lật thẻ; tải lại trang để kiểm tra bộ đã lưu.
4. Tạo bài trắc nghiệm → Thủ công; câu “2 + 2 bằng bao nhiêu?”, đáp án 1/2/3/4, chọn D đúng.
5. Lưu, chọn D và nộp: kết quả 1/1. Tải lại trang: bài vẫn xuất hiện trong danh sách.
6. Để trống nội dung, bỏ chọn đáp án đúng hoặc nhập hai đáp án giống nhau: nút lưu bị khóa.

Kiểm thử tự động: API suite 184 tests (182 passed, 2 skipped); kiểm thử trình duyệt gồm 11 luồng cũ và 2 luồng tạo thủ công sử dụng backend thật, chế độ AI local không có provider. ESLint và production build chạy thành công.
