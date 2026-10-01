"""Sample quizzes for the free plan. These are topic templates, not document extracts."""

BANK = {
    'an-toan-thong-tin': {
        'title': 'Đề mẫu: An toàn thông tin',
        'topic': 'An toàn thông tin',
        'questions': [
            {
                'question': 'Mục tiêu nào thuộc bộ ba CIA của an toàn thông tin?',
                'options': ['Tính bí mật', 'Tốc độ biên dịch', 'Dung lượng RAM', 'Số lượng commit'],
                'correct_index': 0,
                'explanation': 'CIA gồm tính bí mật (Confidentiality), toàn vẹn (Integrity) và sẵn sàng (Availability).',
            },
            {
                'question': 'Băm mật khẩu trước khi lưu nhằm mục đích gì?',
                'options': ['Để gửi lại mật khẩu gốc cho người dùng', 'Để không lưu mật khẩu dạng đọc được', 'Để tăng tốc đăng nhập', 'Để chia sẻ mật khẩu giữa các hệ thống'],
                'correct_index': 1,
                'explanation': 'Hệ thống chỉ cần lưu giá trị băm (và muối) để đối chiếu, không cần giữ mật khẩu gốc.',
            },
            {
                'question': 'Nguyên tắc đặc quyền tối thiểu có nghĩa là gì?',
                'options': ['Mọi người dùng đều là quản trị', 'Chỉ cấp quyền vừa đủ để hoàn thành việc', 'Tắt toàn bộ xác thực', 'Công khai mọi khóa bí mật'],
                'correct_index': 1,
                'explanation': 'Đặc quyền tối thiểu giảm thiệt hại nếu một tài khoản bị lạm dụng.',
            },
        ],
    },
    'co-so-du-lieu': {
        'title': 'Đề mẫu: Cơ sở dữ liệu',
        'topic': 'Cơ sở dữ liệu',
        'questions': [
            {
                'question': 'Khóa chính dùng để làm gì?',
                'options': ['Định danh duy nhất một dòng', 'Mã hóa file sao lưu', 'Đếm số kết nối mạng', 'Đặt tên hiển thị cho người dùng'],
                'correct_index': 0,
                'explanation': 'Khóa chính nhận diện duy nhất từng bản ghi trong bảng.',
            },
            {
                'question': 'JOIN được dùng khi nào?',
                'options': ['Khi cần kết hợp các dòng liên quan từ nhiều bảng', 'Khi muốn xóa toàn bộ database', 'Khi đổi cổng HTTP', 'Khi nén ảnh'],
                'correct_index': 0,
                'explanation': 'JOIN ghép dữ liệu liên quan dựa trên điều kiện, thường là khóa ngoại.',
            },
            {
                'question': 'Chuẩn hóa nhằm giảm điều gì?',
                'options': ['Dư thừa và dị thường cập nhật', 'Số lượng người dùng', 'Độ dài tên bảng', 'Số câu hỏi của đề mẫu'],
                'correct_index': 0,
                'explanation': 'Chuẩn hóa tách dữ liệu lặp để cập nhật nhất quán hơn.',
            },
        ],
    },
    'toan-roi-rac': {
        'title': 'Đề mẫu: Toán rời rạc',
        'topic': 'Toán rời rạc',
        'questions': [
            {
                'question': 'Một đồ thị vô hướng đơn có 4 đỉnh và mọi cặp đỉnh đều có cạnh. Đồ thị có bao nhiêu cạnh?',
                'options': ['4', '6', '8', '12'],
                'correct_index': 1,
                'explanation': 'Đồ thị đầy đủ K4 có n(n-1)/2 = 6 cạnh.',
            },
            {
                'question': 'Phép kéo theo logic P → Q sai khi nào?',
                'options': ['P đúng và Q sai', 'P sai và Q đúng', 'Cả hai cùng đúng', 'Cả hai cùng sai'],
                'correct_index': 0,
                'explanation': 'Kéo theo chỉ sai khi tiền đề đúng mà kết luận sai.',
            },
            {
                'question': 'Số tập con của một tập 3 phần tử là bao nhiêu?',
                'options': ['3', '6', '8', '9'],
                'correct_index': 2,
                'explanation': 'Một tập n phần tử có 2^n tập con, nên 2^3 = 8.',
            },
        ],
    },
    'lap-trinh': {
        'title': 'Đề mẫu: Lập trình',
        'topic': 'Lập trình',
        'questions': [
            {
                'question': 'Vòng lặp dùng để làm gì?',
                'options': ['Lặp một khối lệnh theo điều kiện hoặc số lần', 'Xóa hệ điều hành', 'Đổi địa chỉ IP của máy chủ', 'Ký chứng chỉ SSL'],
                'correct_index': 0,
                'explanation': 'Vòng lặp thực hiện lại một khối lệnh cho đến khi điều kiện dừng.',
            },
            {
                'question': 'Hàm trả về giá trị nhằm mục đích gì?',
                'options': ['Đưa kết quả cho nơi gọi', 'Ẩn mã nguồn với chính tác giả', 'Tắt trình biên dịch', 'Tăng giới hạn upload'],
                'correct_index': 0,
                'explanation': 'Giá trị trả về là kết quả mà nơi gọi có thể dùng tiếp.',
            },
            {
                'question': 'Biến cục bộ thường tồn tại trong phạm vi nào?',
                'options': ['Trong khối hoặc hàm khai báo nó', 'Trên mọi máy trong mạng', 'Trong file hệ điều hành', 'Trong gói học của người khác'],
                'correct_index': 0,
                'explanation': 'Biến cục bộ gắn với phạm vi khai báo, thường là một hàm.',
            },
        ],
    },
}


def topics():
    return [
        {'id': key, 'title': item['title'], 'topic': item['topic'], 'sample': True}
        for key, item in BANK.items()
    ]


def build(topic_id):
    key = str(topic_id or 'lap-trinh').strip().lower()
    item = BANK.get(key) or BANK['lap-trinh']
    questions = []
    for index, question in enumerate(item['questions'], start=1):
        questions.append({
            'id': f'q{index}',
            'question': question['question'],
            'options': list(question['options']),
            'correct_index': question['correct_index'],
            'explanation': question['explanation'],
            'document_id': None,
            'source_title': item['title'],
            'source_locator': 'Đề mẫu StudyHub, không trích từ tài liệu người học',
        })
    return {
        'kind': 'quiz',
        'sample': True,
        'sample_notice': 'Đây là đề mẫu theo chủ đề, không được tạo từ tài liệu bạn đã tải lên.',
        'topic': item['topic'],
        'title': item['title'],
        'document_ids': [],
        'question_count': len(questions),
        'questions': questions,
    }
