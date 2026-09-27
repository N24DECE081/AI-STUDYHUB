"""Tri thức tư vấn StudyHub — trích từ "StudyHub-Tai-lieu-tong-hop.docx".

Đây là "não" duy nhất của chatbot tư vấn trên trang chủ: mọi thông tin về StudyHub
(bảng giá, Story Map, Value Proposition Canvas, Business Model Canvas, tính năng,
chính sách) đều phải lấy từ các mục ENTRIES dưới đây — mô hình không được bịa thêm.

Câu hỏi ngoài StudyHub: khi backend có API key, chatbot trả lời bằng kiến thức chung
của mô hình (có ghi chú rõ đây không phải thông tin StudyHub); bản offline thì từ chối
lịch sự và gợi ý chủ đề.
"""

SITE_URL = 'studyhub.vn'
SLOGAN = 'Học sâu hơn · Tiến bộ rõ hơn'

GREETING = 'Xin chào! Mình là Nova. Hôm nay bạn muốn học gì?'

ASSISTANT_NAME = 'Bee kawai'
ASSISTANT_STATUS = 'Đang sẵn sàng hỗ trợ'

OUT_OF_SCOPE_ANSWER = (
    'Câu này nằm ngoài phần mình nắm chắc, mà bản trợ lý đang chạy chưa bật mô hình AI '
    'nên mình chưa trả lời được. Bạn hỏi mình về StudyHub nhé: bảng giá 3 gói, Nova AI Tutor, '
    'tài liệu – flashcard – quiz, lộ trình học, điểm khác biệt hoặc cách thanh toán.'
)

NEED_QUESTION_ANSWER = (
    'Mình chưa hiểu rõ câu hỏi. Bạn gõ lại giúp mình một câu ngắn về StudyHub '
    '(ví dụ: "Gói Pro có gì?" hoặc "Học phí bao nhiêu?") nhé.'
)

GREETING_ANSWER = (
    'Xin chào bạn! Mình là Nova, trợ lý tư vấn của StudyHub – nền tảng học tập AI cho sinh viên. '
    'Bạn muốn biết về bảng giá, các gói học, Nova AI Tutor hay lộ trình học?'
)

THANKS_ANSWER = 'Rất vui được hỗ trợ bạn! Bạn cần hỏi thêm gì về StudyHub cứ nhắn mình nhé.'

# Câu xã giao dùng khi KHÔNG có API key (bản offline). Khi có key, Nova trả lời tự nhiên
# dựa trên hồ sơ định vị + điểm khác biệt thay vì đọc câu dựng sẵn.
SMALL_TALK_ANSWERS = {
    'greeting': GREETING_ANSWER,
    'thanks': THANKS_ANSWER,
}

# Ghi chú bắt buộc thêm vào cuối câu trả lời kiến thức chung (không phải thông tin StudyHub).
GENERAL_NOTE = '_Đây là kiến thức chung, không lấy từ tài liệu StudyHub._'

# Hai mục dùng làm "hồ sơ chào hàng" khi khách hỏi bạn là ai / có gì đặc biệt / khác gì app khác.
PITCH_ENTRY_IDS = ('positioning', 'differentiators')

# Dấu hiệu khách đang hỏi về StudyHub (so khớp trên câu đã bỏ dấu, chữ thường).
STUDYHUB_HINTS = ('studyhub', 'study hub', 'app nay', 'ứng dụng này', 'nen tang nay', 'nền tảng này',
                  'san pham nay', 'sản phẩm này', 'web nay', 'website nay')

# Dấu hiệu khách hỏi điểm khác biệt/ưu thế — luôn trả lời bằng mục "StudyHub có gì đặc biệt".
DIFFERENTIATOR_HINTS = ('dac biet', 'khac biet', 'khac gi', 'khac voi', 'uu diem', 'noi bat', 'uu viet',
                        'vi sao chon', 'tai sao chon', 'vi sao nen dung', 'tai sao nen dung', 'co gi hay',
                        'so sanh', 'manh nhat', 'tot hon', 'do doc', 'doc nhat', 'khac nguoi')

# 4 gợi ý nhanh hiển thị dưới lời chào (bám theo nội dung tài liệu tổng hợp).
STARTERS = [
    'Bảng giá 3 gói StudyHub',
    'Gói miễn phí 0đ có gì?',
    'Nova AI Tutor làm được gì?',
    'Thanh toán và liên hệ hỗ trợ',
]

ENTRIES = [
    {
        'id': 'pricing-overview',
        'title': 'Bảng giá 3 gói StudyHub',
        'keywords': [
            'bảng giá', 'giá', 'học phí', 'phí', 'bao nhiêu tiền', 'giá dịch vụ', 'gói cước',
            'các gói', '3 gói', 'gói học', 'price', 'pricing', 'cost', 'subscription',
            '199', '299', '0đ', '199.000', '299.000', 'nâng cấp gói', 'mấy gói',
        ],
        'answer': (
            'StudyHub có **3 gói** (mô hình subscription):\n'
            '- **Gói Khởi Động — 0đ/tháng**: miễn phí vĩnh viễn cho mọi sinh viên.\n'
            '- **Gói Pro Sinh Viên — 199.000đ/tháng**: dành cho sinh viên học thường xuyên, '
            'cần học sâu theo chuyên ngành và dùng Nova AI không giới hạn.\n'
            '- **Gói Master Thủ Khoa — 299.000đ/tháng**: dành cho sinh viên săn học bổng, '
            'mục tiêu GPA 3.6+, làm đồ án tốt nghiệp và chuẩn bị tuyển dụng.\n'
            'Gói Pro và Master có đầy đủ quyền lợi của gói thấp hơn, cộng thêm đặc quyền riêng.'
        ),
    },
    {
        'id': 'plan-free',
        'title': 'Gói Khởi Động (0đ)',
        'keywords': [
            'miễn phí', 'free', '0đ', 'gói khởi động', 'gói cơ bản', 'gói mặc định',
            'dùng thử', 'tài khoản mới', 'giới hạn', 'được gì', 'có gì miễn phí',
        ],
        'answer': (
            '**Gói Khởi Động — 0đ/tháng** (miễn phí vĩnh viễn, gói mặc định cho tài khoản mới):\n'
            '- Tối đa **5 tài liệu** tải lên\n'
            '- Tạo đến **20 thẻ Quiz Card 3D**\n'
            '- **2 đề trắc nghiệm** cơ bản\n'
            '- **Nova AI Tutor giới hạn 10 câu/ngày**\n'
            '- Lộ trình học tập sinh viên tiêu chuẩn\n'
            'Đây là gói phễu để bắt đầu học mà không mất phí.'
        ),
    },
    {
        'id': 'plan-pro',
        'title': 'Gói Pro Sinh Viên (199.000đ)',
        'keywords': [
            'gói pro', 'pro', '199', '199k', '199.000', 'gói phổ biến', 'khuyên dùng',
            'sinh viên học thường xuyên', 'pro sinh viên', 'không giới hạn',
        ],
        'answer': (
            '**Gói Pro Sinh Viên — 199.000đ/tháng** (gói phổ biến nhất, khuyên dùng cho sinh viên):\n'
            '- **Không giới hạn** tài liệu tải lên (PDF, DOC, MD)\n'
            '- **Không giới hạn** bộ thẻ Quiz Card 3D Spaced Repetition\n'
            '- **Không giới hạn** bài thi trắc nghiệm & chấm điểm tức thì\n'
            '- **Nova AI Tutor bám tài liệu không giới hạn lượt hỏi**\n'
            '- Tự động trích xuất Thẻ & Trắc nghiệm từ tài liệu chỉ với **1 click**\n'
            '- Lộ trình học **cá nhân hóa theo chuyên ngành**\n'
            '- Lưu lịch sử ôn tập **đồng bộ đa thiết bị**'
        ),
    },
    {
        'id': 'plan-master',
        'title': 'Gói Master Thủ Khoa (299.000đ)',
        'keywords': [
            'gói master', 'master', '299', '299k', '299.000', 'thủ khoa', 'vip',
            'học bổng', 'gpa 3.6', 'gói cao cấp nhất', 'đồ án tốt nghiệp', 'review cv',
        ],
        'answer': (
            '**Gói Master Thủ Khoa — 299.000đ/tháng** (gói cao cấp nhất, mở khoá toàn bộ đặc quyền):\n'
            '- **Tất cả quyền lợi của gói Pro 199.000đ**\n'
            '- Phòng luyện thi **Mock Exam** mô phỏng đề thi thật đại học\n'
            '- **Nova AI phân tích lỗ hổng kiến thức 1-1** & gợi ý khắc phục\n'
            '- **Nova AI cố vấn chuyên sâu đồ án tốt nghiệp & review CV thực tập**\n'
            '- **Huy hiệu Thủ Khoa StudyHub** độc quyền trên hồ sơ\n'
            '- Hỗ trợ học tập ưu tiên **24/7 qua Zalo / Hotline VIP**\n'
            '- **Tải toàn bộ bộ thẻ và đề thi offline**'
        ),
    },
    {
        'id': 'plan-choice',
        'title': 'Chọn gói nào phù hợp',
        'keywords': [
            'nên chọn gói nào', 'phù hợp với tôi', 'gói nào tốt', 'nên mua gói nào', 'tư vấn gói',
            'so sánh gói', 'khác nhau', 'dành cho ai', 'sinh viên mới', 'học bổng',
        ],
        'answer': (
            'Chọn theo nhu cầu của bạn:\n'
            '- **Mới làm quen, học mức cơ bản** → *Gói Khởi Động 0đ* (5 tài liệu, 20 thẻ, 2 đề, Nova 10 câu/ngày).\n'
            '- **Học thường xuyên, cần học sâu theo chuyên ngành, dùng AI không giới hạn** → *Gói Pro Sinh Viên 199.000đ*.\n'
            '- **Săn học bổng, mục tiêu GPA 3.6+, làm đồ án tốt nghiệp, chuẩn bị tuyển dụng** → *Gói Master Thủ Khoa 299.000đ*.\n'
            'Bạn có thể bắt đầu ở gói 0đ rồi nâng cấp bất kỳ lúc nào.'
        ),
    },
    {
        'id': 'nova-tutor',
        'title': 'Nova AI Tutor',
        'keywords': [
            'nova', 'ai tutor', 'trợ lý', 'chatbot', 'gia sư', 'hỏi đáp', 'trợ lý ảo',
            'ai', 'gia sư ai', 'nova làm được gì', 'hỏi bài', 'giải thích bài', 'tóm tắt tài liệu',
        ],
        'answer': (
            '**Nova AI Tutor** là trợ lý học tập đồng hành của StudyHub:\n'
            '- Chat trực tiếp để **hỏi đáp, giải thích bài, tóm tắt tài liệu** (gói 0đ giới hạn 10 câu/ngày)\n'
            '- **Bám sát tài liệu riêng** của bạn, không giới hạn lượt hỏi ở gói Pro/Master\n'
            '- **Giải thích sâu các câu làm sai** ngay trong màn hình kết quả Quiz\n'
            '- **Chủ động gợi ý phiên tập trung** trước khi bắt đầu bài học khó\n'
            '- Phân tích **lỗ hổng kiến thức 1-1**, cố vấn **đồ án tốt nghiệp & review CV** (gói Master)\n'
            '- Sắp tới có **Nova AI Voice** — luyện tập tương tác bằng giọng nói, đọc tài liệu rảnh tay (Release 3)'
        ),
    },
    {
        'id': 'nova-limits',
        'title': 'Giới hạn lượt hỏi Nova',
        'keywords': [
            'giới hạn nova', '10 câu', 'bao nhiêu câu', 'lượt hỏi', 'hết lượt', 'quota',
            'không giới hạn lượt hỏi', 'nova voice', 'giọng nói',
        ],
        'answer': (
            'Giới hạn lượt hỏi Nova AI Tutor theo gói:\n'
            '- **Gói Khởi Động 0đ**: 10 câu/ngày.\n'
            '- **Gói Pro Sinh Viên & Master**: không giới hạn lượt hỏi, bám sát tài liệu của bạn.\n'
            '**Nova AI Voice** (đọc tài liệu, luyện tập bằng giọng nói) chưa có ở gói 0đ — thuộc Release 3.'
        ),
    },
    {
        'id': 'documents',
        'title': 'Kho tài liệu & trích xuất AI',
        'keywords': [
            'tài liệu', 'upload', 'tải lên', 'pdf', 'docx', 'doc', 'markdown', 'md',
            'kho học liệu', 'giáo trình', 'slide', 'định dạng', 'file', 'gắn nhãn',
            'thư viện chia sẻ', 'offline', 'trích xuất',
        ],
        'answer': (
            '**Kho tài liệu & Học liệu thông minh**:\n'
            '- Tải lên tài liệu cá nhân và phân loại theo môn học (gói 0đ tối đa 5 file)\n'
            '- Gói Pro/Master: **không giới hạn** tài liệu, hỗ trợ **PDF, DOCX, Markdown**\n'
            '- **Tự động trích xuất Flashcard 3D & câu hỏi trắc nghiệm chỉ với 1 click**\n'
            '- Tự động **gắn nhãn kiến thức thông minh** từ nội dung tài liệu\n'
            '- **Thư viện chia sẻ học liệu công khai** giữa các trường/lớp (Release 3)\n'
            '- **Tải toàn bộ bộ thẻ và đề thi để học offline** (gói Master)'
        ),
    },
    {
        'id': 'flashcard-quiz',
        'title': 'Flashcard 3D & Quiz Card',
        'keywords': [
            'flashcard', 'flash card', 'thẻ', 'quiz card', 'quizcard', 'trắc nghiệm', 'quiz',
            'spaced repetition', 'lặp lại ngắt quãng', 'ôn tập', 'chấm điểm', 'lời giải',
            'đấu quiz', 'thẻ 3d', 'ôn thi',
        ],
        'answer': (
            '**Flashcard 3D & Quiz Card**:\n'
            '- Tạo **Flashcard 3D lật thẻ**, sinh câu hỏi trắc nghiệm từ tài liệu tải lên\n'
            '- **Chấm điểm trắc nghiệm tức thì** và xem lời giải\n'
            '- Thuật toán **Spaced Repetition (lặp lại ngắt quãng)** giúp nhớ lâu, không cần nhồi nhét\n'
            '- **Tạo bộ đề Quiz Card tự động 1-click** từ tài liệu\n'
            '- **Đấu Quiz trực tiếp cùng bạn bè**; bảng xếp hạng thành tích theo khối lớp/ngành\n'
            '- Tự động **điều chỉnh độ khó** bài kiểm tra theo năng lực thực tế'
        ),
    },
    {
        'id': 'roadmap-mindmap',
        'title': 'Lộ trình học & Mindmap',
        'keywords': [
            'lộ trình', 'roadmap', 'mindmap', 'sơ đồ tư duy', 'kế hoạch học', 'micro-learning',
            'chia nhịp', 'theo tuần', 'boss', 'vượt ải', 'ngày thi', 'mục tiêu điểm',
        ],
        'answer': (
            '**Lộ trình học tập & Sơ đồ Mindmap**:\n'
            '- Nhập môn học, **mục tiêu điểm số và số ngày thi** → hệ thống chia nhịp **Micro-learning theo tuần**\n'
            '- **Sơ đồ tư duy môn học** phân nhánh, dạng tĩnh rồi nâng cấp **tương tác** (click mở rộng nhánh)\n'
            '- AI **tự động cân bằng khối lượng bài học** theo thời gian còn lại đến ngày thi\n'
            '- Cơ chế **vượt ải học tập** (Start Node → **Boss môn học**)\n'
            '- Lộ trình **cá nhân hóa theo chuyên ngành**, định hướng đồ án tốt nghiệp & thực tập'
        ),
    },
    {
        'id': 'gamification-progress',
        'title': 'Tiến độ, XP, Streak',
        'keywords': [
            'tiến độ', 'xp', 'streak', 'chuỗi ngày', 'điểm kinh nghiệm', 'gamification',
            'level', 'cấp độ', 'bảng xếp hạng', 'nhiệm vụ', 'biểu đồ', 'nhịp độ học',
            'theo dõi', 'phút tập trung',
        ],
        'answer': (
            '**Theo dõi tiến độ, Gamification**:\n'
            '- Ghi nhận **chuỗi học (Streak)** theo ngày và **bộ đếm XP**, cấp độ Level\n'
            '- Tỷ lệ trả lời đúng, **lịch sử làm quiz**, biểu đồ nhịp độ học (7 ngày, 8 tuần, 6 tháng)\n'
            '- **Nhiệm vụ hàng ngày "Giữ lửa học tập"**\n'
            '- Ghi nhận chỉ số **"phút tập trung"** khi dùng chế độ Focus\n'
            '- Cấp **chứng nhận hoàn thành mục tiêu**, phân tích khung giờ tập trung hiệu quả nhất'
        ),
    },
    {
        'id': 'focus-mode',
        'title': 'Chế độ tập trung (Focus Lock)',
        'keywords': [
            'focus', 'tập trung', 'khóa màn hình', 'focus lock', 'focus mode', 'chống xao nhãng',
            'strict lock', 'khóa nghiêm ngặt', 'lo-fi', 'âm thanh trắng', 'deep focus', 'phạt xp',
        ],
        'answer': (
            '**Chế độ Tập trung (Focus Lock)** — chống xao nhãng khi tự học:\n'
            '- Bạn tự nhập/chọn thời gian, hệ thống bật **màn hình khoá tràn viền** ẩn menu gây xao nhãng\n'
            '- **Cộng XP theo thời gian tích luỹ** và ghi vào chỉ số "phút tập trung"\n'
            '- **Smart Focus Lock**: tự đề xuất thời gian học hợp lý theo độ dài bài học/nhánh Mindmap\n'
            '- **Strict Lock**: cảnh báo/phạt XP nếu cố tình chuyển tab hoặc thoát trước hạn\n'
            '- **Deep Focus Immersion**: tích hợp âm thanh trắng/Lo-fi trong màn hình khoá\n'
            '- Quy đổi thời gian tập trung liên tục thành đòn tấn công hạ gục **Boss môn học**'
        ),
    },
    {
        'id': 'mock-exam',
        'title': 'Phòng luyện thi Mock Exam',
        'keywords': [
            'mock exam', 'phòng luyện thi', 'thi thử', 'đề thi thật', 'đại học', 'luyện đề',
            'dự đoán phổ điểm', 'đề thi', 'chứng chỉ', 'luyện thi',
        ],
        'answer': (
            '**Phòng luyện thi Mock Exam** (đặc quyền gói Master Thủ Khoa):\n'
            '- Mô phỏng **đề thi thật đại học**, luyện tập thực chiến\n'
            '- **Phân tích điểm yếu tức thì**, chỉ rõ lỗ hổng kiến thức cần bù đắp\n'
            '- **AI dự đoán phổ điểm** thi tốt nghiệp/cuối kỳ\n'
            '- Ngân hàng đề thử được chuẩn hoá sát chương trình giảng dạy thực tế\n'
            '(Trong Story Map, Mock Exam thuộc Release 2–3.)'
        ),
    },
    {
        'id': 'releases',
        'title': 'Lộ trình phát triển Release 1-2-3',
        'keywords': [
            'release', 'lộ trình phát triển', 'sắp có', 'tính năng mới', 'roadmap sản phẩm',
            'giai đoạn', 'mvp', 'phiên bản', 'khi nào có', 'upcoming',
        ],
        'answer': (
            'StudyHub phát triển theo **3 phân kỳ Release**:\n'
            '- **Release 1 — MVP**: đăng ký Email/Google, gói 0đ (5 tài liệu, 2 đề), tải tài liệu, '
            'flashcard 3D & quiz cơ bản, lộ trình + mindmap tĩnh, Streak/XP, Focus Mode cơ bản, '
            '**chat Nova AI (10 câu/ngày)**.\n'
            '- **Release 2 — Mở rộng**: thanh toán gói Pro 199k & Master 299k, đồng bộ đa thiết bị, '
            'mở rộng định dạng file, **Spaced Repetition**, tạo Quiz Card 1-click, đấu Quiz cùng bạn, '
            '**Mindmap tương tác**, biểu đồ nhịp độ, nhiệm vụ ngày, **Smart/Strict Focus Lock**, '
            'Nova bám tài liệu không giới hạn.\n'
            '- **Release 3 — Nâng cao**: huy hiệu Thủ Khoa, hỗ trợ 24/7, thư viện chia sẻ học liệu, '
            '**học offline**, Mock Exam, bảng xếp hạng, chứng nhận mục tiêu, **Deep Focus Lo-fi**, '
            '**Nova AI Voice** & cố vấn CV/đồ án.'
        ),
    },
    {
        'id': 'users',
        'title': 'StudyHub dành cho ai',
        'keywords': [
            'dành cho ai', 'đối tượng', 'sinh viên', 'học sinh', 'thpt', 'giảng viên', 'trợ giảng',
            'cao đẳng', 'ai dùng được', 'khách hàng', 'giáo viên', 'lớp học',
        ],
        'answer': (
            'StudyHub hướng tới:\n'
            '- **Sinh viên đại học/cao đẳng (trọng tâm)**: quản lý tài liệu, học sâu chuyên ngành, giữ kỷ luật tự học, '
            'mục tiêu GPA 3.6+, săn học bổng, luyện Mock Exam, làm đồ án và review CV thực tập.\n'
            '- **Học sinh THPT**: ôn luyện kiến thức, luyện thi chứng chỉ/đại học, chống xao nhãng khi tự học ở nhà.\n'
            '- **Giảng viên / Trợ giảng (mở rộng)**: quản lý lớp, chia sẻ tài liệu, trích xuất ngân hàng câu hỏi tự động từ slide.\n'
            '- **Tất cả người dùng**: quản lý tài khoản, nâng cấp gói hội viên.'
        ),
    },
    {
        'id': 'problems',
        'title': 'StudyHub giải quyết vấn đề gì',
        'keywords': [
            'giải quyết', 'vấn đề', 'nỗi đau', 'lợi ích', 'tại sao nên dùng', 'khác gì',
            'điểm mạnh', 'giá trị', 'xao nhãng', 'quên', 'mất thời gian', 'tiết kiệm',
            'value', 'lợi thế',
        ],
        'answer': (
            '**StudyHub giải quyết các nỗi đau của sinh viên**: xao nhãng & thiếu kỷ luật, ngập trong tài liệu '
            'rời rạc, ôn thi thụ động nhanh quên, mất phương hướng khi ôn thi, thiếu người kèm cặp chuyên môn.\n'
            'Cách giải quyết:\n'
            '- **Focus Lock** cách ly cám dỗ số, đo chính xác từng phút tập trung\n'
            '- **Trích xuất 1-click** biến slide/giáo trình thành bộ thẻ và đề trắc nghiệm, **tiết kiệm ~80% thời gian tổng hợp**\n'
            '- **Mindmap + Micro-learning** phân định rõ ngày nào học nội dung gì\n'
            '- **Nova AI đồng hành 24/7** giải đáp khi gặp bài khó, giải thích vì sao sai\n'
            '- **Phân tích lỗ hổng kiến thức 1-1** trước khi vào phòng thi thật\n'
            'Lợi ích kỳ vọng: GPA 3.6+, săn học bổng, duy trì kỷ luật qua Streak/XP, tự tin trước kỳ thi, '
            'sẵn sàng đi làm với đồ án & CV chỉn chu.'
        ),
    },
    {
        'id': 'payment',
        'title': 'Thanh toán & nâng cấp gói',
        'keywords': [
            'thanh toán', 'payment', 'trả tiền', 'mua gói', 'nâng cấp', 'gia hạn', 'hủy gói',
            'momo', 'zalopay', 'vnpay', 'visa', 'thẻ ngân hàng', 'ví điện tử', 'đăng ký gói',
            'hoàn tiền', 'demo',
        ],
        'answer': (
            '**Thanh toán & quản lý gói**:\n'
            '- Đăng ký tự do bằng **Google/Email**, bắt đầu ngay với gói 0đ (self-service)\n'
            '- Nâng cấp **Gói Pro 199.000đ** hoặc **Gói Master 299.000đ** theo tháng, có thể **gia hạn hoặc huỷ gói VIP**\n'
            '- Kênh thanh toán dự kiến: **Momo, ZaloPay, VNPAY, thẻ ngân hàng/Visa**\n'
            '- Hội viên **Master** có kênh hỗ trợ riêng **Zalo/Hotline VIP 24/7**\n'
            'Trang web hiện đang ở chế độ demo: yêu cầu nâng cấp chưa thu tiền và chưa kích hoạt gói trả phí.'
        ),
    },
    {
        'id': 'contact',
        'title': 'Liên hệ & hỗ trợ',
        'keywords': [
            'liên hệ', 'hỗ trợ', 'contact', 'hotline', 'zalo', 'email', 'giờ làm việc',
            'tổng đài', 'khiếu nại', 'gặp người thật', 'cộng đồng', 'fanpage', 'tiktok',
            '1900', 'support',
        ],
        'answer': (
            '**Liên hệ StudyHub**:\n'
            '- Website chính thức: **studyhub.vn**\n'
            '- Email hỗ trợ: **support@studyhub.vn**\n'
            '- Hotline: **1900 1234**\n'
            '- Hội viên **Gói Master**: hỗ trợ ưu tiên **24/7 qua Zalo / Hotline VIP**\n'
            '- Cộng đồng: kênh **TikTok, Facebook**, hội nhóm ôn thi, CLB học thuật và chương trình **đại sứ sinh viên**'
        ),
    },
    {
        'id': 'positioning',
        'title': 'StudyHub là gì & slogan',
        'keywords': [
            'studyhub là gì', 'giới thiệu', 'về studyhub', 'slogan', 'định vị', 'nền tảng gì',
            'website', 'about', 'là gì', 'tổng quan', 'edtech',
        ],
        'answer': (
            '**StudyHub** — nền tảng học thông minh (AI EdTech SaaS) cho sinh viên, tại **studyhub.vn**.\n'
            '- Slogan: **"Học sâu hơn · Tiến bộ rõ hơn"**, định vị *Mở khoá toàn bộ sức mạnh của Nova AI StudyHub*\n'
            '- Định hướng: "Học mọi lúc — Phát triển mọi nơi"\n'
            '- Ba trụ cột: **kho tài liệu & trích xuất AI**, **lộ trình học & gamification-tập trung**, '
            '**trợ lý đồng hành Nova AI Tutor**\n'
            '- Mô hình subscription 3 gói: 0đ · 199.000đ · 299.000đ\n'
            '- Đang xây dựng thêm kênh **B2B**: bán bản quyền tài khoản theo lớp/khoa cho trường đại học, trung tâm luyện thi'
        ),
    },
    {
        'id': 'offline-sync',
        'title': 'Học offline & đồng bộ đa thiết bị',
        'keywords': [
            'offline', 'ngoại tuyến', 'không có mạng', 'đồng bộ', 'đa thiết bị', 'tải về máy',
            'xem offline', 'điện thoại', 'mobile',
        ],
        'answer': (
            '**Học offline & đồng bộ**:\n'
            '- **Lưu lịch sử ôn tập đồng bộ đa thiết bị** (Gói Pro trở lên)\n'
            '- **Tải toàn bộ bộ thẻ và đề thi để học ngoại tuyến (Offline Mode)** — đặc quyền Gói Master\n'
            '- Trải nghiệm web app đồng bộ giữa máy tính và điện thoại khi cùng tài khoản'
        ),
    },
    {
        'id': 'account',
        'title': 'Tài khoản & đăng ký',
        'keywords': [
            'đăng ký', 'tài khoản', 'register', 'đăng nhập', 'google', 'sign up', 'tạo tài khoản',
            'hồ sơ', 'phân quyền', 'mật khẩu', 'quên mật khẩu',
        ],
        'answer': (
            '**Tài khoản StudyHub**:\n'
            '- Đăng ký bằng **Email hoặc Google**, tạo hồ sơ cơ bản rồi dùng ngay **Gói Khởi Động 0đ**\n'
            '- Áp dụng giới hạn của gói 0đ: 5 tài liệu & 2 đề trắc nghiệm\n'
            '- Có **phân quyền vai trò** (sinh viên, giảng viên/trợ giảng, admin) và đồng bộ dữ liệu đa thiết bị\n'
            '- Hỗ trợ đổi/đặt lại mật khẩu qua mã xác thực gửi tới email\n'
            '- Gói **Master** có **huy hiệu Thủ Khoa** độc quyền trên hồ sơ cá nhân'
        ),
    },
    {
        'id': 'technology',
        'title': 'Công nghệ & hạ tầng',
        'keywords': [
            'công nghệ', 'hạ tầng', 'model', 'llm', 'ai dùng gì', 'cloud', 'bảo mật',
            'server', 'thuật toán', 'api', 'đối tác', 'google cloud', 'aws',
        ],
        'answer': (
            '**Công nghệ & hạ tầng StudyHub**:\n'
            '- Hạ tầng **Nova AI (LLM bám sát tài liệu cá nhân)** + thuật toán **Spaced Repetition**\n'
            '- Hệ thống **Cloud server**, Web App, tính năng khoá màn hình Focus Lock, cơ sở dữ liệu học liệu số\n'
            '- **Ngân hàng đề thi Mock Exam** mô phỏng format các trường đại học\n'
            '- Đối tác hạ tầng: nhà cung cấp **API LLM** và cloud (**Google Cloud/AWS/Azure**) lưu trữ tài liệu người dùng\n'
            '- Đối tác thanh toán: Momo, ZaloPay, VNPAY, thẻ ngân hàng/Visa\n'
            '- Đội ngũ cốt lõi: kỹ sư AI/Fullstack, Product Designer (UX/UI), cố vấn học thuật & review CV'
        ),
    },
    {
        'id': 'b2b',
        'title': 'Hợp tác B2B / nhà trường',
        'keywords': [
            'b2b', 'đối tác', 'trường học', 'nhà trường', 'trường', 'bản quyền', 'hợp tác', 'doanh nghiệp',
            'lớp', 'khoa', 'tuyển dụng', 'clb', 'hội sinh viên',
        ],
        'answer': (
            '**Hợp tác & B2B**:\n'
            '- **Bán bản quyền tài khoản theo lớp/khoa** cho các trường đại học, trung tâm luyện thi (tiềm năng tương lai)\n'
            '- **CLB học thuật & Hội sinh viên**: tổ chức thử thách "Cày Streak 30 ngày", "Vượt ải Mock Exam"\n'
            '- **Doanh nghiệp & đơn vị tuyển dụng**: kết nối nguồn ứng viên sinh viên GPA cao, hoàn thành lộ trình xuất sắc\n'
            '- Giảng viên/trợ giảng có thể dùng StudyHub để quản lý lớp và sinh ngân hàng câu hỏi từ slide'
        ),
    },
    {
        'id': 'differentiators',
        'title': 'StudyHub có gì đặc biệt',
        'keywords': [
            'đặc biệt', 'có gì đặc biệt', 'tính năng đặc biệt', 'điểm đặc biệt', 'khác biệt',
            'có gì khác biệt', 'điểm khác biệt', 'khác gì', 'khác gì app khác', 'so với app khác',
            'app khác', 'ứng dụng khác', 'nổi bật', 'ưu điểm', 'ưu điểm nổi bật', 'ưu việt',
            'vì sao chọn studyhub', 'tại sao chọn studyhub', 'vì sao nên dùng', 'có gì hay',
            'điểm mạnh', 'lợi thế', 'so sánh', 'độc quyền',
        ],
        'answer': (
            '**StudyHub đặc biệt ở chỗ gom cả một quy trình học vào một nền tảng** — thay vì mỗi việc '
            'phải dùng một app riêng:\n'
            '- **Nova AI Tutor bám đúng tài liệu bạn tải lên** (hỏi đáp, giải thích, tóm tắt theo chính file của bạn, '
            'gói Pro/Master không giới hạn lượt hỏi)\n'
            '- **1-click biến tài liệu thành Flashcard 3D + đề trắc nghiệm**, chấm điểm kèm lời giải ngay\n'
            '- **Spaced Repetition (lặp lại ngắt quãng)** giúp nhớ lâu, kèm **đấu Quiz cùng bạn bè**\n'
            '- **Lộ trình Micro-learning theo ngày thi**: nhập mục tiêu điểm và số ngày còn lại, hệ thống tự chia '
            'nhịp học theo tuần và có **Boss môn học** để vượt ải\n'
            '- **Focus Lock** đo chính xác từng phút tập trung, cộng **Streak/XP** và bảng xếp hạng để giữ kỷ luật\n'
            '- **Mock Exam mô phỏng format đề của trường** và **phân tích lỗ hổng kiến thức 1-1** trước khi thi thật\n'
            '- **Học được cả khi mất mạng**: tải bộ thẻ và đề thi về học offline (gói Master)\n'
            '- **Bắt đầu miễn phí 0đ**, chỉ nâng cấp 199.000đ hoặc 299.000đ khi cần — dùng trên cả máy tính và điện thoại'
        ),
    },
]

STARTER_QUERIES = {starter: starter for starter in STARTERS}

SMALL_TALK = {
    'greeting': ('xin chào', 'xin chao', 'chào bạn', 'chao ban', 'hello', 'hi ', 'hi!', 'chào',
                 'alo', 'hey', 'helo', 'chao'),
    'thanks': ('cảm ơn', 'cam on', 'thank', 'thanks', 'ok cảm ơn', 'tks'),
    'capability': ('bạn là ai', 'ban la ai', 'bạn làm được gì', 'giúp được gì', 'bạn là gì',
                   'who are you', 'là ai', 'help'),
}
