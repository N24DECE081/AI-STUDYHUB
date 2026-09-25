import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  checkoutSubscription,
  cancelSubscription,
  createSubject,
  getCurrentUser,
  getDocumentContent,
  getDocuments,
  getProgress,
  getStudyTime,
  getStreak,
  getSubscription,
  getSubjects,
  login,
  logout as apiLogout,
  register,
  uploadDocument,
} from "./api";
import AITutorPage from "./components/ai-tutor/AITutorPage";
import AIAssistant from "./components/AIAssistant/AIAssistant";
import QuizWorkspace from "./components/QuizWorkspace";
import LearningRoadmapPage from "./components/LearningRoadmapPage";
import { buildSubjectHashMap, findSubject, quickSortSubjects } from "./utils/subjectAlgorithms";
import {
  ArrowRightIcon,
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

function formatStudyDuration(totalSeconds) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours} giờ ${remainingMinutes} phút` : `${minutes} phút`;
}

function formatStudyClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remainingSeconds}`;
}

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

function StreakCard({ user, streak, onLogin }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayActive = Boolean(user && streak.last_activity_date === today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("vi-VN", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
      number: date.getUTCDate(),
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
          const active = user && day.date === streak.last_activity_date;
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
        <span>Khôi phục: {user ? `${Math.min(streak.recovery_count, 3)}/3` : "—"}</span>
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
  const [view, setView] = useState("home");
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
  const [progress, setProgress] = useState([]);
  const [studyTime, setStudyTime] = useState(EMPTY_STUDY_TIME);
  const [streak, setStreak] = useState({
    current_streak: 0,
    recovery_count: 0,
    last_activity_date: null,
  });
  const [modal, setModal] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [toast, setToast] = useState("");
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentPreview, setDocumentPreview] = useState(null);
  const documentPreviewRequest = useRef(0);
  const [subscription, setSubscription] = useState({
    plan: "free",
    status: "active",
  });
  const [pendingPlan, setPendingPlan] = useState(null);
  const [billingCycle] = useState("month");
  const subjectOptions = useMemo(() => quickSortSubjects(subjects), [subjects]);
  const subjectIndex = useMemo(() => buildSubjectHashMap(subjectOptions), [subjectOptions]);
  const average = progress.length
    ? Math.round(
        progress.reduce((total, item) => total + item.percent, 0) /
          progress.length,
      )
    : 0;
  const filteredDocs = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    const matchedSubject = normalizedSearch ? findSubject(subjectIndex, normalizedSearch) : null;
    return documents.filter(
      (doc) =>
        (filter === "all" || doc.subject_code === filter) &&
        (!normalizedSearch ||
          `${doc.title} ${doc.description || ""}`.toLocaleLowerCase("vi").includes(normalizedSearch) ||
          (matchedSubject && doc.subject_code === matchedSubject.code)),
    );
  }, [documents, filter, search, subjectIndex]);
  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const saveUser = (next) => {
    setUser(next);
    next
      ? localStorage.setItem("studyhub-user", JSON.stringify(next))
      : localStorage.removeItem("studyhub-user");
  };
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
      setProgress(mapDocumentProgress(await getProgress()));
    } catch {
      setProgress([]);
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
    let active = true;
    const refreshUserData = async () => {
      // Clear every user-scoped view before loading the next account. This prevents
      // a previous account's documents from flashing while the new request runs.
      setDocuments([]);
      setSubjects([]);
      setProgress([]);
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
  }, [userKey]);
  useEffect(() => {
    if (!userKey) return undefined;
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
  }, [userKey]);
  useRevealOnScroll(`${view}-${documents.length}-${quizDecks.length}`);
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((result) => {
        if (active && result.user) saveUser(result.user);
        if (active && !result.user) saveUser(null);
      })
      .catch(() => {
        if (active) saveUser(null);
      });
    return () => {
      active = false;
    };
  }, []);
  const requireLogin = () => {
    if (user) return false;
    setAuthMode("login");
    setModal("auth");
    notify("Đăng nhập để dùng tính năng cá nhân.");
    return true;
  };
  const go = (next) => {
    if (next === "tutor" && requireLogin()) return;
    if (next === "dashboard" && user) void loadProgress();
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setStudyTime(EMPTY_STUDY_TIME);
    setStreak({ current_streak: 0, recovery_count: 0, last_activity_date: null });
    setSubscription({ plan: "free", status: "active" });
    setView("home");
    notify("Đã đăng xuất và xóa phiên làm việc trên trình duyệt.");
  };
  const submitAuth = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result =
        authMode === "login"
          ? await login(data.get("email"), data.get("password"))
          : await register(
              data.get("name"),
              data.get("email"),
              data.get("password"),
            );
      // Clear old user's data first before saving new user
      setDocuments([]);
      setProgress([]);
      setStudyTime(EMPTY_STUDY_TIME);
      setSubjects([]);
      setSubscription({ plan: "free", status: "active" });
      // Now save the new user (this triggers effect to load their data)
      saveUser(result.user || result);
      if (result.user?.streak) setStreak(result.user.streak);
      setModal(null);
      notify(
        authMode === "login"
          ? "Đăng nhập thành công."
          : "Tạo tài khoản thành công.",
      );
    } catch (error) {
      notify(`Không thể thực hiện: ${error.message}`);
    }
  };
  const submitUpload = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!file?.name) return notify("Hãy chọn tài liệu trước.");
    const title = String(data.get("title") || "").trim();
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!title) return notify("Tiêu đề tài liệu không được để trống.");
    if (file.size === 0) return notify("File không được rỗng.");
    if (file.size > 10 * 1024 * 1024) return notify("File tối đa 10MB.");
    if (![".pdf", ".txt", ".md", ".csv", ".doc", ".docx", ".ppt", ".pptx"].includes(extension)) {
      return notify("Định dạng file chưa được hỗ trợ.");
    }
    try {
      await uploadDocument({
        file,
        title,
        description: data.get("description"),
        subjectCode: data.get("subject"),
      });
      setModal(null);
      await loadDocumentsAndProgress();
      notify("Đã tải tài liệu vào kho học liệu.");
    } catch (error) {
      notify(`Upload thất bại: ${error.message}`);
    }
  };
  const submitSubject = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await createSubject({
        name: data.get("name"),
        code: data.get("code"),
        description: data.get("description"),
      });
      await loadSubjects();
      setModal("upload");
      notify("Đã thêm môn học mới.");
    } catch (error) {
      notify(`Không thể thêm môn học: ${error.message}`);
    }
  };
  const submitQuizDeck = (event) => {
    event.preventDefault();
    if (requireLogin()) return;
    const data = new FormData(event.currentTarget);
    const deck = {
      id: crypto.randomUUID(),
      name: String(data.get("deckName") || "").trim(),
      subject: String(data.get("deckSubject") || "").trim(),
      description: String(data.get("deckDescription") || "").trim(),
    };
    if (!deck.name) return notify("Tên bộ thẻ không được để trống.");
    const next = [...quizDecks, deck];
    setQuizDecks(next);
    localStorage.setItem(`studyhub-quiz-decks:${userKey}`, JSON.stringify(next));
    setModal(null);
    notify("Đã tạo bộ thẻ ghi nhớ mới.");
  };
  const requestPlan = (plan) => {
    if (requireLogin() || plan === subscription.plan) return;
    setPendingPlan(plan);
    setModal("plan");
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
  return (
    <div className="studyhub-app">
      <header className="topbar">
        <button className="brand-wrap" onClick={() => go("home")} aria-label="StudyHub - Trang chủ">
          <span className="brand-mark"><AcademicCapIcon aria-hidden="true" /></span>
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
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAuthMode("login");
                  setModal("auth");
                }}
              >
                Đăng nhập
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAuthMode("register");
                  setModal("auth");
                }}
              >
                Bắt đầu
              </button>
            </>
          )}
        </div>
      </header>
      <main className="main-shell">
        {view === "home" && (
          <>
            <section className="hero-section">
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
                  Nền tảng AI giúp sinh viên tổ chức tài liệu, tạo Quiz thông minh, xây lộ trình cá nhân và trao đổi trực tiếp với Nova AI Tutor.

                </p>
                <div className="hero-actions">
                  <button
                    className="btn btn-primary large"
                    onClick={() => go("tutor")}
                  >
                    <SparklesIcon aria-hidden="true" className="btn-icon" />
                    Hỏi Nova AI Tutor
                  </button>
                  <button
                    className="btn btn-outline large"
                    onClick={() => go("library")}
                  >
                    <BookOpenIcon aria-hidden="true" className="btn-icon" />
                    Mở kho học liệu
                  </button>
                </div>
                <div className="hero-badges">
                  <span className="hero-badge" onClick={() => go("quiz")}><RectangleStackIcon aria-hidden="true" /> Quiz Card AI</span>
                  <span className="hero-badge" onClick={() => go("roadmap")}><SparklesIcon aria-hidden="true" /> Lộ trình cá nhân</span>
                  <span className="hero-badge" onClick={() => go("dashboard")}><BoltIcon aria-hidden="true" /> Theo dõi tiến độ</span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="progress-card">
                  <span className="eyebrow">NHỊP HỌC TUẦN NÀY</span>
                  <div className="big-number">
                    {progress.length ? average : "—"}
                    {progress.length > 0 && <span>%</span>}
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: progress.length ? `${average}%` : "0%" }} />
                  </div>
                  <div className="mini-grid">
                    <div className="mini-item">
                      <strong>{documents.length}</strong>
                      <small>tài liệu</small>
                    </div>
                    <div className="mini-item">
                      <strong>{progress.length}</strong>
                      <small>mục đang học</small>
                    </div>
                    <div className="mini-item">
                      <strong>{quizDecks.length}</strong>
                      <small>bộ Quiz</small>
                    </div>
                    <div className="mini-item">
                      <strong>{user ? streak.current_streak : 0}</strong>
                      <small>ngày streak</small>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <StreakCard
              user={user}
              streak={streak}
              onLogin={() => {
                setAuthMode("login");
                setModal("auth");
              }}
            />
            <section className="content-section">
              <span className="eyebrow">WORKFLOW CÁ NHÂN</span>
              <h2>Một nhịp học gọn gàng.</h2>
              <div className="workflow-grid reveal-stagger">
                {[
                  [
                    "01",
                    "Lưu học liệu",
                    "Đưa tài liệu cần học vào một kho riêng.",
                    "library",
                  ],
                  [
                    "02",
                    "Ôn tập Quiz Card",
                    "Tạo bộ thẻ ghi nhớ và Quiz từ tài liệu với AI.",
                    "quiz",
                  ],
                  [
                    "03",
                    "Theo dõi nhịp học",
                    "Xem lộ trình, cập nhật tiến độ từng chủ đề.",
                    "roadmap",
                  ],
                  [
                    "04",
                    "Hỏi Nova AI",
                    "Nhận giải thích, gợi ý, tóm tắt từ Nova.",
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
                onClick={() => !requireLogin() && setModal("upload")}
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
              <span>{filteredDocs.length} tài liệu phù hợp</span>
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
                  <p>{doc.description || "Tài liệu chưa có mô tả."}</p>
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
            <QuizWorkspace documents={documents} user={user} />
            {quizDecks.length ? (
              <div className="quiz-deck-grid reveal-stagger">
                {quizDecks.map((deck) => (
                  <article className="quiz-deck-card" key={deck.id}>
                    <span className="quiz-deck-icon"><RectangleStackIcon aria-hidden="true" /></span>
                    <h2>{deck.name}</h2>
                    <p>{deck.subject || "Chưa phân loại"}</p>
                    {deck.description && <small>{deck.description}</small>}
                    <button className="btn btn-primary full" type="button">Bắt đầu ôn tập</button>
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
          <LearningRoadmapPage documents={documents} subjects={subjects} />
        )}
        {view === "dashboard" && (
          <section className="page">
            <div className="page-header">
              <div>
                <span className="eyebrow">TIẾN ĐỘ CÁ NHÂN</span>
                <h2>{user ? `Chào ${user.name}` : "Tiến độ học tập"}</h2>
                <p className="muted">
                  Không còn không gian học nhóm — mọi dữ liệu ở đây là của riêng
                  bạn.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => go("tutor")}>
                Mở Nova AI Tutor
              </button>
            </div>
            <div className="stats-grid">
              <div className="stat-box red">
                <span>Tiến độ</span>
                <strong>{average}%</strong>
                <small>trung bình {progress.length} tài liệu</small>
              </div>
              <div className="stat-box blue">
                <span>Thời gian học</span>
                <strong className="study-time-value">{formatStudyDuration(studyTime.total_seconds)}</strong>
                <small>Phiên hiện tại: {formatStudyClock(studyTime.current_session_seconds)}</small>
              </div>
              <div className="stat-box dark">
                <span>Tài liệu</span>
                <strong>{documents.length}</strong>
                <small>trong kho cá nhân</small>
              </div>
            </div>
            <div className="dashboard-quick-actions">
              <button className="btn btn-outline" onClick={() => go("quiz")}><RectangleStackIcon aria-hidden="true" className="btn-icon" /> Quiz Card</button>
              <button className="btn btn-outline" onClick={() => go("roadmap")}><SparklesIcon aria-hidden="true" className="btn-icon" /> Lộ trình học</button>
              <button className="btn btn-outline" onClick={() => go("pricing")}><BoltIcon aria-hidden="true" className="btn-icon" /> Gói học</button>
            </div>
            <section className="panel-card progress-panel">
              <div className="panel-head">
                <h3>Tiến độ của bạn</h3>
                <span className="panel-chip">{progress.length} mục</span>
              </div>
              <div className="progress-list reveal-stagger">
                {!progress.length && <p className="empty-state">Chưa có dữ liệu tiến độ.</p>}
                {progress.map((item) => (
                  <div className="progress-row" key={item.documentId}>
                    <div className="progress-info">
                      <strong>{item.title}</strong>
                      {item.subject && <small>{item.subject}</small>}
                    </div>
                    <div className="progress-control">
                      <div
                        className="automatic-progress-bar"
                        role="progressbar"
                        aria-label={`Tiến độ tự động của tài liệu ${item.title}`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={item.percent}
                      >
                        <span style={{ width: `${item.percent}%` }} />
                      </div>
                      <span>{item.percent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
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
      {modal === "auth" && (
        <Modal
          title={authMode === "login" ? "Đăng nhập StudyHub" : "Tạo tài khoản"}
          onClose={() => setModal(null)}
        >
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === "register" && (
              <label>
                Họ tên
                <input name="name" required />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Mật khẩu
              <input name="password" type="password" minLength="6" required />
            </label>
            <button className="btn btn-primary full">
              {authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </button>
          </form>
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
                required
                maxLength="200"
                placeholder="Ví dụ: Chương 1 - Đạo hàm và ứng dụng"
              />
              <label htmlFor="upload-description">
                Mô tả <span className="optional-mark">(Tùy chọn)</span>
              </label>
              <textarea
                id="upload-description"
                name="description"
                rows="3"
                placeholder="Ghi chú ngắn gọn về nội dung tài liệu…"
              />
            </fieldset>
            <fieldset className="upload-card">
              <legend>Tệp & môn học</legend>
              <label htmlFor="upload-file">
                Tệp tài liệu <span className="required-mark">*</span>
              </label>
              <input
                id="upload-file"
                name="file"
                type="file"
                accept=".pdf,.txt,.md,.csv,.doc,.docx,.ppt,.pptx"
                required
              />
              <label htmlFor="upload-subject">
                Môn học <span className="required-mark">*</span>
              </label>
              <select id="upload-subject" name="subject">
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
              <button className="btn btn-primary">Tải lên & Xử lý</button>
            </footer>
          </form>
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
          <form className="auth-form quiz-create-form" onSubmit={submitQuizDeck}>
            <label>
              Tên bộ thẻ <span aria-hidden="true">*</span>
              <input name="deckName" required placeholder="Ví dụ: Từ vựng IELTS Chuyên đề Môi trường" />
            </label>
            <label>
              Môn học / Chuyên đề
              <input name="deckSubject" defaultValue="Công nghệ thông tin" />
            </label>
            <label>
              Mô tả ngắn
              <textarea name="deckDescription" rows="3" placeholder="Mô tả mục tiêu của bộ thẻ..." />
            </label>
            <div className="quiz-modal-actions">
              <button type="button" className="text-link" onClick={() => setModal(null)}>Hủy</button>
              <button className="btn quiz-create-button" type="submit"><PlusIcon aria-hidden="true" /> Tạo bộ thẻ</button>
            </div>
          </form>
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
      {toast && <div className="toast">{toast}</div>}
      {user && <AIAssistant />}
    </div>
  );
}
