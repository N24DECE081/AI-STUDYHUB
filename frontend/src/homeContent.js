// Nội dung tiếng Việt của trang chủ và các phần dùng chung.
export const NAV_ITEMS = [
  ["home", "Trang chủ"], ["library", "Kho học liệu"], ["quiz", "Quiz Card"],
  ["roadmap", "Lộ trình học"], ["dashboard", "Tiến độ"], ["tutor", "AI Tutor"], ["pricing", "Gói học"],
];

export const HOME_COPY = {
  navigation: "Điều hướng chính", brandLabel: "StudyHub - Trang chủ",
  light: "Chế độ sáng", dark: "Chế độ tối", enableLight: "Bật chế độ sáng", enableDark: "Bật chế độ tối",
  streakTooltip: "Số ngày học liên tiếp", dayUnit: "ngày", documentUnit: "tài liệu",
  login: "Đăng nhập", register: "Đăng ký", logout: "Đăng xuất",
  eyebrow: "STUDYHUB · NỀN TẢNG HỌC CÁ NHÂN CÓ ĐỊNH HƯỚNG",
  headline: ["Học sâu hơn.", "Tiến bộ rõ hơn."],
  description: "Nền tảng AI giúp sinh viên tổ chức tài liệu, tạo quiz thông minh, xây dựng lộ trình học cá nhân hóa và trao đổi trực tiếp với Nova AI Tutor 24/7.",
  askNova: "Hỏi Nova AI Tutor", openLibrary: "Mở kho học liệu",
  chips: ["Quiz Card AI", "Lộ trình cá nhân", "Theo dõi tiến độ"],
  stats: ["Đã lưu", "Tiến độ", "Streak"],
  guestStats: [["Gọn một nơi", "Tài liệu & kiến thức"], ["Rõ từng bước", "Lộ trình của riêng bạn"], ["Mỗi ngày một chút", "Xây thói quen học"]],
  painEyebrow: "❤️ VẤN ĐỀ", painTitle: "Bạn có đang học theo cách này?",
  painPoints: [
    ["📄", "Tài liệu nằm khắp nơi", "Drive, Google, Messenger, đủ nơi, không biết bắt đầu từ đâu."],
    ["❤️", "Học nhiều nhưng không nhớ", "Không có phương pháp lặp lại hiệu quả."],
    ["💡", "Không biết học gì tiếp theo", "Không có lộ trình rõ ràng."],
    ["🔥", "Khó duy trì thói quen", "Học được vài ngày rồi bỏ."],
  ],
  painConclusion: ["Bạn không thiếu tài liệu.", "Bạn đang thiếu một hệ thống học tập phù hợp."],
  workflowEyebrow: "WORKFLOW CÁ NHÂN", workflowTitle: ["StudyHub gom mọi thứ bạn cần", "vào một nhịp học."],
  workflow: [
    ["01", "Lưu học liệu", "Tải bài giảng & tài liệu lên kho thông minh.", "library"],
    ["02", "Ôn Quiz Card", "AI tự tạo thẻ flashcard ôn tập lặp lại ngắt quãng.", "quiz"],
    ["03", "Xây lộ trình", "Phân bổ lịch học cụ thể theo cấu trúc thi.", "roadmap"],
    ["04", "Theo dõi tiến độ", "Xem tỷ lệ hoàn thành và giữ vững streak học.", "dashboard"],
    ["05", "Hỏi Nova AI", "Giải đáp thắc mắc chuyên sâu tức thì 24/7.", "tutor"],
  ],
  openFeature: "Mở tính năng", roadmapEyebrow: "■ LỘ TRÌNH HỌC MẪU", roadmapTitle: "Học từng bước, tiến bộ từng tuần.",
  roadmapDescription: "StudyHub giúp bạn biến một mục tiêu lớn thành những bước học nhỏ và rõ ràng.",
  roadmapWeeks: [
    { week: "TUẦN 1", title: "Làm quen", sub: "Xây nền tảng", items: ["Làm quen với kiến thức cơ bản", "Đọc tài liệu nền tảng", "Hoàn thành 2 bài học", "Ôn 10 Quiz Card"], progress: 80, active: false },
    { week: "TUẦN 2", title: "Xây nền", sub: "Nắm kiến thức trọng tâm", items: ["Học kiến thức chính", "Làm bài tập cơ bản", "Hoàn thành 3 bài học", "Ôn 20 Quiz Card"], progress: 60, active: true },
    { week: "TUẦN 3", title: "Luyện tập", sub: "Áp dụng kiến thức", items: ["Làm bài tập nâng cao", "Ôn tập bằng Quiz Card", "Hỏi Nova những phần chưa hiểu", "Hoàn thành bài kiểm tra ngắn"], progress: 40, active: false },
    { week: "TUẦN 4", title: "Tổng ôn", sub: "Kiểm tra và củng cố", items: ["Ôn toàn bộ kiến thức", "Làm bài kiểm tra", "Xem lại phần còn yếu", "Đánh giá tiến độ"], progress: 20, active: false },
  ],
  studying: "ĐANG HỌC", progress: "Tiến độ", roadmapCtaTitle: "Bạn không cần tự lên kế hoạch từ đầu.",
  roadmapCtaDescription: "StudyHub giúp chia mục tiêu lớn thành từng bước học rõ ràng.", roadmapCta: "Xem lộ trình của tôi →",
  habitEyebrow: "■ THÓI QUEN BỀN VỮNG", habitTitle: "🔥 Giữ nhịp học mỗi ngày ✨",
  habitDescription: "Sự đều đặn nhỏ bé tích lũy thành thành tựu lớn. Lên kế hoạch, giữ streak để có thói quen học tập bền bỉ và khỏe mạnh.",
  calendarExample: "Một tuần học · Minh họa", calendarCaption: "Mỗi ngày một bước tiến", currentStreak: "Chuỗi hiện tại:", today: "Hôm nay",
  weekdays: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
};

export const STREAK_COPY = {
  eyebrow: "THÓI QUEN HỌC TẬP", title: "Giữ chuỗi mỗi ngày", dayUnit: "ngày",
  active: "Bạn đã học hôm nay. Hãy duy trì nhịp học của mình.",
  inactive: "Ôn flashcard hoặc hoàn thành bài tập để ghi nhận ngày học.",
  guest: "Đăng nhập và học mỗi ngày để bắt đầu chuỗi học tập của bạn.",
  activityLabel: "Hoạt động học tập 7 ngày gần nhất", today: "Hôm nay:", recorded: "đã ghi nhận", unrecorded: "chưa ghi nhận",
  rule: "Chuỗi chỉ tính những ngày học liên tiếp.", timezone: "GMT+7",
};

export const FOOTER_COPY = {
  description: "Nền tảng học tập thông minh đồng hành cùng sinh viên Việt Nam chinh phục mọi kỳ thi đại học.",
  headings: ["HỌC LIỆU", "TÍNH NĂNG", "LIÊN HỆ"],
  materials: [["library", "Đề thi thử"], ["library", "Bài tập lớn"], ["quiz", "Quiz Card"], ["library", "Bài giảng tóm tắt"]],
  features: [["tutor", "AI Tutor"], ["roadmap", "Nhóm học tập"], ["quiz", "Flashcard"], ["dashboard", "Bảng xếp hạng"]],
  email: "Email: support@studyhub.vn", hotline: "Hotline: 1900 1234",
  copyright: "© 2026 StudyHub. Tất cả bản quyền được bảo lưu.", terms: "Điều khoản dịch vụ", privacy: "Chính sách bảo mật",
};
