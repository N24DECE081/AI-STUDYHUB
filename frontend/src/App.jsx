import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./Logo3D.css";
import Logo3D from "./components/Logo3D.jsx";
import LandingExtras from "./components/LandingExtras.jsx";
import BeeChatWidget from "./components/BeeChatWidget.jsx";
import FocusSpaceLogo from "./components/FocusSpaceLogo.jsx";
import FocusSpacePage from "./components/FocusSpacePage.jsx";
import studyHubLogo from "./assets/studyhub-logo.png";

import {
  checkoutSubscription,
  cancelSubscription,
  completeProfile,
  createSubject,
  getCurrentUser,
  deleteDocument,
  getDocumentContent,
  getDocuments,
  getOAuthLoginUrl,
  getOAuthStatus,
  getProgress,
  getStudyTime,
  getStreak,
  getSubscription,
  getSubjects,
  login,
  logout as apiLogout,
  register,
  requestPasswordOtp,
  resetPassword,
  uploadDocument,
  verifyPasswordOtp,
} from "./api";
import AITutorPage from "./components/ai-tutor/AITutorPage";
import QuizWorkspace from "./components/QuizWorkspace";
import LearningRoadmapPage from "./components/LearningRoadmapPage";
import PaymentCheckout from "./components/PaymentCheckout";
import ProgressDashboard from "./components/progress/ProgressDashboard";
import { EMPTY_PROGRESS_ANALYTICS } from "./components/progress/progressDefaults";
import StudyDeckSession from "./components/StudyDeckSession";
import FlashcardDeckForm from "./components/flashcard/FlashcardDeckForm";
import { DEFAULT_FLASHCARD_COLOR, rememberedCount } from "./components/flashcard/flashcardTheme";
import { buildSubjectHashMap, findSubject, quickSortSubjects } from "./utils/subjectAlgorithms";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckIcon,
  CloudArrowUpIcon,
  FireIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  BoltIcon,
  RectangleStackIcon,
  XMarkIcon,
  SparklesIcon,
  TrashIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";

const PLANS = {
  free: {
    name: "Gói Khởi Động",
    price: "0đ",
    subtitle: "Miễn phí vĩnh viễn cho mọi sinh viên",
    badge: "Cơ bản",
    items: [
      "Tối đa 5 tài liệu tải lên",
      "Tạo đến 20 thẻ Quiz Card 3D",
      "2 đề trắc nghiệm cơ bản",
      "Nova AI Tutor (giới hạn 10 câu/ngày)",
      "Lộ trình học tập sinh viên tiêu chuẩn",
    ],
    excluded: [
      "Không giới hạn tài liệu & thẻ",
      "Tự động tạo Quiz/Thẻ từ tài liệu AI 1-click",
      "Luyện thi Mock Exam phân tích 1-1",
      "Nova AI Voice đọc tài liệu không giới hạn",
    ],
  },
  plus: {
    name: "Gói Pro Sinh Viên",
    price: "199.000đ",
    subtitle: "199.000đ / tháng (hoặc 199đ tương đương)",
    badge: "Phổ biến nhất",
    items: [
      "Không giới hạn tài liệu tải lên (PDF, DOC, MD)",
      "Không giới hạn bộ thẻ Quiz Card 3D Spaced Repetition",
      "Không giới hạn bài thi trắc nghiệm & chấm điểm tức thì",
      "Nova AI Tutor trực tiếp về tài liệu KHÔNG GIỚI HẠN",
      "Tự động trích xuất Thẻ & Trắc nghiệm từ tài liệu chỉ với 1 click",
      "Lộ trình học cá nhân hóa theo chuyên ngành",
      "Lưu lịch sử ôn tập đồng bộ đa thiết bị",
    ],
    excluded: [
      "Luyện thi Mock Exam chuyên sâu 1-1",
      "Nova AI cố vấn đồ án tốt nghiệp & CV xin việc",
    ],
  },
  pro: {
    name: "Gói Master Thủ Khoa",
    price: "299.000đ",
    subtitle: "299.000đ / tháng (hoặc 299đ tương đương)",
    badge: "Vip Học Bổng",
    items: [
      "Tất cả quyền lợi của Gói Pro 199đ",
      "Phòng luyện thi Mock Exam mô phỏng đề thi thật đại học",
      "Nova AI phân tích lỗ hổng kiến thức 1-1 & gợi ý khắc phục",
      "Nova AI cố vấn chuyên sâu Đồ án tốt nghiệp & Review CV thực tập",
      "Huy hiệu Thủ Khoa StudyHub độc quyền trên hồ sơ",
      "Hỗ trợ học tập ưu tiên 24/7 trực tiếp qua Zalo / Hotline VIP",
      "Tải toàn bộ bộ thẻ và đề thi offline",
    ],
    excluded: [],
  },
};

const EMPTY_STUDY_TIME = {
  total_seconds: 0,
  current_session_seconds: 0,
  session_count: 0,
  active: false,
};

const VIEW_PATHS = {
  home: "/dashboard",
  library: "/app/materials",
  quiz: "/app/quiz",
  roadmap: "/app/roadmap",
  dashboard: "/app/progress",
  tutor: "/app/ai-tutor",
  focusSpace: "/app/focus-space",
  pricing: "/app/plans",
};
const PATH_VIEWS = {
  "/": "home",
  "/dashboard": "home",
  "/app": "home",
  "/materials": "library",
  "/app/materials": "library",
  "/quiz": "quiz",
  "/app/quiz": "quiz",
  "/roadmap": "roadmap",
  "/app/roadmap": "roadmap",
  "/progress": "dashboard",
  "/app/progress": "dashboard",
  "/ai-tutor": "tutor",
  "/app/ai-tutor": "tutor",
  "/app/focus-space": "focusSpace",
  "/plans": "pricing",
  "/app/plans": "pricing",
};
const viewForPath = (path) => PATH_VIEWS[path] || "home";
const isAuthPath = (path) => path === "/login" || path === "/register";
const isProtectedPath = (path) => path !== "/" && !isAuthPath(path) && (path in PATH_VIEWS || path.startsWith("/app/"));

const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const vietnamDateKey = (date = new Date()) => {
  const values = new Intl.DateTimeFormat("en", { timeZone: VIETNAM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type) => values.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function mapDocumentProgress(result) {
  return (result.items || [])
    .filter((item) => item.document_id)
    .map((item) => ({
      id: item.id || `document-${item.document_id}`,
      documentId: item.document_id,
      title: item.document_title || "Tài liệu học tập",
      subject: item.subject_code || "",
      percent: item.progress_percent || 0,
    }));
}

function ThemeToggle({ theme, onToggle }) {
  return <button type="button" className="theme-toggle" onClick={onToggle} aria-label={theme === 'light' ? 'Bật chế độ tối' : 'Bật chế độ sáng'} title={theme === 'light' ? 'Chế độ tối' : 'Chế độ sáng'} aria-pressed={theme === 'dark'}>
    {theme === 'light' ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
  </button>;
}

function StreakCard({ user, streak, onLogin }) {
  const today = streak.today || vietnamDateKey();
  const todayActive = Boolean(user && streak.last_activity_date === today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(new Date(`${today}T12:00:00+07:00`).getTime() - (6 - index) * 86400000);
    return {
      date: vietnamDateKey(date),
      label: date.toLocaleDateString("vi-VN", { weekday: "short", timeZone: VIETNAM_TIME_ZONE }).replace(".", ""),
      number: Number(date.toLocaleDateString("en", { day: "numeric", timeZone: VIETNAM_TIME_ZONE })),
    };
  });
  return (
    <section className="streak-card" aria-labelledby="streak-title">
      <div className="streak-card-heading">
        <div className="streak-symbol"><FireIcon aria-hidden="true" /></div>
        <div>
          <span className="eyebrow">THÓI QUEN HỌC TẬP</span>
          <h2 id="streak-title">Giữ chuỗi mỗi ngày</h2>
        </div>
        <div className="streak-total">
          <strong>{user ? streak.current_streak : "—"}</strong>
          <span>ngày</span>
        </div>
      </div>
      <p className="streak-description">
        {user
          ? todayActive
            ? "Bạn đã đăng nhập hôm nay. Hãy duy trì nhịp học của mình."
            : "Đăng nhập hôm nay để ghi nhận hoạt động học tập."
          : "Đăng nhập mỗi ngày để bắt đầu chuỗi học tập của bạn."}
      </p>
      <div className="streak-week" aria-label="Hoạt động học tập 7 ngày gần nhất">
        {days.map((day) => {
          const active = user && (streak.activity_dates || [streak.last_activity_date]).includes(day.date);
          return (
            <div className={`streak-day ${active ? "is-active" : ""}`} key={day.date}>
              <span>{day.label}</span>
              <strong>{day.number}</strong>
              <i aria-hidden="true">{active ? "✓" : "·"}</i>
            </div>
          );
        })}
      </div>
      <footer className="streak-card-footer">
        <span><CalendarDaysIcon aria-hidden="true" /> Hôm nay: {todayActive ? "đã ghi nhận" : "chưa ghi nhận"}</span>
        <span>Khôi phục tự động: {user ? `${Math.min(streak.recovery_count, 3)}/3 lượt đã dùng` : "—"}</span>
        <span>GMT+7</span>
        {!user && <button className="text-link" onClick={onLogin}>Đăng nhập <ArrowRightIcon aria-hidden="true" className="link-icon" /></button>}
      </footer>
    </section>
  );
}

function Modal({ title, children, onClose, icon, subtitle, className = "" }) {
  const isCheckout = title === "Xác nhận thay đổi gói";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={`modal ${isCheckout ? "checkout-modal" : ""} ${icon ? "modal-with-icon" : ""} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div className="modal-heading">
            {icon && (
              <span className="modal-icon-badge" aria-hidden="true">
                {icon}
              </span>
            )}
            <div>
              <h2 id="modal-heading-title">
                {isCheckout ? "Thanh toán & thay đổi gói" : title}
              </h2>
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </header>
        {isCheckout && (
          <div className="checkout-banner">
            <strong>Thanh toán minh bạch</strong>
            <span>
              Nâng gói áp dụng ngay ở môi trường demo · Hạ gói chỉ chuyển vào
              cuối chu kỳ.
            </span>
            <div>
              <b>Chu kỳ tháng</b>
              <b>Không phí ẩn</b>
              <b>Không lưu số thẻ</b>
            </div>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}

function StudyHubAuthScreen({ mode, user, oauthStatus, error, identifier, onBack, onMode, onOAuth, onSubmit }) {
  const heading = {
    login: ["Chào mừng đến StudyHub", "Đăng nhập để tiếp tục hành trình học tập."],
    register: ["Tạo tài khoản StudyHub", "Bắt đầu xây dựng không gian học tập của bạn."],
    profile: ["Chào mừng đến StudyHub", "Hoàn tất thông tin để cá nhân hóa hành trình học tập."],
    forgot: ["Quên mật khẩu?", "Nhập email hoặc số điện thoại để nhận mã OTP."],
    otp: ["Kiểm tra hộp thư", "Nhập mã OTP gồm 6 chữ số vừa được gửi."],
    reset: ["Đặt mật khẩu mới", "Mật khẩu mới cần đáp ứng yêu cầu bảo mật."],
  }[mode] || [];
  const showProviders = mode === "login";
  const identity = user?.email || user?.phone || "";
  return (
    <main className="studyhub-auth" aria-labelledby="studyhub-auth-title">
      <section className="studyhub-auth__content">
        <button type="button" className="studyhub-auth__back" onClick={onBack} aria-label="Quay lại">
          <ArrowLeftIcon aria-hidden="true" />
        </button>
        <div className="studyhub-auth__brand" aria-label="StudyHub">
          {mode === "login" || mode === "register"
            ? <img className="studyhub-auth__logo-image" src={studyHubLogo} alt="" />
            : <span className="studyhub-auth__logo" aria-hidden="true"><b>S</b><i>H</i></span>}
        </div>
        <header className="studyhub-auth__heading">
          <h1 id="studyhub-auth-title">{heading[0]}</h1>
          <p>{heading[1]}</p>
        </header>

        {showProviders && (
          <>
            <button type="button" className="studyhub-auth__provider studyhub-auth__provider--google" onClick={() => onOAuth("google")} disabled={!oauthStatus.google}>
              <span className="studyhub-auth__google" aria-hidden="true">
                <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 5.9 29.2 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-4Z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 5.9 29.2 4 24 4c-7.7 0-14.4 4.3-17.7 10.7Z"/><path fill="#4CAF50" d="M24 44c7.6 0 14-4.9 17.3-11.8l-7.6-6.4C31.8 32.1 28.4 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44Z"/><path fill="#1976D2" d="M43.6 20H42V20H24v8h11.3c-1 2.7-2.9 4.9-5.6 6.4l.1-.1 7.6 6.4C36.8 41.3 44 36 44 24c0-1.3-.1-2.7-.4-4Z"/></svg>
              </span>
              <span className="studyhub-auth__provider-label">Tiếp tục với Google</span>
              <span aria-hidden="true" />
            </button>
            <button type="button" className="studyhub-auth__provider studyhub-auth__provider--facebook" onClick={() => onOAuth("facebook")} disabled={!oauthStatus.facebook}>
              <span className="studyhub-auth__facebook" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M13.8 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H8v3h2.6v8h3.2Z"/></svg>
              </span>
              <span className="studyhub-auth__provider-label">Tiếp tục với Facebook</span>
              <span aria-hidden="true" />
            </button>
            <div className="studyhub-auth__divider"><span>hoặc dùng email</span></div>
          </>
        )}

        {error && <p className="studyhub-auth__error" role="alert">{error}</p>}

        {mode === "login" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="button" className="studyhub-auth__link studyhub-auth__forgot" onClick={() => onMode("forgot")}>Quên mật khẩu?</button>
            <button className="studyhub-auth__submit">Đăng nhập</button>
            <p>Chưa có tài khoản? <button type="button" className="studyhub-auth__link" onClick={() => onMode("register")}>Đăng ký</button></p>
          </form>
        )}

        {mode === "register" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <div className="studyhub-auth__names">
              <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
              <label>First name<input name="firstName" autoComplete="given-name" required /></label>
            </div>
            <label>Mật khẩu<input name="password" type="password" autoComplete="new-password" minLength="8" required /></label>
            <small>Mật khẩu gồm ít nhất 8 ký tự, 1 chữ in hoa, 1 số và 1 ký tự đặc biệt.</small>
            <label>Nhập lại mật khẩu<input name="passwordConfirm" type="password" autoComplete="new-password" minLength="8" required /></label>
            <label>Gmail<input name="email" type="email" autoComplete="email" required /></label>
            <button className="studyhub-auth__submit">Tạo tài khoản</button>
            <p>Đã có tài khoản? <button type="button" className="studyhub-auth__link" onClick={() => onMode("login")}>Đăng nhập</button></p>
          </form>
        )}

        {mode === "profile" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <div className="studyhub-auth__names">
              <label>Last name<input name="lastName" defaultValue={user?.last_name || ""} autoComplete="family-name" required /></label>
              <label>First name<input name="firstName" defaultValue={user?.first_name || ""} autoComplete="given-name" required /></label>
            </div>
            <label>Email hoặc số điện thoại<input value={identity} readOnly aria-readonly="true" /></label>
            <button className="studyhub-auth__submit">Tiếp tục</button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <label>Email hoặc số điện thoại<input name="identifier" defaultValue={identifier} autoComplete="email" required /></label>
            <button className="studyhub-auth__submit">Gửi mã OTP</button>
            <p><button type="button" className="studyhub-auth__link" onClick={() => onMode("login")}>Quay lại đăng nhập</button></p>
          </form>
        )}

        {mode === "otp" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <label>Mã OTP<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoComplete="one-time-code" required /></label>
            <button className="studyhub-auth__submit">Xác nhận mã</button>
            <p><button type="button" className="studyhub-auth__link" onClick={() => onMode("forgot")}>Gửi lại mã</button></p>
          </form>
        )}

        {mode === "reset" && (
          <form className="studyhub-auth__form" onSubmit={onSubmit}>
            <label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" minLength="8" required /></label>
            <small>Mật khẩu gồm ít nhất 8 ký tự, 1 chữ in hoa, 1 số và 1 ký tự đặc biệt.</small>
            <label>Nhập lại mật khẩu<input name="passwordConfirm" type="password" autoComplete="new-password" minLength="8" required /></label>
            <button className="studyhub-auth__submit">Lưu mật khẩu mới</button>
          </form>
        )}
      </section>
    </main>
  );
}

function useRevealOnScroll(dependencyKey) {
  useEffect(() => {
    const elements = document.querySelectorAll(".reveal, .reveal-stagger");
    if (!elements.length) return undefined;
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      elements.forEach((el) => el.classList.add("in-view"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [dependencyKey]);
}

export default function App() {
  const [view, setView] = useState(() => viewForPath(window.location.pathname));
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("studyhub-user"));
    } catch {
      return null;
    }
  });
  const [documents, setDocuments] = useState([]);
  const [quizDecks, setQuizDecks] = useState(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("studyhub-user"));
      const userKey = storedUser && String(storedUser.id || storedUser.email || "");
      return userKey ? JSON.parse(localStorage.getItem(`studyhub-quiz-decks:${userKey}`)) || [] : [];
    } catch {
      return [];
    }
  });
  const [subjects, setSubjects] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [documentSort, setDocumentSort] = useState("newest");
  const [documentType, setDocumentType] = useState("all");
  const [progress, setProgress] = useState([]);
  const [progressAnalytics, setProgressAnalytics] = useState(EMPTY_PROGRESS_ANALYTICS);
  const [studyTime, setStudyTime] = useState(EMPTY_STUDY_TIME);
  const [streak, setStreak] = useState({
    current_streak: 0,
    recovery_count: 0,
    last_activity_date: null,
  });
  const [modal, setModal] = useState(() => isAuthPath(window.location.pathname) ? "auth" : null);
  const [authMode, setAuthMode] = useState(() => window.location.pathname === "/register" ? "register" : "login");
  const [authError, setAuthError] = useState("");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [oauthStatus, setOAuthStatus] = useState({ google: false, facebook: false });
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('studyhub-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('studyhub-theme', theme); } catch { /* Theme still works when storage is unavailable. */ }
  }, [theme]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [uploadPhase, setUploadPhase] = useState("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const documentPreviewRequest = useRef(0);
  const userRef = useRef(user);
  const uploadInput = useRef(null);
  const uploadInFlight = useRef(false);
  const [subscription, setSubscription] = useState({
    plan: "free",
    status: "active",
  });
  const [pendingPlan, setPendingPlan] = useState(null);
  const [activeStudyDeck, setActiveStudyDeck] = useState(null);
  const [billingCycle] = useState("month");
  const subjectOptions = useMemo(() => quickSortSubjects(subjects), [subjects]);
  const subjectIndex = useMemo(() => buildSubjectHashMap(subjectOptions), [subjectOptions]);
  const average = progressAnalytics.summary?.learning_percent || 0;
  const filteredDocs = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    const matchedSubject = normalizedSearch ? findSubject(subjectIndex, normalizedSearch) : null;
    const matched = documents.filter(
      (doc) =>
        (filter === "all" || doc.subject_code === filter) &&
        (documentType === "all" || String(doc.file_type || "").replace(/^\./, "").toLowerCase() === documentType) &&
        (!normalizedSearch ||
          `${doc.title} ${doc.original_filename || ""} ${doc.file_type || ""} ${doc.description || ""} ${doc.content_preview || ""}`.toLocaleLowerCase("vi").includes(normalizedSearch) ||
          (matchedSubject && doc.subject_code === matchedSubject.code)),
    );
    return [...matched].sort((left, right) => {
      if (documentSort === "title") return String(left.title || "").localeCompare(String(right.title || ""), "vi");
      if (documentSort === "title-desc") return String(right.title || "").localeCompare(String(left.title || ""), "vi");
      if (documentSort === "oldest") return String(left.created_at || "").localeCompare(String(right.created_at || ""));
      if (documentSort === "size") return Number(right.file_size || 0) - Number(left.file_size || 0);
      if (documentSort === "progress") {
        const progressByDocument = new Map(progress.map((item) => [String(item.documentId), item.percent || 0]));
        return (progressByDocument.get(String(right.id)) || 0) - (progressByDocument.get(String(left.id)) || 0);
      }
      return String(right.created_at || "").localeCompare(String(left.created_at || ""));
    });
  }, [documents, documentSort, documentType, filter, progress, search, subjectIndex]);
  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const saveUser = useCallback((next) => {
    const current = userRef.current;
    const currentKey = current ? String(current.id || current.email || "") : "";
    const nextKey = next ? String(next.id || next.email || "") : "";
    if (currentKey !== nextKey) {
      documentPreviewRequest.current += 1;
      setDocuments([]);
      setSubjects([]);
      setQuizDecks([]);
      setActiveStudyDeck(null);
      setProgress([]);
      setProgressAnalytics(EMPTY_PROGRESS_ANALYTICS);
      setStudyTime(EMPTY_STUDY_TIME);
      setStreak({ current_streak: 0, recovery_count: 0, last_activity_date: null });
      setSubscription({ plan: "free", status: "active" });
      setFilter("all");
      setSearch("");
      setSelectedDocument(null);
      setDocumentPreview(null);
    }
    userRef.current = next;
    setUser(next);
    next
      ? localStorage.setItem("studyhub-user", JSON.stringify(next))
      : localStorage.removeItem("studyhub-user");
  }, []);
  const saveSubscription = (next) => {
    setSubscription(next);
    if (user) {
      localStorage.setItem(
        `studyhub-subscription:${user.id || user.email}`,
        JSON.stringify(next),
      );
    }
  };
  const loadDocuments = async () => {
    try {
      setDocuments(await getDocuments());
    } catch {
      setDocuments([]);
    }
  };
  const loadProgress = async () => {
    try {
      const result = await getProgress();
      setProgress(mapDocumentProgress(result));
      setProgressAnalytics(result.analytics || EMPTY_PROGRESS_ANALYTICS);
    } catch {
      setProgress([]);
      setProgressAnalytics(EMPTY_PROGRESS_ANALYTICS);
    }
  };
  const loadDocumentsAndProgress = async () => {
    await Promise.all([loadDocuments(), loadProgress()]);
  };
  const loadSubjects = async () => {
    try {
      setSubjects(await getSubjects());
    } catch {
      setSubjects([]);
    }
  };
  const userKey = user ? String(user.id || user.email || "") : "";
  useEffect(() => {
    if (!authReady || !userKey) return undefined;
    let active = true;
    const refreshStreak = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const result = await getStreak();
        if (active) setStreak(result);
      } catch { /* Retry on the next tick or when returning to the tab. */ }
    };
    const timer = window.setInterval(refreshStreak, 15000);
    window.addEventListener("focus", refreshStreak);
    document.addEventListener("visibilitychange", refreshStreak);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshStreak);
      document.removeEventListener("visibilitychange", refreshStreak);
    };
  }, [authReady, userKey]);
  useEffect(() => {
    if (!authReady) return undefined;
    let active = true;
    const refreshUserData = async () => {
      // Clear every user-scoped view before loading the next account. This prevents
      // a previous account's documents from flashing while the new request runs.
      setDocuments([]);
      setSubjects([]);
      setProgress([]);
      setProgressAnalytics(EMPTY_PROGRESS_ANALYTICS);
      setStudyTime(EMPTY_STUDY_TIME);
      setStreak({ current_streak: 0, recovery_count: 0, last_activity_date: null });
      setSubscription({ plan: "free", status: "active" });
      setFilter("all");
      setSearch("");
      setSelectedDocument(null);
      if (!userKey) {
        setQuizDecks([]);
        return;
      }
      try {
        setQuizDecks(JSON.parse(localStorage.getItem(`studyhub-quiz-decks:${userKey}`)) || []);
      } catch {
        setQuizDecks([]);
      }
      const [documentsResult, subjectsResult, progressResult, studyTimeResult, streakResult, subscriptionResult] = await Promise.allSettled([
        getDocuments(),
        getSubjects(),
        getProgress(),
        getStudyTime(),
        getStreak(),
        getSubscription(),
      ]);
      if (!active) return;
      if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value);
      if (subjectsResult.status === "fulfilled") setSubjects(subjectsResult.value);
      if (progressResult.status === "fulfilled") {
        setProgress(mapDocumentProgress(progressResult.value));
        setProgressAnalytics(progressResult.value.analytics || EMPTY_PROGRESS_ANALYTICS);
      }
      if (studyTimeResult.status === "fulfilled") setStudyTime(studyTimeResult.value);
      if (streakResult.status === "fulfilled") setStreak(streakResult.value);
      if (subscriptionResult.status === "fulfilled") {
        setSubscription(subscriptionResult.value);
        localStorage.setItem(`studyhub-subscription:${userKey}`, JSON.stringify(subscriptionResult.value));
      }
    };
    const timer = window.setTimeout(() => void refreshUserData(), 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authReady, userKey]);
  useEffect(() => {
    if (!authReady || !userKey) return undefined;
    const clock = window.setInterval(() => {
      setStudyTime((current) => current.active ? {
        ...current,
        total_seconds: current.total_seconds + 1,
        current_session_seconds: current.current_session_seconds + 1,
      } : current);
    }, 1000);
    const sync = window.setInterval(() => {
      getStudyTime().then(setStudyTime).catch(() => {});
    }, 15000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
    };
  }, [authReady, userKey]);
  useEffect(() => {
    if (!authReady || !userKey || view !== "library") return undefined;
    let active = true;
    const refresh = async () => {
      const [documentsResult, progressResult] = await Promise.allSettled([getDocuments(), getProgress()]);
      if (!active) return;
      if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value);
      if (progressResult.status === "fulfilled") {
        setProgress(mapDocumentProgress(progressResult.value));
        setProgressAnalytics(progressResult.value.analytics || EMPTY_PROGRESS_ANALYTICS);
      }
    };
    void refresh();
    return () => { active = false; };
  }, [authReady, userKey, view]);
  useRevealOnScroll(`${view}-${documents.length}-${quizDecks.length}`);
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((result) => {
        if (active && result.user) {
          saveUser(result.user);
          getStreak().then(setStreak).catch(() => {});
          if (!result.user.profile_completed) {
            setAuthMode("profile");
            setModal("auth");
          }
        }
        if (active && !result.user) saveUser(null);
      })
      .catch(() => {
        if (active) saveUser(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, [saveUser]);
  useEffect(() => {
    if (!authReady) return undefined;
    const syncRoute = () => {
      const path = window.location.pathname;
      if (path.startsWith("/app/") && !(path in PATH_VIEWS)) {
        window.history.replaceState({}, "", user ? "/dashboard" : "/");
        setView("home");
        setToast("Trang này hiện chưa khả dụng. Vui lòng kiểm tra lại đường dẫn.");
        window.setTimeout(() => setToast(""), 3200);
        return;
      }
      if (user && !user.profile_completed && authMode === "profile") {
        setModal("auth");
        return;
      }
      if (isAuthPath(path)) {
        if (user && !(modal === "auth" && authMode === "profile")) {
          window.history.replaceState({}, "", "/dashboard");
          setView("home");
          setModal(null);
        } else if (!user) {
          setView("home");
          setAuthMode(path === "/register" ? "register" : "login");
          setModal("auth");
        }
        return;
      }
      if (isProtectedPath(path) && !user) {
        window.history.replaceState({}, "", "/login");
        setView("home");
        setAuthMode("login");
        setModal("auth");
        return;
      }
      if (user && path === "/") window.history.replaceState({}, "", "/dashboard");
      setView(viewForPath(path));
      if (modal === "auth") setModal(null);
    };
    window.addEventListener("popstate", syncRoute);
    syncRoute();
    return () => window.removeEventListener("popstate", syncRoute);
  }, [authReady, authMode, modal, user]);
  useEffect(() => {
    const expireSession = () => {
      saveUser(null);
      setView("home");
      setAuthMode("login");
      setAuthError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.");
      setModal("auth");
      window.history.replaceState({}, "", "/login");
    };
    window.addEventListener("studyhub:session-expired", expireSession);
    return () => window.removeEventListener("studyhub:session-expired", expireSession);
  }, [saveUser]);
  useEffect(() => {
    if (modal !== "auth") return undefined;
    let active = true;
    getOAuthStatus()
      .then((result) => {
        if (active) setOAuthStatus({
          google: Boolean(result.providers?.google?.configured),
          facebook: Boolean(result.providers?.facebook?.configured),
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [modal]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("oauth");
    const oauthError = params.get("oauth_error");
    const oauthProvider = params.get("oauth_provider");
    if (!oauthResult && !oauthError) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (oauthResult === "success") {
      getCurrentUser().then((result) => {
        if (result.user) {
          saveUser(result.user);
          getStreak().then(setStreak).catch(() => {});
          if (!result.user.profile_completed) {
            setAuthMode("profile");
            setModal("auth");
          }
          notify("Đăng nhập thành công.");
        }
      }).catch(() => notify("Không thể tải phiên đăng nhập."));
      return;
    }
    const timer = window.setTimeout(() => {
      setAuthMode("login");
      setAuthError(
        oauthError === "access_denied"
          ? "Bạn đã hủy đăng nhập."
          : oauthError === "provider_failed" && oauthProvider === "facebook"
            ? "Facebook từ chối đăng nhập. Kiểm tra Valid OAuth Redirect URI và quyền tài khoản trong Facebook Developer."
            : "Đăng nhập chưa thành công.",
      );
      setModal("auth");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [saveUser]);
  const openAuth = (mode = "login") => {
    const nextPath = mode === "register" ? "/register" : "/login";
    setAuthError("");
    setAuthMode(mode);
    setModal("auth");
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  };
  const requireLogin = () => {
    if (user) return false;
    openAuth("login");
    notify("Đăng nhập để dùng tính năng cá nhân.");
    return true;
  };
  const go = (next) => {
    if (!VIEW_PATHS[next]) {
      notify("Trang này hiện chưa khả dụng. Vui lòng thử lại sau.");
      return false;
    }
    if (next !== "home" && requireLogin()) return false;
    if (next === "dashboard" && user) void loadProgress();
    setView(next);
    const nextPath = next === "home" && !user ? "/" : VIEW_PATHS[next];
    if (nextPath && window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  };
  const openDocumentPreview = async (document) => {
    const requestId = ++documentPreviewRequest.current;
    setDocumentPreview({ document, loading: true, content: "", error: "" });
    setModal("document-preview");
    try {
      const result = await getDocumentContent(document.id);
      if (requestId !== documentPreviewRequest.current) return;
      setDocumentPreview({ document: { ...document, ...result }, loading: false, content: result.content || "", error: "" });
      void loadProgress();
    } catch (error) {
      if (requestId !== documentPreviewRequest.current) return;
      setDocumentPreview({ document, loading: false, content: "", error: error.message });
    }
  };
  const closeDocumentPreview = () => {
    documentPreviewRequest.current += 1;
    setModal(null);
    setDocumentPreview(null);
  };
  const signOut = async () => {
    try {
      await apiLogout();
    } catch {
      /* Always clear the local session. */
    }
    saveUser(null);
    setDocuments([]);
    setSubjects([]);
    setProgress([]);
    setProgressAnalytics(EMPTY_PROGRESS_ANALYTICS);
    setStudyTime(EMPTY_STUDY_TIME);
    setStreak({ current_streak: 0, recovery_count: 0, last_activity_date: null });
    setSubscription({ plan: "free", status: "active" });
    setView("home");
    setModal(null);
    window.history.replaceState({}, "", "/");
    notify("Đã đăng xuất và xóa phiên làm việc trên trình duyệt.");
  };
  const submitAuth = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthError("");
    try {
      if (authMode === "forgot") {
        const identifier = String(data.get("identifier") || "").trim();
        await requestPasswordOtp(identifier);
        setResetIdentifier(identifier);
        setAuthMode("otp");
        return;
      }
      if (authMode === "otp") {
        const result = await verifyPasswordOtp({ identifier: resetIdentifier, code: String(data.get("code") || "") });
        setResetToken(result.reset_token);
        setAuthMode("reset");
        return;
      }
      if (authMode === "reset") {
        const password = String(data.get("password") || "");
        if (password !== data.get("passwordConfirm")) throw new Error("Mật khẩu nhập lại chưa khớp");
        await resetPassword({ resetToken, password });
        setResetToken("");
        setAuthMode("login");
        notify("Đã đặt lại mật khẩu. Bạn có thể đăng nhập lại.");
        return;
      }
      if (authMode === "profile") {
        const result = await completeProfile({ firstName: String(data.get("firstName") || ""), lastName: String(data.get("lastName") || "") });
        saveUser(result.user);
        if (result.user.streak) setStreak(result.user.streak);
        setModal(null);
        notify("Hồ sơ đã sẵn sàng.");
        return;
      }
      const password = String(data.get("password") || "");
      if (authMode === "register" && password !== data.get("passwordConfirm")) throw new Error("Mật khẩu nhập lại chưa khớp");
      const result = authMode === "login"
        ? await login(data.get("email"), password)
        : await register({
            firstName: String(data.get("firstName") || ""),
            lastName: String(data.get("lastName") || ""),
            email: String(data.get("email") || ""),
            password,
          });
      setDocuments([]);
      setProgress([]);
      setProgressAnalytics(EMPTY_PROGRESS_ANALYTICS);
      setStudyTime(EMPTY_STUDY_TIME);
      setSubjects([]);
      setSubscription({ plan: "free", status: "active" });
      const nextUser = result.user || result;
      saveUser(nextUser);
      if (nextUser.streak) setStreak(nextUser.streak);
      if (!nextUser.profile_completed) {
        setAuthMode("profile");
      } else {
        setModal(null);
      }
      notify(authMode === "login" ? "Đăng nhập thành công." : "Tạo tài khoản thành công.");
    } catch (error) {
      setAuthError(error.message || "Không thể thực hiện yêu cầu.");
    }
  };
  const submitUpload = async (event) => {
    event.preventDefault();
    if (uploadInFlight.current) return;
    setUploadPhase("validating");
    setUploadError("");
    const fail = (message) => {
      setUploadPhase("error");
      setUploadError(message);
      notify(message);
    };
    const file = uploadFile;
    if (!file?.name) return fail("Hãy chọn tài liệu trước.");
    const title = uploadTitle.trim();
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!title) return fail("Tiêu đề tài liệu không được để trống.");
    const subjectCode = uploadSubject || subjectOptions[0]?.code || "";
    if (!subjectCode) return fail("Hãy chọn hoặc thêm môn học trước.");
    if (file.size === 0) return fail("File không được rỗng.");
    if (file.size > 10 * 1024 * 1024) return fail("File tối đa 10MB.");
    if (![".pdf", ".txt", ".md", ".csv", ".doc", ".docx", ".ppt", ".pptx"].includes(extension)) {
      return fail("Định dạng file chưa được hỗ trợ.");
    }
    uploadInFlight.current = true;
    try {
      setUploadPhase("uploading");
      await uploadDocument({
        file,
        title,
        description: uploadDescription,
        subjectCode,
      });
      setUploadPhase("processing");
      await loadDocumentsAndProgress();
      setUploadPhase("success");
      notify("Đã tải tài liệu vào kho học liệu.");
      window.setTimeout(() => {
        setModal(null);
        setUploadPhase("idle");
        setUploadFile(null);
        setUploadFileName("");
        setUploadTitle("");
        setUploadDescription("");
        setUploadSubject("");
      }, 1000);
    } catch (error) {
      fail(`Upload thất bại: ${error.message || "Vui lòng thử lại."}`);
    } finally {
      uploadInFlight.current = false;
    }
  };
  const chooseOAuthLogin = (provider) => {
    if (!oauthStatus[provider]) {
      notify(`Đăng nhập ${provider === "google" ? "Google" : "Facebook"} chưa được cấu hình trên backend.`);
      return;
    }
    window.location.assign(getOAuthLoginUrl(provider));
  };
  const selectUploadFile = (file) => {
    if (!file || !uploadInput.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    uploadInput.current.files = transfer.files;
    setUploadFile(file);
    setUploadFileName(file.name);
    setUploadPhase("idle");
    setUploadError("");
  };
  const removeLibraryDocument = async (event, document) => {
    event.stopPropagation();
    setDeleteCandidate(document);
  };
  const confirmLibraryDocumentDelete = async () => {
    const document = deleteCandidate;
    if (!document) return;
    try {
      await deleteDocument(document.id);
      if (String(documentPreview?.document?.id) === String(document.id)) closeDocumentPreview();
      setSelectedDocument((current) => String(current?.id) === String(document.id) ? null : current);
      await loadDocumentsAndProgress();
      setDeleteCandidate(null);
      notify("Đã xóa tài liệu khỏi kho học liệu.");
    } catch (error) {
      notify(`Không thể xóa tài liệu: ${error.message}`);
    }
  };
  const submitSubject = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const createdSubject = await createSubject({
        name: data.get("name"),
        code: data.get("code"),
        description: data.get("description"),
      });
      await loadSubjects();
      setUploadSubject(createdSubject.code);
      setUploadPhase("idle");
      setUploadError("");
      setModal("upload");
      notify("Đã thêm môn học mới.");
    } catch (error) {
      notify(`Không thể thêm môn học: ${error.message}`);
    }
  };
  const submitQuizDeck = (deck) => {
    if (requireLogin()) return;
    if (!deck.name) return notify("Tên bộ thẻ không được để trống.");
    const next = [...quizDecks, deck];
    setQuizDecks(next);
    localStorage.setItem(`studyhub-quiz-decks:${userKey}`, JSON.stringify(next));
    setModal(null);
    notify("Đã tạo bộ thẻ ghi nhớ mới.");
  };
  const updateStudyDeck = (deck) => {
    const next = quizDecks.map((item) => item.id === deck.id ? deck : item);
    setQuizDecks(next);
    setActiveStudyDeck(deck);
    localStorage.setItem(`studyhub-quiz-decks:${userKey}`, JSON.stringify(next));
  };
  const requestPlan = (plan) => {
    if (requireLogin() || plan === subscription.plan) return;
    setPendingPlan(plan);
    setModal(plan === "free" ? "plan" : "payment");
  };
  const confirmPlan = async () => {
    try {
      const result = await checkoutSubscription({
        plan: pendingPlan,
        billingCycle,
      });
      saveSubscription(result);
      setModal(null);
      notify(
        result.change_type === "downgrade_scheduled"
          ? "Đã lên lịch hạ gói vào cuối chu kỳ."
          : `Đã kích hoạt gói ${PLANS[pendingPlan].name} trong môi trường demo.`,
      );
    } catch (error) {
      notify(`Không thể xử lý yêu cầu: ${error.message}`);
    }
  };
  const cancelPlan = async () => {
    try {
      const result = await cancelSubscription();
      setSubscription((current) => ({
        ...current,
        status: "scheduled_change",
        scheduled_change: result.scheduled_change,
      }));
      notify("Đã lên lịch hủy gia hạn vào cuối chu kỳ.");
    } catch (error) {
      notify(`Không thể hủy gia hạn: ${error.message}`);
    }
  };
  if (!authReady) return <div className="auth-checking" role="status" aria-label="Đang kiểm tra phiên đăng nhập"><span /></div>;
  if ((modal === "auth" && (!user || authMode === "profile")) || (!user && isProtectedPath(window.location.pathname))) {
    return (
      <>
      <div className="auth-theme"><ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')} /></div>
      <StudyHubAuthScreen
        mode={authMode}
        user={user}
        oauthStatus={oauthStatus}
        error={authError}
        identifier={resetIdentifier}
        onBack={() => {
          setAuthError("");
          setModal(null);
          setView("home");
          window.history.replaceState({}, "", user ? "/dashboard" : "/");
        }}
        onMode={(next) => {
          setAuthError("");
          setAuthMode(next);
          if (next === "login" || next === "register") {
            window.history.replaceState({}, "", next === "register" ? "/register" : "/login");
          }
        }}
        onOAuth={chooseOAuthLogin}
        onSubmit={submitAuth}
      />
      </>
    );
  }
  return (
    <>
    <FocusSpacePage key={userKey || 'guest'} active={view === 'focusSpace'} user={user} onBack={() => go("home")} theme={theme} onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
    <div className={`studyhub-app ${theme}`} hidden={view === 'focusSpace'}>
      <header className="topbar">
        <button className="brand-wrap" onClick={() => go("home")} aria-label="StudyHub - Trang chủ">
          <span className="brand-mark"><BookOpenIcon aria-hidden="true" /></span>
          <span className="brand-text">
            Study<span>Hub</span>
          </span>
        </button>
        <nav className="nav-menu" aria-label="Điều hướng chính">
          {[
            ["home", "Trang chủ"],
            ["library", "Kho học liệu"],
            ["quiz", "Quiz Card"],
            ["roadmap", "Lộ trình học"],
            ["dashboard", "Tiến độ"],
            ["tutor", "AI Tutor"],
            ["pricing", "Gói học"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="auth-box">
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
          {user ? (
            <>
              <button
                className="streak-pill"
                title={`${streak.recovery_count} lần khôi phục đã dùng`}
              >
                <FireIcon aria-hidden="true" />
                <strong>{streak.current_streak}</strong>
                <span>ngày</span>
              </button>
              <button className="user-pill" onClick={() => setModal("account")}>
                <span className="user-avatar">
                  {user.name?.[0]?.toUpperCase() || "U"}
                </span>
                {user.name}
              </button>
              <button className="btn btn-ghost" onClick={signOut}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => openAuth("login")}>Đăng nhập</button>
              <button className="btn btn-primary" onClick={() => openAuth("register")}>Đăng ký</button>
            </>
          )}
        </div>
      </header>
      <main className="main-shell">
        {view === "home" && (
          <>
            <section className={`hero-section ${!user ? 'landing-hero' : ''}`}>
              <div className="hero-copy">
                <span className="eyebrow">
                  STUDYHUB · NỀN TẢNG HỌC CÁ NHÂN CÓ ĐỊNH HƯỚNG
                </span>
                <h1>
                  Học sâu hơn.
                  <br />
                  <span>Tiến bộ rõ hơn.</span>
                </h1>
                <p className="hero-tagline">
                  Nền tảng AI giúp sinh viên tổ chức tài liệu, tạo Quiz thông minh, xây dựng lộ trình học cá nhân hóa và trao đổi trực tiếp với Nova AI Tutor 24/7.

                </p>
                <div className="hero-actions">
                  <button
                    className="btn btn-primary large"
                    onClick={() => user ? go("tutor") : openAuth("login")}
                  >
                    <SparklesIcon aria-hidden="true" className="btn-icon" />
                    Hỏi Nova AI Tutor
                  </button>
                  <button
                    className="btn btn-outline large"
                    onClick={() => user ? go("library") : openAuth("login")}
                  >
                    <BookOpenIcon aria-hidden="true" className="btn-icon" />
                    Mở kho học liệu
                  </button>
                </div>
                <div className="hero-badges">
                  <button type="button" className="hero-badge" onClick={() => go("quiz")}><RectangleStackIcon aria-hidden="true" /> Quiz Card AI</button>
                  <button type="button" className="hero-badge" onClick={() => go("roadmap")}><SparklesIcon aria-hidden="true" /> Lộ trình cá nhân</button>
                  <button type="button" className="hero-badge" onClick={() => go("dashboard")}><BoltIcon aria-hidden="true" /> Theo dõi tiến độ</button>
                </div>
              </div>
              <div className="hero-visual">
                <Logo3D />
                {user ? <>
                  <div className="hero-note hero-note--one"><BookOpenIcon aria-hidden="true" /><div><strong>{documents.length} tài liệu</strong><small>Đã lưu</small></div></div>
                  <div className="hero-note hero-note--two"><SparklesIcon aria-hidden="true" /><div><strong>{progress.length ? `${average}%` : "—"}</strong><small>Tiến độ</small></div></div>
                  <div className="hero-note hero-note--three"><FireIcon aria-hidden="true" /><div><strong>{streak.current_streak} ngày</strong><small>Streak</small></div></div>
                </> : <>
                  <div className="hero-note hero-note--one"><BookOpenIcon aria-hidden="true" /><div><strong>Gọn một nơi</strong><small>Tài liệu & kiến thức</small></div></div>
                  <div className="hero-note hero-note--two"><SparklesIcon aria-hidden="true" /><div><strong>Rõ từng bước</strong><small>Lộ trình của riêng bạn</small></div></div>
                  <div className="hero-note hero-note--three"><FireIcon aria-hidden="true" /><div><strong>Mỗi ngày một chút</strong><small>Xây thói quen học</small></div></div>
                </>}
              </div>
            </section>
            <section className="content-section pain-points-section">
              <span className="eyebrow">❤️ VẤN ĐỀ</span>
              <h2>Bạn có đang học theo cách này?</h2>
              <div className="pain-grid">
                {[
                  ["📄", "Tài liệu nằm khắp nơi", "Drive, Google, Messenger, đủ nơi không biết bắt đầu từ đâu."],
                  ["❤️", "Học nhiều nhưng khô nhớ", "Không có phương pháp lặp lại hiệu quả."],
                  ["💡", "Không biết học gì tiếp theo", "Không có lộ trình rõ ràng."],
                  ["🔥", "Khó duy trì thói quen", "Học được vài ngày rồi bỏ."],
                ].map(([icon, title, desc], i) => (
                  <article className="pain-card" key={i}>
                    <span className="pain-icon">{icon}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </article>
                ))}
              </div>
              <p className="pain-conclusion">
                <strong>Bạn không thiếu tài liệu.</strong><br/>
                Bạn đang thiếu một hệ thống học tập phù hợp.
              </p>
            </section>
            {user && <StreakCard
              user={user}
              streak={streak}
              onLogin={() => openAuth("login")}
            />}
            <section className="content-section workflow-section" id="studyhub-workflow">
              <span className="eyebrow">WORKFLOW CÁ NHÂN</span>
              <h2>StudyHub gom mọi thứ bạn cần<br />vào một nhịp học.</h2>
              <div className="workflow-grid reveal-stagger">
                {[
                  [
                    "01",
                    "Lưu học liệu",
                    "Tải bài giảng & tài liệu lên kho thông minh.",
                    "library",
                  ],
                  [
                    "02",
                    "Ôn Quiz Card",
                    "AI tự tạo thẻ Flashcard ôn tập lặp lại ngắt quãng.",
                    "quiz",
                  ],
                  [
                    "03",
                    "Xây lộ trình",
                    "Phân bổ lịch học cụ thể theo cấu trúc thi.",
                    "roadmap",
                  ],
                  [
                    "04",
                    "Theo dõi tiến độ",
                    "Xem tỉ lệ hoàn thành và giữ vững streak học.",
                    "dashboard",
                  ],
                  [
                    "05",
                    "Hỏi Nova AI",
                    "Giải đáp thắc mắc chuyên sâu tức thì 24/7.",
                    "tutor",
                  ],
                ].map(([num, title, detail, target]) => (
                  <article className="workflow-card" key={num}>
                    <span className="step-tag">{num}</span>
                    <h3>{title}</h3>
                    <p>{detail}</p>
                <button className="text-link" onClick={() => go(target)}>
                      Mở tính năng{" "}
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="link-icon"
                      />
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <section className="content-section roadmap-sample-section">
              <span className="eyebrow">■ LỘ TRÌNH HỌC MẪu</span>
              <h2>Học từng bước, tiến bộ từng tuần.</h2>
              <p>StudyHub giúp bạn biến một mục tiêu lớn thành những bước học nhỏ và rõ ràng.</p>
              <div className="roadmap-cards">
                {[
                  { week: "TUẦN 1", title: "Làm quen", sub: "Xây nền tảng", items: ["Làm quen với kiến thức cơ bản", "Đọc tài liệu nền tảng", "Hoàn thành 2 bài học", "Ôn 10 Quiz Card"], progress: 80, active: false },
                  { week: "TUẦN 2", title: "Xây nền", sub: "Nắm kiến thức trọng tâm", items: ["Học kiến thức chính", "Làm bài tập cơ bản", "Hoàn thành 3 bài học", "Ôn 20 Quiz Card"], progress: 60, active: true },
                  { week: "TUẦN 3", title: "Luyện tập", sub: "Áp dụng kiến thức", items: ["Làm bài tập nâng cao", "Ôn tập bằng Quiz Card", "Hỏi Nova những phần chưa hiểu", "Hoàn thành mini test"], progress: 40, active: false },
                  { week: "TUẦN 4", title: "Tổng ôn", sub: "Kiểm tra và củng cố", items: ["Ôn toàn bộ kiến thức", "Làm bài kiểm tra", "Xem lại phần còn yếu", "Đánh giá tiến độ"], progress: 20, active: false },
                ].map((w, i) => (
                  <article className={`roadmap-week-card${w.active ? ' active' : ''}`} key={i}>
                    <div className="roadmap-week-header">
                      <span className="week-dot" />
                      <span className="week-label">{w.week}</span>
                      {w.active && <span className="week-badge">ĐANG HỌC</span>}
                    </div>
                    <h3>{w.title}</h3>
                    <p className="week-sub">{w.sub}</p>
                    <ul>{w.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                    <div className="week-progress">
                      <span>Tiến độ</span>
                      <strong>{w.progress}%</strong>
                    </div>
                    <div className="progress-bar"><span style={{ width: `${w.progress}%` }} /></div>
                  </article>
                ))}
              </div>
              <div className="roadmap-cta">
                <p><strong>Bạn không cần tự lên kế hoạch từ đầu.</strong></p>
                <p>StudyHub giúp chia mục tiêu lớn thành từng bước học rõ ràng.</p>
                <button className="btn btn-primary" onClick={() => go("roadmap")}>Xem lộ trình của tôi →</button>
              </div>
            </section>
            <section className="content-section streak-habit-section">
              <span className="eyebrow">■ THÓI QUEN BỀN VỮNG</span>
              <h2>🔥 Giữ nhịp học mỗi ngày ✨</h2>
              <p>Sự đều đặn nhỏ bé tích lũy thành thành tựu lớn. Lên kế hoạch, giữ streak để có thói quen học tập bền bỉ và khỏe mạnh.</p>
              {user ? <StreakCard user={user} streak={streak} onLogin={() => openAuth("login")} /> : <div className="streak-calendar-card">
                <div className="streak-cal-header">
                  <span>{user ? new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric', timeZone: VIETNAM_TIME_ZONE }) : 'Một tuần học · Minh họa'}</span>
                  <span>✔ {user ? `Chuỗi hiện tại: ${streak.current_streak} ngày` : 'Mỗi ngày một bước tiến'}</span>
                </div>
                <div className="streak-week">
                  {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day, i) => (
                    <div className={`streak-day${i < (user ? streak.current_streak : 5) ? ' done' : ''}${i === new Date().getDay() - 1 ? ' today' : ''}`} key={i}>
                      <span className="day-label">{day}</span>
                      <span className="day-num">{12 + i}</span>
                      {i < (user ? streak.current_streak : 5) && <span className="day-check">✔</span>}
                      {user && i === new Date().getDay() - 1 && <span className="day-today">Hôm nay</span>}
                    </div>
                  ))}
                </div>
              </div>}
            </section>
            {!user && <LandingExtras plans={PLANS} onStart={() => openAuth("register")} onExplore={go} />}
          </>
        )}
        {view === "library" && (
          <section className="library-page" aria-labelledby="library-title">
            <header className="library-hero reveal">
              <div className="library-hero-copy">
                <span className="hero-kicker"><SparklesIcon aria-hidden="true" /> Smart Document Hub · AI learning</span>
                <h1 id="library-title">Kho tài liệu học tập<br /><strong>& giáo trình thông minh</strong></h1>
                <p>Tải lên giáo trình, slide hoặc đề thi. StudyHub giúp bạn tóm tắt, ôn tập và hỏi Nova AI ngay trên từng tài liệu.</p>
              </div>
              <button
                className="btn btn-primary hero-upload"
                onClick={() => {
                  if (requireLogin()) return;
                  setUploadPhase("idle");
                  setUploadError("");
                  setUploadFile(null);
                  setUploadFileName("");
                  setUploadTitle("");
                  setUploadDescription("");
                  setUploadSubject("");
                  setModal("upload");
                }}
              >
                <CloudArrowUpIcon aria-hidden="true" />
                Upload tài liệu mới
              </button>
              <dl className="library-metrics" aria-label="Tổng quan kho tài liệu">
                <div><dt>Tổng tài liệu</dt><dd>{documents.length}</dd></div>
                <div><dt>Chuyên mục</dt><dd>{subjectOptions.length}</dd></div>
                <div><dt>Nova AI</dt><dd>{documents.length ? "Sẵn sàng" : "Chưa có dữ liệu"}</dd></div>
              </dl>
            </header>
            <form className="library-tools" onSubmit={(event) => event.preventDefault()} role="search">
              <label className="search-field">
                <span className="sr-only">Tìm kiếm tài liệu</span>
                <MagnifyingGlassIcon aria-hidden="true" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tài liệu theo tên, môn học, từ khóa..." />
              </label>
              <fieldset className="filter-tabs">
                <legend>Chuyên mục</legend>
                <button
                  type="button"
                  className={filter === "all" ? "active" : ""}
                  onClick={() => setFilter("all")}
                >
                  Tất cả
                </button>
                {subjectOptions.map((subject) => (
                  <button
                    type="button"
                    className={filter === (subject.code || subject.id) ? "active" : ""}
                    onClick={() => setFilter(subject.code || subject.id)}
                    key={subject.id || subject.code}
                  >
                    {subject.code || subject.id}
                  </button>
                ))}
                {!subjectOptions.length && <span className="filter-empty">Chưa có môn học</span>}
              </fieldset>
            </form>
            <div className="library-actions">
              <button className="btn btn-outline" onClick={() => !requireLogin() && setModal("subject")}><PlusIcon aria-hidden="true" /> Thêm môn học</button>
              <div className="library-sort-wrap">
                <span>{filteredDocs.length} tài liệu phù hợp</span>
                <label>
                  <span className="sr-only">Lọc theo định dạng</span>
                  <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                    <option value="all">Mọi định dạng</option>
                    <option value="pdf">PDF</option>
                    <option value="doc">DOC</option>
                    <option value="docx">DOCX</option>
                    <option value="ppt">PPT</option>
                    <option value="pptx">PPTX</option>
                    <option value="txt">TXT</option>
                    <option value="md">Markdown</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Sắp xếp tài liệu</span>
                  <select value={documentSort} onChange={(event) => setDocumentSort(event.target.value)}>
                    <option value="newest">Mới nhất</option>
                    <option value="oldest">Cũ nhất</option>
                    <option value="title">Tên A–Z</option>
                    <option value="title-desc">Tên Z–A</option>
                    <option value="size">Dung lượng lớn nhất</option>
                    <option value="progress">Tiến độ cao nhất</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="document-grid reveal-stagger" aria-live="polite">
              {filteredDocs.map((doc) => (
                <article
                  className="document-card document-card-clickable"
                  key={doc.id}
                  onClick={() => openDocumentPreview(doc)}
                >
                  <span>{doc.subject_code || "DOC"}</span>
                  <h3>{doc.title}</h3>
                  <small className="document-file-meta">{String(doc.file_type || "file").replace(/^\./, "").toUpperCase()} · {Math.max(1, Math.round(Number(doc.file_size || 0) / 1024))} KB</small>
                  <p>{doc.content_preview || doc.description || "Tài liệu chưa có nội dung xem trước."}</p>
                  <div className="document-card-actions">
                    <button
                      className="text-link document-view-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDocumentPreview(doc);
                      }}
                    >
                      <BookOpenIcon aria-hidden="true" /> Xem nội dung
                    </button>
                    <button
                      className="text-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedDocument(doc);
                        go("tutor");
                      }}
                    >
                      Hỏi Nova →
                    </button>
                    <button
                      type="button"
                      className="document-delete-button"
                      title={`Xóa ${doc.title}`}
                      aria-label={`Xóa ${doc.title}`}
                      onClick={(event) => removeLibraryDocument(event, doc)}
                    >
                      <TrashIcon aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
              {!filteredDocs.length && (
                <div className="empty-state">
                  {user
                    ? "Chưa có tài liệu phù hợp. Hãy tải tài liệu đầu tiên."
                    : "Đăng nhập để xem kho học liệu cá nhân."}
                </div>
              )}
            </div>
          </section>
        )}
        {view === "quiz" && (
          <section className="quiz-page" aria-labelledby="quiz-title">
            <header className="quiz-hero reveal">
              <div className="quiz-hero-copy">
                <span className="quiz-kicker"><RectangleStackIcon aria-hidden="true" /> 3D Flashcards & Lặp lại Ngắt quãng (Spaced Repetition)</span>
                <h1 id="quiz-title">Bộ Thẻ Ôn Tập & Quiz Card Thông Minh</h1>
                <p>Luyện tập thẻ 3D phản xạ nhanh. Tự động trích xuất các thuật ngữ then chốt từ tài liệu học tập hoặc tự tạo thẻ ôn thi riêng theo môn học.</p>
              </div>
              <button className="btn quiz-create-button" onClick={() => !requireLogin() && setModal("quiz-create")}>
                <PlusIcon aria-hidden="true" /> Tạo Bộ Thẻ Mới
              </button>
            </header>
            <QuizWorkspace documents={documents} user={user} initialDocumentId={selectedDocument?.id} />
            {quizDecks.length ? (
              <div className="quiz-deck-grid reveal-stagger">
                {quizDecks.map((deck) => (
                  <article className="quiz-deck-card" key={deck.id}>
                    <div className={`quiz-deck-cover is-${deck.cover || "plain"}`} style={{ "--deck-color": deck.color || DEFAULT_FLASHCARD_COLOR }} aria-hidden="true" />
                    <h2>{deck.name}</h2>
                    <p>{deck.subject || "Chưa phân loại"}</p>
                    {deck.description && <small>{deck.description}</small>}
                    <progress value={rememberedCount(deck)} max={Math.max(1, deck.cards?.length || 0)} aria-label={`${rememberedCount(deck)} trên ${deck.cards?.length || 0} thẻ đã nhớ`} style={{ "--deck-color": deck.color || DEFAULT_FLASHCARD_COLOR }} />
                    <small className="flashcard-deck-count">{rememberedCount(deck)}/{deck.cards?.length || 0} thẻ đã nhớ</small>
                    <button className="btn btn-primary full" type="button" onClick={() => setActiveStudyDeck(deck)}>Bắt đầu ôn tập</button>
                  </article>
                ))}
              </div>
            ) : (
              <section className="quiz-empty" aria-live="polite">
                <RectangleStackIcon aria-hidden="true" />
                <h2>Chưa có bộ thẻ nào</h2>
                <p>Hãy tạo bộ thẻ đầu tiên để bắt đầu ghi nhớ và ôn tập thông minh.</p>
                <button className="text-link" onClick={() => !requireLogin() && setModal("quiz-create")}>Tạo bộ thẻ đầu tiên <ArrowRightIcon aria-hidden="true" className="link-icon" /></button>
              </section>
            )}
          </section>
        )}
        {view === "roadmap" && (
          <LearningRoadmapPage
            key={String(user?.id || user?.email || "guest")}
            documents={documents}
            progress={progress}
            onOpenDocument={openDocumentPreview}
            onTakeQuiz={(document) => { setSelectedDocument(document); go("quiz"); }}
            user={user}
            streak={streak}
            studyTime={studyTime}
          />
        )}
        {view === "dashboard" && (
          <ProgressDashboard
            user={user}
            analytics={progressAnalytics}
            progress={progress}
            studyTime={studyTime}
            streak={streak}
            quizDecks={quizDecks}
            onLogin={() => openAuth("login")}
          />
        )}
        {view === "tutor" && (
          <AITutorPage selectedDocument={selectedDocument} user={user} onDocumentsChanged={loadDocumentsAndProgress} onDocumentDeleted={(documentId) => setSelectedDocument((current) => String(current?.id) === String(documentId) ? null : current)} />
        )}
        {view === "pricing" && (
          <section className="pricing-page">
            <div className="page-header center-header">
              <div className="pricing-intro reveal">
                <span className="eyebrow">MỞ KHÓA TOÀN BỘ SỨC MẠNH CỦA NOVA AI STUDY HUB</span>
                <h1>Các Gói Nâng Cấp Học Tập<br /><strong>(0đ - 199đ - 299đ)</strong></h1>
                <p className="muted">
                  Đầu tư cho kiến thức để đạt GPA 3.6+, săn học bổng và tự tin bước vào các tập đoàn công nghệ & doanh nghiệp hàng đầu.
                </p>
              </div>
            </div>
            <div className="price-grid reveal-stagger">
              {Object.entries(PLANS).map(([id, plan]) => (
                <article
                  className={`price-card pricing-card-${id} ${id === "plus" ? "featured" : ""} ${subscription.plan === id ? "active" : ""}`}
                  key={id}
                >
                  {id === "plus" && <span className="pricing-ribbon">Khuyến dùng cho sinh viên</span>}
                  <div className="price-card-topline">
                    <span className="plan-badge">{plan.badge}</span>
                    {subscription.plan === id && <span className="current-plan"><CheckIcon aria-hidden="true" /> Gói hiện tại</span>}
                  </div>
                  <h3>{plan.name}</h3>
                  <div className="price-line">
                    {plan.price}
                    <span>{id === "free" ? "" : " / tháng"}</span>
                  </div>
                  <strong className="plan-usage">{plan.subtitle}</strong>
                  <hr />
                  <h4>Quyền lợi chính</h4>
                  <ul>
                    {plan.items.map((item) => (
                      <li key={item}><CheckIcon aria-hidden="true" />{item}</li>
                    ))}
                    {plan.excluded.length > 0 && <li className="excluded-divider">Chưa có trong gói này</li>}
                    {plan.excluded.map((item) => (
                      <li className="is-excluded" key={item}><XMarkIcon aria-hidden="true" />{item}</li>
                    ))}
                  </ul>
                  <button
                    className={`btn full ${subscription.plan === id ? "btn-ghost" : id === "free" ? "btn-outline" : "btn-primary"}`}
                    disabled={subscription.plan === id}
                    onClick={() => requestPlan(id)}
                  >
                    {id !== "free" && <BoltIcon aria-hidden="true" className="btn-icon" />}
                    {subscription.plan === id
                      ? "Gói hiện tại"
                      : id === "free"
                        ? "Chuyển về Gói Khởi Động"
                        : id === "plus"
                          ? "Nâng cấp Gói 199đ"
                          : "Nâng cấp Gói 299đ"}
                  </button>
                </article>
              ))}
            </div>
            {user && (
              <section className="subscription-panel">
                <div>
                  <span className="eyebrow">TRẠNG THÁI GÓI</span>
                  <h3>
                    {PLANS[subscription.plan].name} ·{" "}
                    {PLANS[subscription.plan].subtitle}
                  </h3>
                  <p>
                    {subscription.status === "scheduled_change"
                      ? "Thay đổi gói đã được lên lịch cho cuối chu kỳ hiện tại."
                      : "Gói đang hoạt động. Mọi thay đổi đều cần xác nhận trước khi áp dụng."}
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={subscription.plan === "free"}
                  onClick={cancelPlan}
                >
                  Hủy gia hạn
                </button>
              </section>
            )}
          </section>
        )}
      </main>
      {view === "home" && <FocusSpaceLogo onOpen={() => go("focusSpace")} />}
      <BeeChatWidget visible={view === "home"} key={String(user?.id || user?.email || "guest")} user={user} onNavigate={go} />
      {modal === "document-preview" && documentPreview && (
        <Modal
          title={documentPreview.document.title || "Nội dung tài liệu"}
          subtitle="Bản văn bản thuần được trích xuất từ tài liệu gốc."
          icon={<BookOpenIcon />}
          className="document-preview-modal"
          onClose={closeDocumentPreview}
        >
          <div className="document-preview-meta">
            <span>{documentPreview.document.subject_code || "Tài liệu"}</span>
            <span>{documentPreview.document.file_name || documentPreview.document.original_filename || ""}</span>
            {!documentPreview.loading && !documentPreview.error && (
              <span>{documentPreview.content.length.toLocaleString("vi-VN")} ký tự</span>
            )}
          </div>
          <div className="document-preview-body" aria-live="polite">
            {documentPreview.loading && <p className="document-preview-status">Đang tải toàn bộ nội dung...</p>}
            {documentPreview.error && (
              <p className="document-preview-error">Không thể hiển thị tài liệu: {documentPreview.error}</p>
            )}
            {!documentPreview.loading && !documentPreview.error && documentPreview.content && (
              <pre>{documentPreview.content}</pre>
            )}
            {!documentPreview.loading && !documentPreview.error && !documentPreview.content && (
              <p className="document-preview-status">Tài liệu không có nội dung văn bản để hiển thị.</p>
            )}
          </div>
          <footer className="document-preview-actions">
            <button type="button" className="btn btn-ghost" onClick={closeDocumentPreview}>Đóng</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedDocument(documentPreview.document);
                setModal(null);
                setDocumentPreview(null);
                go("tutor");
              }}
            >
              Hỏi Nova về tài liệu
            </button>
          </footer>
        </Modal>
      )}
      {modal === "upload" && (
        <Modal
          title="Tải lên Tài liệu Mới"
          subtitle="Thêm tài liệu học tập của bạn để bắt đầu ôn luyện và tạo bộ đề tự động."
          icon={<CloudArrowUpIcon />}
          onClose={() => setModal(null)}
        >
          <form className="upload-form" onSubmit={submitUpload}>
            <fieldset className="upload-card">
              <legend>Thông tin tài liệu</legend>
              <label htmlFor="upload-title">
                Tên tài liệu <span className="required-mark">*</span>
              </label>
              <input
                id="upload-title"
                name="title"
                maxLength="200"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Ví dụ: Chương 1 - Đạo hàm và ứng dụng"
              />
              <label htmlFor="upload-description">
                Mô tả <span className="optional-mark">(Tùy chọn)</span>
              </label>
              <textarea
                id="upload-description"
                name="description"
                rows="3"
                maxLength="2000"
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                placeholder="Ghi chú ngắn gọn về nội dung tài liệu…"
              />
            </fieldset>
            <fieldset className="upload-card">
              <legend>Tệp & môn học</legend>
              <div
                className={`smart-upload-zone ${uploadDragActive ? "is-dragging" : ""} ${uploadPhase !== "idle" ? `is-${uploadPhase}` : ""}`}
                onDragOver={(event) => { event.preventDefault(); setUploadDragActive(true); }}
                onDragLeave={() => setUploadDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setUploadDragActive(false);
                  selectUploadFile(event.dataTransfer.files?.[0]);
                }}
              >
                <span className="upload-pixel-character" aria-hidden="true"><CloudArrowUpIcon /></span>
                <strong>ENTER THE KNOWLEDGE VAULT</strong>
                <p>{uploadFileName || "Kéo và thả tài liệu vào đây"}</p>
                <button type="button" className="btn btn-outline" onClick={() => uploadInput.current?.click()}>Chọn tài liệu</button>
                <small>PDF · DOCX · PPTX · TXT · MD · tối đa 10MB</small>
                <input
                  ref={uploadInput}
                  id="upload-file"
                  name="file"
                  type="file"
                  accept=".pdf,.txt,.md,.csv,.doc,.docx,.ppt,.pptx"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setUploadFile(file);
                    setUploadFileName(file?.name || "");
                    setUploadPhase("idle");
                    setUploadError("");
                  }}
                />
              </div>
              {uploadPhase !== "idle" && (
                <div className={`upload-pipeline is-${uploadPhase}`} role={uploadPhase === "error" ? "alert" : "status"}>
                  <span className="upload-pipeline-bar"><i /></span>
                  <strong>{uploadPhase === "validating" ? "Đang kiểm tra tệp..." : uploadPhase === "uploading" ? "Đang tải lên..." : uploadPhase === "processing" ? "Đang lập chỉ mục tài liệu..." : uploadPhase === "success" ? "✓ Sẵn sàng để học" : uploadError || "Không thể xử lý tệp"}</strong>
                </div>
              )}
              <label htmlFor="upload-subject">
                Môn học <span className="required-mark">*</span>
              </label>
              <select
                id="upload-subject"
                name="subject"
                value={uploadSubject || subjectOptions[0]?.code || ""}
                onChange={(event) => setUploadSubject(event.target.value)}
              >
                {!subjectOptions.length && <option value="">Hãy thêm môn học trước</option>}
                {subjectOptions.map((subject) => (
                  <option value={subject.code} key={subject.id}>
                    {subject.code} · {subject.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-link"
                onClick={() => setModal("subject")}
              >
                ＋ Thêm môn học mới
              </button>
            </fieldset>
            <footer className="upload-form__footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setModal(null)}
              >
                Hủy bỏ
              </button>
              <button className="btn btn-primary" disabled={["validating", "uploading", "processing"].includes(uploadPhase)}>Tải lên & Xử lý</button>
            </footer>
          </form>
        </Modal>
      )}
      {deleteCandidate && (
        <Modal title="Xóa tài liệu?" onClose={() => setDeleteCandidate(null)}>
          <div className="delete-document-confirm">
            <p>“{deleteCandidate.title}”</p>
            <span>Thao tác này không thể hoàn tác. Chỉ tài liệu thuộc tài khoản hiện tại mới có thể bị xóa.</span>
            <div>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteCandidate(null)}>Hủy</button>
              <button type="button" className="btn delete-confirm-button" onClick={confirmLibraryDocumentDelete}>Xóa tài liệu</button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "subject" && (
        <Modal title="Thêm môn học" onClose={() => setModal(null)}>
          <form className="auth-form" onSubmit={submitSubject}>
            <label>
              Tên môn học
              <input name="name" required minLength="2" maxLength="100" />
            </label>
            <label>
              Mã môn học
              <input
                name="code"
                required
                minLength="2"
                maxLength="12"
                pattern="[A-Za-z0-9]+"
                placeholder="VD: AI101"
              />
            </label>
            <label>
              Mô tả
              <textarea name="description" rows="3" maxLength="500" />
            </label>
            <button className="btn btn-primary full">Lưu môn học</button>
          </form>
        </Modal>
      )}
      {modal === "quiz-create" && (
        <Modal title="Tạo bộ thẻ ghi nhớ mới" onClose={() => setModal(null)}>
          <FlashcardDeckForm onCreate={submitQuizDeck} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal === "plan" && (
        <Modal title="Xác nhận thay đổi gói" onClose={() => setModal(null)}>
          <p>
            Bạn đang yêu cầu chuyển từ{" "}
            <strong>{PLANS[subscription.plan].name}</strong> sang{" "}
            <strong>{PLANS[pendingPlan].name}</strong>.
          </p>
          <p className="muted">
            Đây là luồng demo. StudyHub chưa kết nối cổng thanh toán, vì vậy
            yêu cầu này không thu tiền và không kích hoạt quyền lợi gói trả phí.
          </p>
          <button className="btn btn-primary full" onClick={confirmPlan}>
            Gửi yêu cầu demo
          </button>
        </Modal>
      )}
      {modal === "payment" && pendingPlan && (
        <Modal title="Thanh toán gói học" subtitle="Thanh toán QR hiện đại · trạng thái xác nhận an toàn" onClose={() => setModal(null)}>
          <PaymentCheckout planId={pendingPlan} plan={PLANS[pendingPlan]} qrImage="/payment/momo-vietqr.jpg" onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal === "account" && (
        <Modal title="Tài khoản" onClose={() => setModal(null)}>
          <p>
            <strong>{user?.name}</strong>
            <br />
            {user?.email}
          </p>
          <button
            className="btn btn-outline full"
            onClick={() => {
              setModal(null);
              signOut();
            }}
          >
            Đăng xuất khỏi thiết bị này
          </button>
        </Modal>
      )}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <button className="brand-wrap" onClick={() => go("home")}>
              <span className="brand-mark"><AcademicCapIcon aria-hidden="true" /></span>
              <span className="brand-text">Study<span>Hub</span></span>
            </button>
            <p>Nền tảng học tập thông minh đồng hành cùng sinh viên Việt Nam chinh phục mọi kỳ thi đại học.</p>
          </div>
          <div className="footer-col">
            <h4>HỌC LIỆU</h4>
            <ul>
              <li><button onClick={() => go("library")}>Đề thi thử</button></li>
              <li><button onClick={() => go("library")}>Bài tập lớn</button></li>
              <li><button onClick={() => go("quiz")}>Quiz card</button></li>
              <li><button onClick={() => go("library")}>Bài giảng tóm tắt</button></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>TÍNH NĂNG</h4>
            <ul>
              <li><button onClick={() => go("tutor")}>AI Tutor</button></li>
              <li><button onClick={() => go("roadmap")}>Nhóm học tập</button></li>
              <li><button onClick={() => go("quiz")}>Flashcard</button></li>
              <li><button onClick={() => go("dashboard")}>Bảng xếp hạng</button></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>LIÊN HỆ</h4>
            <p>Email: support@studyhub.vn</p>
            <p>Hotline: 1900 1234</p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 StudyHub. Tất cả bản quyền được bảo lưu.</span>
          <div>
            <button>Điều khoản dịch vụ</button>
            <button>Chính sách bảo mật</button>
          </div>
        </div>
      </footer>
      {toast && <div className="toast">{toast}</div>}
      {activeStudyDeck && <StudyDeckSession deck={activeStudyDeck} onUpdateDeck={updateStudyDeck} onClose={() => setActiveStudyDeck(null)} />}
    </div>
    </>
  );
}
