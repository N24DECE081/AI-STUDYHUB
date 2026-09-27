# Kế hoạch nâng cấp StudyHub (mục 1-4)

## Trạng thái hiện tại

| Module | Đã triển khai | Còn lại |
| --- | --- | --- |
| Flashcard 2.0 | Tạo deck, chọn màu deck/thẻ, mẫu bìa, học thẻ, lưu trạng thái đã nhớ theo tài khoản, hiệu ứng ngắn khi nhớ | Kiểm thử trực quan trên trình duyệt với tài khoản thật |
| Quiz từ tài liệu | Đã có luồng chọn tài liệu, tạo/nộp Quiz và chấm điểm cũ | Dừng ở bước xử lý tài liệu mẫu theo yêu cầu; chưa thêm cấu hình số câu/độ khó và giao diện Pixel Game |
| Progress | XP từ Quiz và thẻ đã nhớ, streak, độ chính xác, hành trình, hoạt động hôm nay | Kiểm thử trực quan desktop/mobile |
| Roadmap | Bản đồ node hai nhánh, trạng thái khóa/chưa bắt đầu/đang học/hoàn thành, chọn node và mở tài liệu | Chưa có chi tiết còn lại của mục 4.3 trong bản đặc tả |

## Điểm dừng: Quiz từ tài liệu

Để xác nhận chất lượng câu hỏi, cần 2-3 tài liệu học liệu mẫu được phép dùng để kiểm thử, ưu tiên một PDF có text chọn được, một DOCX và một TXT/Markdown. Mỗi tài liệu nên có ít nhất 30-40 mệnh đề kiến thức rõ ràng để thử cấu hình 5, 10, 15, 20 và 30 câu. Gửi kèm vài câu hỏi/đáp án kỳ vọng và mức độ dễ, trung bình, khó nếu có. Tài liệu scan dạng ảnh cần OCR, hiện luồng trích xuất chưa bảo đảm đọc được loại này.

## Các bước tiếp theo cho Quiz

1. Kiểm tra trích xuất và chia đoạn trên tài liệu mẫu; báo rõ tài liệu không đủ nội dung thay vì tạo câu lặp hoặc đáp án bịa.
2. Mở rộng `POST /api/quizzes/generate` bằng các trường tùy chọn `question_count` (5-30), `difficulty` (`easy`, `medium`, `hard`) và `question_type` (`multiple_choice`), giữ tương thích với request cũ.
3. Đặt cấu hình/prompt và khóa AI ở backend; kiểm tra JSON, bốn lựa chọn, đáp án, nguồn tài liệu và giới hạn số câu trước khi lưu. Không gửi đáp án đúng tới frontend trước khi nộp.
4. Thêm màn hình cấu hình Quiz với số câu mẫu và ô nhập tùy chỉnh; hiển thị số câu thực sinh được khi tài liệu không đủ.
5. Hoàn thiện giao diện làm Quiz theo phong cách pixel/neon, phản hồi sau khi nộp và hiệu ứng hoàn thành ngắn, có `prefers-reduced-motion`.
6. Kiểm thử tài liệu lỗi/không đủ nội dung, phân quyền giữa hai tài khoản, giới hạn 30 câu, tính điểm, reload và desktop/mobile.

## Tiêu chí hoàn tất

- Không tài khoản nào thấy deck, tài liệu, Quiz hoặc tiến độ của tài khoản khác.
- Số câu và độ khó phản ánh yêu cầu hoặc trả thông báo rõ khi tài liệu không đủ.
- Đáp án đúng chỉ xuất hiện sau khi nộp; nguồn giải thích dẫn về đúng tài liệu.
- `npm run lint`, `npm run build` và bộ test backend liên quan đều đạt; kiểm tra giao diện trên desktop/mobile.
