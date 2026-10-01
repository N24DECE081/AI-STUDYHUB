# Quiz Card: chất lượng câu hỏi, số thứ tự và nộp bài

## Thay đổi

- Thay generator cũ (lấy từ đầu câu làm keyword, ghép đáp án từ câu trích dẫn) bằng task AI `document_quiz` riêng. Prompt ưu tiên trọng tâm, ngộ nhận, tình huống vận dụng và phân tích; không dùng task quiz 3–5 câu của chat để tránh ảnh hưởng Nova.
- Đề mặc định 10 câu; nhận `question_count` là JSON integer từ 1 đến 120. Từ chối số âm, 0, trên 120, boolean, float, chuỗi và null. Frontend kiểm tra cả gõ/paste; giữ giá trị lỗi để người dùng sửa, không tự cắt 1200 thành 120.
- Phân bố khoảng 30% hiểu bản chất, 40% vận dụng, 30% phân tích (làm tròn; đề 1 câu là vận dụng). Chia batch 2 câu để giữ đủ ngân sách đầu ra cho giải thích và bằng chứng. Trích đoạn lấy trải đều trên tài liệu và xen kẽ các tài liệu.
- Kiểm tra đúng số câu, 4 đáp án riêng biệt, chỉ số đáp án, độ khó, câu hỏi không trùng nguyên văn, giải thích, ID nguồn và bằng chứng trích nguyên văn. Có một lần yêu cầu sửa output không hợp lệ mỗi batch. Trộn lựa chọn phía server và cập nhật đáp án đúng tương ứng.
- Không lưu đề dở dang. AI không hoạt động trả 503; output thiếu/không đạt contract trả 422. Không âm thầm sinh đề đơn giản bằng fallback cũ. Model vẫn cần được cấu hình để tạo đề mới; đọc/làm đề cũ không cần gọi model.
- Chỉ số câu là q1…qN và UI bắt đầu 1/N; bỏ tiền tố số câu do model trả. Thanh điều hướng xuống dòng từ trái sang phải, sửa lỗi flex căn giữa làm mất các số đầu khi tràn ngang.
- Hộp xác nhận dùng native modal dialog trong portal, backdrop bán trong suốt. Bài làm và đáp án phía sau vẫn được giữ. Có quản lý focus, Escape, nút làm tiếp và nộp ngay; nộp được từ mọi câu. Làm hết đề thì nộp trực tiếp.
- Giữ đáp án đúng, giải thích và bằng chứng ngoài response tạo/đọc đề trước khi nộp. Backend vẫn chấm bài và kiểm tra ownership.

## Kiểm thử

- `cd apps/python-api && .venv/bin/python -m unittest discover -s tests -p 'test_*.py'`: 178 tests, 176 pass, 2 skip legacy UI.
- `PYTHONPATH=backend .venv/bin/python -m unittest discover -s backend/tests -p 'test_*.py'`: 32 pass.
- `cd frontend && npm run lint && npm run build`: pass; build còn cảnh báo kích thước chunk lớn có sẵn.
- `npm run test:e2e`: 11 pass. Gồm 8 regression flashcard và 3 test Quiz Card (desktop/mobile, 1/120 câu, nhập sai, lỗi AI, xác nhận/hủy/Escape, giữ đáp án, reset về câu 1).
- Integration mới gọi API provider giả qua HTTP thật → tạo 120 câu → lưu DB → đọc lại → nộp bài → chấm điểm. Không gọi provider trả phí trong bộ test tự động.
- Smoke với provider được cấu hình trên máy: tạo thành công 1 câu và đề 10 câu từ `fixtures/quiz-transactions.txt`. Đề 10 câu có 3 understand / 4 apply / 3 analyze, gồm tình huống rollback chuyển tiền, lost update, read isolation và deadlock. Không dùng smoke để khẳng định mọi đầu ra AI luôn đúng.
- Đã xem ảnh desktop/mobile trong `frontend/test-results/` để xác nhận modal bán trong suốt và thanh số câu. Ảnh runtime không commit.

## Test thủ công

1. Upload `docs/qa/fixtures/quiz-transactions.txt` vào môn học riêng rồi mở Quiz Card.
2. Chọn tài liệu; nhập lần lượt rỗng, `0`, `-1`, `1.5`, `abc`, `121`, `1200`, `1e2`: nút tạo phải bị khóa, thông báo số nguyên 1–120.
3. Nhập `10`, tạo đề: chỉ nhận thành công khi có đúng 10 câu, bắt đầu 1/10, có nhãn độ khó. Đáp án đúng không được lộ qua JSON đọc đề.
4. Trả lời một câu, bấm nộp: hiện còn 9 câu, bài làm phía sau vẫn thấy. “Không, làm tiếp” và Escape giữ nguyên câu đang xem/đáp án. “Có, nộp bài” chấm câu bỏ trống là sai.
5. Tạo đề khác: phải trở về câu 1. Hoàn thành hết câu rồi nộp: không hỏi lại xác nhận thiếu câu.
6. Để test 120 câu thực tế, dùng tài liệu dài và giàu nội dung. Tài liệu ngắn có thể bị từ chối 422 thay vì tạo lặp/bịa để đủ số. Test 120 tự động dùng fixture provider để xác minh giới hạn, lưu và chấm bài.

## Giới hạn thực tế

- Kiểm tra schema/bằng chứng và prompt giúp nâng chất lượng, không thay thế giảng viên thẩm định tính đúng, độ khó và độ trùng ý. Smoke đã cho thấy một số chủ đề được hỏi lại ở mức độ khác; prompt được siết thêm để tránh chỉ thay cách diễn đạt/số liệu.
- Đề dài gọi nhiều batch đồng bộ nên cần thời gian và chịu timeout của proxy/provider đang triển khai. Chưa có job nền, resume hoặc progress streaming trong thay đổi này.
- Không đổi subscription, không cấp quyền paid và không triển khai file prompt phân gói AI chưa commit.
