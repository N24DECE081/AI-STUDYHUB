import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  LockKeyhole,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import {
  generateTutorRoadmap,
  getDocumentContent,
  getTutorRoadmap,
  getTutorSubmissions,
  submitTutorExercise,
} from "../api";
import "./learning-roadmap.css";
import RoadmapLogo from "./RoadmapLogo";
import { CurrentRoadmapCard, RoadmapBanner } from "./RoadmapOverview";
import { planPermissions } from '../utils/planPermissions';

const GOALS = [
  "Nắm kiến thức cơ bản",
  "Chuẩn bị cho kỳ thi",
  "Làm bài tập",
  "Làm project",
  "Học để đi làm",
];

const STAGES = [
  "Đang đọc tài liệu",
  "Phân tích nội dung",
  "Xác định các chủ đề quan trọng",
  "Sắp xếp thứ tự học",
  "Phân bổ thời gian",
];

const formatHours = (value) => Number(value.toFixed(1)).toLocaleString("vi-VN");
const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));
const subjectKey = (item) => String(item.subject_id ?? item.subject_code ?? item.subject_name ?? "ungrouped");
const fileType = (document) =>
  String(document.file_type || document.original_filename?.split(".").pop() || "FILE")
    .replace(/^\./, "")
    .toUpperCase();
const documentName = (document) => String(document?.title || document?.original_filename || "")
  .replace(/\.[^./\\]+$/, "")
  .trim();

const readSaved = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const saveLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore localStorage exceptions */
  }
};

const sourceHeading = (line) => {
  const text = line.trim();
  if (!text || text.length > 120) return "";
  const markdown = text.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return markdown[1].trim();
  const labeled = text.match(/^(?:chapter|chương|bài|phần|unit|lesson|section|module)\s+([\w.-]+)\s*[:.)-]?\s+(.+)$/i);
  if (labeled) return (labeled[1] + " " + labeled[2]).trim();
  const numbered = text.match(/^\d+(?:\.\d+){0,3}[.)]?\s+(.{4,90})$/);
  if (numbered && !/[.!?]$/.test(numbered[1])) return numbered[1].trim();
  if (/^[A-ZÀ-Ỹ0-9][A-ZÀ-Ỹ0-9\s&:()/-]{4,}$/.test(text) && /[A-ZÀ-Ỹ]/.test(text)) return text;
  return "";
};

const extractSourceSections = (content, document) => {
  const lines = String(content || "").split(/\r?\n/);
  const headings = [];
  lines.forEach((line, index) => {
    const title = sourceHeading(line);
    if (title && !headings.some((item) => item.title.toLocaleLowerCase("vi") === title.toLocaleLowerCase("vi"))) {
      headings.push({ title, line: index });
    }
  });
  if (!headings.length) {
    const excerpt = lines.map((line) => line.trim()).find(Boolean) || "";
    return excerpt
      ? [{ id: String(document.id) + "-source", title: document.title, excerpt: excerpt.slice(0, 700), sourceOnly: true }]
      : [];
  }
  return headings.slice(0, 32).map((heading, index) => {
    const end = headings[index + 1]?.line ?? lines.length;
    const excerpt = lines
      .slice(heading.line + 1, end)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    return {
      id: String(document.id) + "-" + index,
      title: heading.title,
      excerpt: excerpt.slice(0, 700),
      sourceLine: heading.line + 1,
    };
  });
};

function ProgressBar({ value, label, showPercent = false }) {
  const rounded = Math.round(clamp(value));
  return (
    <div className="lr-progress-wrap">
      <div
        className="lr-progress-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
      >
        <div className="lr-progress-fill" style={{ width: `${rounded}%` }} />
      </div>
      {showPercent && <span className="lr-progress-percent">{rounded}%</span>}
    </div>
  );
}

function SourceRoadmap({ document, userScope, onBack, onOpenDocument, onTakeQuiz }) {
  const storageKey = "studyhub-source-roadmap:" + userScope;
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(0);
  const [done, setDone] = useState(() => readSaved(storageKey));

  useEffect(() => {
    let active = true;
    getDocumentContent(document.id)
      .then((data) => {
        if (active) setContent(data.content || "");
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [document.id, retry]);

  const sections = useMemo(() => extractSourceSections(content, document), [content, document]);
  const keyFor = (section) => document.id + ":" + section.id;
  const current = sections[selected];
  const completion = sections.length
    ? (sections.filter((section) => done[keyFor(section)]).length / sections.length) * 100
    : 0;

  const toggleDone = () => {
    if (!current) return;
    const next = { ...done, [keyFor(current)]: !done[keyFor(current)] };
    setDone(next);
    saveLocal(storageKey, next);
  };

  return (
    <div className="lr-source-roadmap">
      <button className="lr-back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Quay lại lộ trình
      </button>
      <header className="lr-view-header">
        <div>
          <span className="lr-eyebrow">TÀI LIỆU HỌC TẬP</span>
          <h1 className="lr-page-title">{document.title}</h1>
          <p className="lr-page-desc">{document.subject_name}</p>
        </div>
        {onOpenDocument && (
          <button className="lr-btn lr-btn-secondary" onClick={() => onOpenDocument(document)}>
            <BookOpen size={16} /> Mở tài liệu
          </button>
        )}
      </header>
      {busy ? (
        <div className="lr-loading-inline" role="status">
          <BookOpen size={18} aria-hidden="true" /> Đang đọc tài liệu...
        </div>
      ) : error ? (
        <div className="lr-error-banner" role="alert">
          {error}
          <button
            className="lr-btn lr-btn-secondary"
            onClick={() => {
              setBusy(true);
              setError("");
              setRetry((v) => v + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      ) : !sections.length ? (
        <div className="lr-empty-card">
          <BookOpen size={36} />
          <h2>Tài liệu chưa có nội dung văn bản</h2>
          <p>Mở tài liệu gốc để tiếp tục học.</p>
        </div>
      ) : (
        <>
          <div className="lr-progress-header">
            <strong>Tiến độ học tập</strong>
            <span>{Math.round(completion)}%</span>
          </div>
          <ProgressBar value={completion} label="Tiến độ tài liệu" />
          <div className="lr-study-layout">
            <div className="lr-module-lessons lr-lesson-list">
              {sections.map((section, index) => (
                <button
                  className={"lr-lesson-btn" + (selected === index ? " is-selected" : "")}
                  key={section.id}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  <span className={"lr-lesson-status-badge" + (done[keyFor(section)] ? " is-done" : "")}>
                    {done[keyFor(section)] ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="lr-lesson-btn-text"><strong>{section.title}</strong></span>
                  <ArrowRight size={15} className="lr-caret" aria-hidden="true" />
                </button>
              ))}
            </div>
            <aside className="lr-detail-inner-card">
              <span className="lr-eyebrow">NỘI DUNG TÀI LIỆU</span>
              <h2 className="lr-lesson-detail-title">{current?.title}</h2>
              <p className="lr-source-excerpt">
                {current?.excerpt || "Mở tài liệu gốc để xem nội dung đầy đủ."}
              </p>
              <div className="lr-exercise-btn-row lr-source-actions">
                <button
                  className="lr-btn lr-btn-primary"
                  disabled={selected > 0 && !done[keyFor(sections[selected - 1])]}
                  onClick={toggleDone}
                >
                  <Check size={16} />
                  {done[keyFor(current)] ? "Đánh dấu chưa hoàn thành" : "Hoàn tất chủ đề"}
                </button>
                {onTakeQuiz && (
                  <button className="lr-btn lr-btn-secondary" onClick={() => onTakeQuiz(document)}>
                    Tạo Quiz từ tài liệu <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

export default function LearningRoadmapPage({
  documents = [],
  subjects = [],
  onOpenDocument,
  onTakeQuiz,
  onUpload,
  onAskNova,
  user,
  subscription,
  streak = {},
}) {
  const permissions = planPermissions(subscription);
  const roadmapLock = { disabled: !permissions.personalizedRoadmap, title: !permissions.personalizedRoadmap ? 'Nâng cấp để sử dụng' : undefined };
  const uploadLock = { disabled: !permissions.canUpload, title: !permissions.canUpload ? 'Nâng cấp để sử dụng' : undefined };
  const userScope = String(user?.id || user?.email || "guest");
  const storageKey = "studyhub-roadmap-plan:" + userScope;

  const [currentStep, setCurrentStep] = useState("overview"); // overview | step1_select_docs | step2_set_goals | step3_loading | roadmap_view
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [selectedGoals, setSelectedGoals] = useState([GOALS[0], GOALS[3]]);
  const [weeks, setWeeks] = useState("8");
  const [dailyHours, setDailyHours] = useState("2");
  const [daysPerWeek, setDaysPerWeek] = useState("5");
  const [search, setSearch] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [roadmap, setRoadmap] = useState(() => readSaved(storageKey).demoRoadmap || null);
  const [plan, setPlan] = useState(() => readSaved(storageKey));
  const [submissions, setSubmissions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [sourceDocument, setSourceDocument] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [activeExerciseId, setActiveExerciseId] = useState(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState(null);
  const [demoMode, setDemoMode] = useState(true);
  const [uploadedDocument, setUploadedDocument] = useState(null);

  const requestVersion = useRef(0);
  const finishTimer = useRef(null);

  // Group and extract subjects from list or docs
  const subjectOptions = useMemo(() => {
    const map = new Map();
    subjects.forEach((subj) => {
      map.set(String(subj.id), {
        key: String(subj.id),
        name: subj.name,
        code: subj.code,
      });
    });
    documents.forEach((doc) => {
      const key = subjectKey(doc);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: doc.subject_name || doc.subject_code || "Lập trình C++",
          code: doc.subject_code,
        });
      }
    });
    if (!map.size) {
      map.set("cpp", { key: "cpp", name: "Lập trình C++", code: "CPP" });
    }
    return [...map.values()];
  }, [subjects, documents]);

  // Compute active subject without calling setState synchronously inside an effect
  const activeSubjectKey = selectedSubject || subjectOptions[0]?.key || "";
  const subject = subjectOptions.find((item) => item.key === activeSubjectKey) || subjectOptions[0];

  const subjectDocuments = useMemo(() => {
    const docs = documents.filter((doc) => subjectKey(doc) === activeSubjectKey);
    return docs;
  }, [documents, activeSubjectKey]);

  const selectedDocuments = useMemo(() => {
    return subjectDocuments.filter((doc) => selectedDocIds.includes(String(doc.id)));
  }, [subjectDocuments, selectedDocIds]);

  const visibleDocuments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return subjectDocuments.filter((doc) => {
      const combined = `${doc.title || ""} ${doc.original_filename || ""}`.toLocaleLowerCase("vi");
      return !q || combined.includes(q);
    });
  }, [subjectDocuments, search]);

  // Time calculations
  const totalHours = useMemo(() => {
    const w = Number(weeks) || 0;
    const h = Number(dailyHours) || 0;
    const d = Number(daysPerWeek) || 0;
    return w * h * d;
  }, [weeks, dailyHours, daysPerWeek]);

  const validTime =
    Number(weeks) >= 1 &&
    Number(weeks) <= 104 && Number.isInteger(Number(weeks)) &&
    Number(dailyHours) >= 0.5 &&
    Number(dailyHours) <= 12 &&
    Number(daysPerWeek) >= 1 &&
    Number(daysPerWeek) <= 7 && Number.isInteger(Number(daysPerWeek));

  // Loading stages mapping from progress 0% - 100%
  const currentLoadingStage = useMemo(() => {
    if (loadingProgress < 20) return 0;
    if (loadingProgress < 45) return 1;
    if (loadingProgress < 70) return 2;
    if (loadingProgress < 90) return 3;
    return 4;
  }, [loadingProgress]);

  const lessonRows = useMemo(
    () =>
      (roadmap?.modules || []).flatMap((module) =>
        (module.lessons || []).map((lesson) => ({
          module,
          lesson: { ...lesson, source: lesson.source || plan.lessonSources?.[lesson.key] },
          exercises: (roadmap.exercises || []).filter(
            (exercise) => String(exercise.lesson_key) === String(lesson.key)
          ),
        }))
      ),
    [roadmap, plan.lessonSources]
  );

  const exerciseGrades = useMemo(() => {
    const ids = new Set((roadmap?.exercises || []).map((exercise) => String(exercise.id)));
    const best = new Map();
    submissions.forEach((item) => {
      const id = String(item.exercise_id);
      if (ids.has(id)) {
        best.set(id, Math.max(best.get(id) || 0, clamp(item.percentage)));
      }
    });
    return best;
  }, [roadmap, submissions]);

  const lessonMastery = (row) => {
    if (String(plan.roadmapId) === String(roadmap?.roadmap_id)) {
      if (plan.done?.[row.lesson.key]) return 100;
      if (plan.quizGrades?.[row.lesson.key] !== undefined) return clamp(plan.quizGrades[row.lesson.key]);
    }
    const scores = row.exercises
      .map((exercise) => exerciseGrades.get(String(exercise.id)))
      .filter((val) => val !== undefined);
    return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  };

  const locked = (index) => !permissions.personalizedRoadmap || lessonRows.slice(0, index).some((row) => lessonMastery(row) < 60);
  const completed = lessonRows.filter((row) => lessonMastery(row) >= 60).length;

  const currentPlan = roadmap && String(plan.roadmapId) === String(roadmap.roadmap_id) ? plan : null;
  const roadmapHours = roadmap ? currentPlan?.totalHours || 80 : 0;
  const totalWeight = lessonRows.reduce((sum, row) => sum + (Number(row.lesson.estimated_minutes) || 1), 0);
  const topicHours = (row) => roadmapHours * (Number(row.lesson.estimated_minutes) || 1) / (totalWeight || 1);
  const completedHours = Math.round(lessonRows.reduce((sum, row) => sum + topicHours(row) * (lessonMastery(row) >= 60 ? 1 : lessonMastery(row) / 100), 0) * 10) / 10;
  const overallProgress = roadmap ? Math.round(completedHours / roadmapHours * 100) : 0;
  const remainingHours = Math.max(0, roadmapHours - completedHours);

  const roadmapDocuments = currentPlan
    ? documents.filter((document) => (currentPlan.documentIds || []).includes(String(document.id)))
    : selectedDocuments.length
    ? selectedDocuments
    : documents.slice(0, 4);
  const primaryDocument = roadmapDocuments[0];
  const roadmapTitle = currentPlan?.title || documentName(primaryDocument) || roadmap?.subject || subject?.name || "Lộ trình học";
  const roadmapDescription = roadmap?.summary || roadmap?.goal || "";

  const selectedLesson =
    lessonRows.find((row) => row.lesson.key === selectedLessonId) || lessonRows[0];
  const selectedLessonIndex = selectedLesson ? lessonRows.indexOf(selectedLesson) : -1;
  const activeExercise = selectedLesson?.exercises.find(
    (exercise) => String(exercise.id) === String(activeExerciseId)
  );
  const nextLesson = lessonRows.find((row) => lessonMastery(row) < 60) || lessonRows[0];

  // Fetch saved roadmap & submissions
  useEffect(() => {
    let active = true;
    Promise.allSettled([getTutorRoadmap(), getTutorSubmissions()]).then(([pathResult, subResult]) => {
      if (!active) return;
      if (!readSaved(storageKey).demoRoadmap && pathResult.status === "fulfilled" && pathResult.value?.roadmap_id) {
        setRoadmap(pathResult.value);
      }
      if (subResult.status === "fulfilled") {
        setSubmissions(subResult.value?.items || []);
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [loadAttempt, storageKey]);

  useEffect(() => () => {
    requestVersion.current += 1;
    window.clearTimeout(finishTimer.current);
  }, []);

  // Smooth loading progression from 0% towards 95%
  useEffect(() => {
    if (currentStep !== "step3_loading") return undefined;
    const interval = window.setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) return prev;
        const step = demoMode ? 4 : Math.max(0.5, (95 - prev) * 0.08);
        return Math.min(95, prev + step);
      });
    }, 120);
    return () => window.clearInterval(interval);
  }, [currentStep, demoMode]);

  const beginWizard = () => {
    if (!permissions.personalizedRoadmap) return;
    const initialSubject = subjectOptions[0]?.key || "";
    setSelectedSubject(initialSubject);
    setSelectedDocIds([]);
    setUploadedDocument(null);
    setError("");
    setSearch("");
    setSourceDocument(null);
    setCurrentStep("step1_select_docs");
  };

  const openLesson = (row) => {
    if (!permissions.personalizedRoadmap) return;
    setSelectedLessonId(row?.lesson.key || null);
    setActiveExerciseId(null);
    setGrade(null);
    setError("");
    setCurrentStep("roadmap_view");
  };

  const updatePlan = (patch) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    saveLocal(storageKey, next);
  };

  const markComplete = () => {
    if (!selectedLesson || locked(selectedLessonIndex)) return;
    const following = lessonRows[selectedLessonIndex + 1];
    updatePlan({
      done: { ...plan.done, [selectedLesson.lesson.key]: true },
      started: { ...plan.started, ...(following ? { [following.lesson.key]: true } : {}) },
    });
  };

  const handleGoalToggle = (goal) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((item) => item !== goal) : [...prev, goal]
    );
  };

  const handleDocumentToggle = (docId) => {
    const idStr = String(docId);
    setSelectedDocIds((prev) =>
      prev.includes(idStr) ? prev.filter((id) => id !== idStr) : [...prev, idStr]
    );
  };

  // Generate roadmap with Nova AI loading from 0% to 100%
  const generateRoadmap = async (event) => {
    if (event) event.preventDefault();
    if (!permissions.personalizedRoadmap) return;
    if (busy) return;
    if (!selectedDocuments.length) {
      setError("Vui lòng chọn ít nhất 1 tài liệu để tạo lộ trình.");
      return;
    }
    if (!selectedGoals.length) {
      setError("Vui lòng chọn ít nhất 1 mục tiêu học tập.");
      return;
    }
    if (!validTime) {
      setError("Thời gian học không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    const version = ++requestVersion.current;
    setBusy("generate");
    setError("");
    setLoadingProgress(0);
    setCurrentStep("step3_loading");
    window.scrollTo({ top: 0, behavior: "instant" });

    const effectiveDocs = [...selectedDocuments].sort((a, b) => Number(a.id) - Number(b.id));
    const hours = Number(dailyHours) * Number(daysPerWeek);

    try {
      // 1. Read document sections
      const sources = await Promise.all(
        effectiveDocs.map(async (doc) => {
          try {
            const res = await getDocumentContent(doc.id);
            const sections = extractSourceSections(res.content, doc);
            return sections.map((section) => ({ ...section, documentId: String(doc.id), documentTitle: doc.title }));
          } catch {
            return [{ title: doc.title, documentId: String(doc.id), documentTitle: doc.title, excerpt: "Mở tài liệu gốc để xem nội dung đầy đủ." }];
          }
        })
      );

      if (version !== requestVersion.current) return;

      const previousIds = new Set((roadmap?.exercises || []).map((ex) => String(ex.id)));
      const relevant = submissions.filter(
        (item) => previousIds.has(String(item.exercise_id)) && roadmap?.subject === (subject?.name || "Lập trình C++")
      );

      // Call backend API
      let data = demoMode ? null : await generateTutorRoadmap({
        subject: subject?.name || "Lập trình C++",
        goal: selectedGoals.join("; "),
        current_level: "beginner",
        target_level: permissions.advancedRoadmap ? 'advanced' : 'intermediate',
        pace: hours <= 4 ? "slow" : hours <= 8 ? "steady" : "fast",
        study_time: hours * 60,
        strengths: [...new Set(relevant.filter((i) => Number(i.percentage) >= 80).map((i) => i.topic).filter(Boolean))].slice(0, 5),
        weaknesses: [...new Set(relevant.filter((i) => Number(i.percentage) < 60).map((i) => i.topic).filter(Boolean))].slice(0, 5),
        topics: [...new Set(sources.flat().map((section) => section.title))],
      });

      if (version !== requestVersion.current) return;

      // ponytail: demo uses document headings, connect Nova for semantic topic extraction.
      const sourceSections = sources.flat();
      if (demoMode) {
        if (!sourceSections.length) throw new Error("Tài liệu chưa có nội dung. Hãy chọn tài liệu khác.");
        await new Promise((resolve) => { finishTimer.current = window.setTimeout(resolve, 3200); });
        if (version !== requestVersion.current) return;
        data = {
          roadmap_id: "demo-" + Date.now(), demo: true,
          subject: subject?.name, goal: selectedGoals.join(" · "),
          summary: "Học từng chủ đề, thực hành và kết nối kiến thức từ tài liệu của bạn.",
          modules: [{ key: "documents", title: "Lộ trình từ tài liệu", lessons: sourceSections.map((section, index) => ({
            key: "topic-" + index, title: section.title, estimated_minutes: 60,
            objectives: ["Hiểu và trình bày lại kiến thức về " + section.title, "Vận dụng nội dung tài liệu vào một bài tập hoặc ví dụ."],
            source: section,
          })) }],
          exercises: sourceSections.map((section, index) => ({
            id: "demo-quiz-" + index, lesson_key: "topic-" + index, exercise_type: "multiple_choice",
            prompt: "Nội dung nào được đề cập trong chủ đề “" + section.title + "”?",
            options: [section.excerpt?.slice(0, 180) || section.title, "Một chủ đề khác ngoài tài liệu đã chọn", "Tài liệu không đề cập đến chủ đề này"],
          })),
        };
      }
      if (!data?.roadmap_id || !data.modules?.some((module) => module.lessons?.length)) {
        throw new Error("Nova chưa trả về chủ đề học. Vui lòng thử lại hoặc bật chế độ demo.");
      }
      data.modules.forEach((module) => module.lessons?.forEach((lesson) => {
        lesson.source = lesson.source || sourceSections.find((section) => section.title.toLocaleLowerCase("vi") === lesson.title.toLocaleLowerCase("vi"));
      }));

      const nextPlan = {
        roadmapId: data.roadmap_id,
        documentIds: effectiveDocs.map((doc) => String(doc.id)),
        weeks: Number(weeks),
        dailyHours: Number(dailyHours),
        daysPerWeek: Number(daysPerWeek),
        totalHours,
        demoRoadmap: data.demo ? data : null,
        done: {}, started: {}, quizGrades: {},
        lessonSources: Object.fromEntries(data.modules.flatMap((module) => module.lessons.map((lesson) => [lesson.key, lesson.source]))),
      };

      setRoadmap(data);
      setPlan(nextPlan);
      saveLocal(storageKey, nextPlan);
      setLoaded(true);
      setSelectedLessonId(data.modules[0]?.lessons?.[0]?.key || null);
      setActiveExerciseId(null);
      setGrade(null);

      // Finish at 100% smoothly
      setLoadingProgress(100);
      finishTimer.current = window.setTimeout(() => {
        setCurrentStep("roadmap_view");
        setBusy("");
      }, 700);
    } catch (failure) {
      if (version !== requestVersion.current) return;
      setError(failure.message || "Không thể tạo lộ trình lúc này. Vui lòng thử lại.");
      setCurrentStep("step2_set_goals");
      setBusy("");
    }
  };

  const startExercise = (exercise) => {
    setActiveExerciseId(exercise?.id || null);
    setAnswer("");
    setGrade(null);
    setError("");
  };

  const sendExercise = async (event) => {
    event.preventDefault();
    if (!activeExercise || !answer.trim() || busy || locked(selectedLessonIndex)) return;
    const version = ++requestVersion.current;
    setBusy("grade");
    setError("");
    try {
      if (roadmap.demo) {
        const percentage = answer === activeExercise.options[0] ? 100 : 0;
        setGrade({ percentage, grade: percentage ? "Hoàn thành" : "Cần ôn lại", feedback: percentage ? "Bạn đã nhận diện đúng nội dung tài liệu." : "Hãy đọc lại nội dung tài liệu rồi thử một lần nữa." });
        const following = lessonRows[selectedLessonIndex + 1];
        updatePlan({
          quizGrades: { ...plan.quizGrades, [selectedLesson.lesson.key]: Math.max(plan.quizGrades?.[selectedLesson.lesson.key] || 0, percentage) },
          started: { ...plan.started, ...(percentage >= 60 && following ? { [following.lesson.key]: true } : {}) },
        });
        return;
      }
      const result = await submitTutorExercise(activeExercise.id, {
        answer: answer.trim(),
        answerType: activeExercise.exercise_type === "multiple_choice" ? "choice" : activeExercise.exercise_type,
      });
      if (version !== requestVersion.current) return;
      setGrade(result);
      const [pathData, submissionData] = await Promise.all([getTutorRoadmap(), getTutorSubmissions()]);
      if (version !== requestVersion.current) return;
      if (pathData?.roadmap_id) setRoadmap(pathData);
      setSubmissions(submissionData?.items || []);
    } catch (failure) {
      if (version === requestVersion.current) {
        setError(failure.message || "Không chấm được bài làm.");
      }
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  if (sourceDocument) {
    return (
      <div className="learning-roadmap-page">
        <SourceRoadmap
          key={sourceDocument.id}
          document={sourceDocument}
          userScope={userScope}
          onBack={() => setSourceDocument(null)}
          onOpenDocument={onOpenDocument}
          onTakeQuiz={onTakeQuiz}
        />
      </div>
    );
  }

  return (
    <div className="learning-roadmap-page" aria-busy={currentStep === "step3_loading"}>
      {/* ==================== STEP 3: NOVA AI LOADING (0% -> 100%) ==================== */}
      {currentStep === "step3_loading" ? (
        <div className="lr-nova-loading-view" role="status">
          <RoadmapLogo size="lg" interactive className="lr-loading-logo" />

          <span className="lr-loading-badge">NOVA ĐANG LÀM VIỆC</span>
          <h1 className="lr-loading-title" id="learning-roadmap-title">
            Nova đang xây dựng lộ trình cho bạn...
          </h1>
          <p className="lr-loading-desc">
            Chỉ mất một chút thời gian. Nova đang đọc và kết nối kiến thức từ{" "}
            {selectedDocuments.length} tài liệu của bạn.
          </p>

          {/* Checklist Card */}
          <div className="lr-loading-card">
            <ul className="lr-checklist">
              {STAGES.map((stageName, index) => {
                const isDone = loadingProgress >= 100 || index < currentLoadingStage;
                const isActive = !isDone && index === currentLoadingStage;
                return (
                  <li
                    key={stageName}
                    className={`lr-check-item ${isDone ? "is-done" : isActive ? "is-active" : "is-pending"}`}
                  >
                    <div className="lr-check-left">
                      <span className="lr-check-circle">
                        {isDone ? (
                          <Check size={14} strokeWidth={3} />
                        ) : isActive ? (
                          <span className="lr-pulse-dot" />
                        ) : null}
                      </span>
                      <span className="lr-check-label">{stageName}</span>
                    </div>
                    <span className="lr-check-status">
                      {isDone ? "Hoàn tất" : isActive ? "Đang xử lý..." : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Smooth Progress Bar */}
          <div className="lr-loading-progress-box">
            <div
              className="lr-loading-progress-track"
              role="progressbar"
              aria-label="Tiến độ tạo lộ trình"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(loadingProgress)}
            >
              <div
                className="lr-loading-progress-fill"
                style={{ width: `${Math.min(100, Math.floor(loadingProgress))}%` }}
              />
            </div>
            <div className="lr-loading-progress-label">
              <span>Tiến trình hoàn thiện</span>
              <strong>{Math.min(100, Math.floor(loadingProgress))}%</strong>
            </div>
          </div>

          {/* Security Notice */}
          <p className="lr-security-note">
            <ShieldCheck size={16} /> {demoMode ? "Bản demo · Mô phỏng quá trình phân tích của Nova." : "Nova đang kết nối nội dung từ tài liệu đã chọn."}
          </p>
        </div>
      ) : (
        <>
          {/* Back Button for Steps */}
          {currentStep !== "overview" && (
            <button
              className="lr-back-link"
              disabled={Boolean(busy)}
              onClick={() => {
                setError("");
                if (currentStep === "step2_set_goals") {
                  setCurrentStep("step1_select_docs");
                } else {
                  setCurrentStep("overview");
                }
              }}
            >
              <ArrowLeft size={16} />
              {currentStep === "step2_set_goals"
                ? "Quay lại chọn tài liệu"
                : "Quay lại lộ trình"}
            </button>
          )}

          {/* Header Hero Banner (Overview & Roadmap View) or Stepper Header (Wizard Steps) */}
          {currentStep.startsWith("step") ? (
            <header className="lr-view-header">
              <div className="lr-wizard-title-block">
                <div className="lr-nova-avatar-icon">
                  <Sparkles size={20} />
                </div>
                <div>
                  <span className="lr-eyebrow">NOVA ROADMAP</span>
                  <h1 className="lr-page-title" id="learning-roadmap-title">
                    {currentStep === "step1_select_docs"
                      ? "Tạo lộ trình học"
                      : "Thiết lập kế hoạch học"}
                  </h1>
                  <p className="lr-page-desc">
                    {currentStep === "step1_select_docs"
                      ? "Chọn tài liệu bạn muốn học, Nova sẽ giúp bạn xây dựng một lộ trình phù hợp."
                      : "Cho Nova biết mục tiêu và quỹ thời gian của bạn."}
                  </p>
                </div>
              </div>
            </header>
          ) : currentStep === "roadmap_view" ? (
            <header className="lr-document-header" aria-labelledby="learning-roadmap-title">
              <div className="lr-document-heading">
                <RoadmapLogo size="sm" interactive eager className="lr-banner-logo" />
                <div>
                <span className="lr-badge"><Sparkles size={15} /> LỘ TRÌNH TỪ TÀI LIỆU</span>
                <h1 id="learning-roadmap-title">{roadmapTitle}</h1>
                <p>{`Lộ trình được tạo từ ${roadmapDocuments.length} tài liệu của bạn`}</p>
                </div>
              </div>
              <button className="lr-btn lr-btn-primary" {...roadmapLock} onClick={beginWizard}><Plus size={18} /> Tạo lộ trình mới</button>
            </header>
          ) : null}

          {/* Error Banner */}
          {error && (
            <div className="lr-error-banner" role="alert">
              <span>{error}</span>
              {currentStep === "overview" && (
                <button
                  className="lr-btn lr-btn-secondary"
                  onClick={() => {
                    setError("");
                    setLoaded(false);
                    setLoadAttempt((v) => v + 1);
                  }}
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

          {/* Stepper for Wizard */}
          {currentStep.startsWith("step") && (
            <div className="lr-stepper" aria-label="Tiến trình tạo lộ trình">
              {[
                { num: 1, label: "Chọn tài liệu" },
                { num: 2, label: "Thiết lập mục tiêu" },
                { num: 3, label: "Nhận lộ trình", kicker: "HOÀN TẤT" },
              ].map((stepItem, index) => {
                const activeIndex = currentStep === "step1_select_docs" ? 0 : 1;
                const isPast = index < activeIndex;
                const isCurrent = index === activeIndex;
                return (
                  <div
                    key={stepItem.label}
                    className={`lr-step-node ${isPast ? "is-done" : isCurrent ? "is-active" : "is-upcoming"}`}
                  >
                    <div className="lr-step-circle">
                      {isPast ? <Check size={14} strokeWidth={3} /> : stepItem.num}
                    </div>
                    <div className="lr-step-info">
                      <small>{stepItem.kicker || `BƯỚC ${stepItem.num}`}</small>
                      <strong>{stepItem.label}</strong>
                    </div>
                    {index < 2 && <div className={`lr-step-line ${index < activeIndex ? "is-done" : ""}`} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* ==================== STEP 1: CHỌN MÔN & TÀI LIỆU ==================== */}
          {currentStep === "step1_select_docs" && (
            <div className="lr-wizard-card">
              {/* Block 1: Choose Subject */}
              <div className="lr-card-section">
                <div className="lr-section-title-wrap">
                  <span className="lr-number-pill">1</span>
                  <div>
                    <h2 className="lr-section-title">Bạn muốn học từ tài liệu nào?</h2>
                    <p className="lr-section-sub">Chọn tài liệu trong Kho học liệu hoặc tải tài liệu mới lên.</p>
                  </div>
                </div>

                <div className="lr-select-wrap">
                  <select
                    className="lr-custom-select"
                    aria-label="Môn học"
                    value={activeSubjectKey}
                    onChange={(e) => {
                      setSelectedSubject(e.target.value);
                      setSelectedDocIds([]);
                      setSearch("");
                    }}
                  >
                    {subjectOptions.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="lr-select-caret" size={18} />
                </div>
              </div>

              <div className="lr-divider" />

              {/* Block 2: Choose Documents */}
              <div className="lr-card-section">
                <div className="lr-section-title-wrap lr-space-between">
                  <div className="lr-title-inner">
                    <span className="lr-number-pill">2</span>
                    <div>
                      <h2 className="lr-section-title">Chọn tài liệu</h2>
                      <p className="lr-section-sub">Chỉ hiển thị tài liệu thuộc môn học đã chọn</p>
                    </div>
                  </div>
                  {onUpload && (
                    <button
                      className="lr-btn lr-btn-outline"
                      type="button"
                      {...uploadLock}
                      onClick={() => onUpload(subject?.code || "", (uploaded) => {
                        setUploadedDocument(uploaded);
                        setSelectedSubject(String(uploaded.subjectId));
                        setSelectedDocIds((ids) => [...new Set([...ids, String(uploaded.id)])]);
                        setSearch("");
                      })}
                    >
                      <Upload size={16} /> Upload tài liệu mới
                    </button>
                  )}
                </div>

                {uploadedDocument && (
                  <div className="lr-upload-success" role="status">
                    <strong><CheckCircle2 size={16} /> Tài liệu đã được thêm vào Kho học liệu</strong>
                    <label><input type="checkbox" checked={selectedDocIds.includes(String(uploadedDocument.id))} onChange={() => handleDocumentToggle(uploadedDocument.id)} /> Sử dụng tài liệu này để tạo lộ trình</label>
                  </div>
                )}

                {/* Selected Subject Tag */}
                <div className="lr-subject-banner">
                  <div className="lr-subject-banner-left">
                    <span className="lr-dot-green" />
                    <span>
                      Môn đang chọn: <strong>{subject?.name}</strong>
                    </span>
                  </div>
                  <span className="lr-subject-banner-right">
                    Bạn đang tạo lộ trình cho môn {subject?.name}.
                  </span>
                </div>

                {/* Search Bar */}
                <div className="lr-search-bar">
                  <Search size={18} className="lr-search-icon" />
                  <input
                    type="text"
                    aria-label="Tìm tài liệu"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm kiếm tài liệu..."
                  />
                </div>

                {/* Documents List & Aside Summary */}
                <div className="lr-docs-layout">
                  <div className="lr-docs-grid">
                    {visibleDocuments.map((doc) => {
                      const isSelected = selectedDocIds.includes(String(doc.id));
                      const type = fileType(doc);
                      return (
                        <label
                          key={doc.id}
                          className={`lr-doc-item ${isSelected ? "is-selected" : ""}`}
                        >
                          <div className="lr-doc-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleDocumentToggle(doc.id)}
                              aria-label={`Chọn ${doc.title}`}
                            />
                            <span className="lr-custom-checkbox">
                              {isSelected && <Check size={13} strokeWidth={3} />}
                            </span>
                          </div>

                          <div className={`lr-doc-file-badge ${type === "PDF" ? "is-pdf" : "is-doc"}`}>
                            <FileText size={18} />
                            <small>{type}</small>
                          </div>

                          <div className="lr-doc-details">
                            <h4 className="lr-doc-title">{doc.title}</h4>
                            <span className="lr-doc-meta">
                              {subject?.name} · {doc.chapter_count ? `${doc.chapter_count} chương · ` : ""}
                              {type}
                            </span>
                          </div>

                          {isSelected && <span className="lr-selected-badge">Đã chọn</span>}
                        </label>
                      );
                    })}

                    {!visibleDocuments.length && (
                      <div className="lr-empty-docs">
                        <BookOpen size={32} />
                        <p>
                          {subjectDocuments.length
                            ? "Không tìm thấy tài liệu phù hợp từ khóa."
                            : "Chưa có tài liệu nào thuộc môn học này. Hãy tải lên tài liệu mới."}
                        </p>
                      </div>
                    )}

                    {selectedDocuments.length > 0 && (
                      <div className="lr-docs-match-note">
                        <CheckCircle2 size={16} /> Các tài liệu đều thuộc môn {subject?.name}.
                      </div>
                    )}
                  </div>

                  {/* Aside Summary */}
                  <aside className="lr-summary-aside">
                    <span className="lr-summary-kicker">LỘ TRÌNH MỚI</span>
                    <h3 className="lr-summary-heading">Tóm tắt lựa chọn</h3>
                    <dl className="lr-summary-list">
                      <div>
                        <dt>MÔN HỌC</dt>
                        <dd>{subject?.name || "Chưa chọn môn"}</dd>
                      </div>
                      <div>
                        <dt>TÀI LIỆU</dt>
                        <dd>{selectedDocuments.length} tài liệu</dd>
                      </div>
                    </dl>
                    {selectedDocuments.length > 0 && (
                      <div className="lr-summary-check">
                        <CheckCircle2 size={15} /> Tất cả cùng môn học
                      </div>
                    )}
                  </aside>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <footer className="lr-card-footer-bar">
                <div className="lr-footer-count">
                  <span className="lr-footer-number-circle">{selectedDocuments.length}</span>
                  <div>
                    <strong>{selectedDocuments.length} tài liệu được chọn</strong>
                    <small>Các tài liệu đều thuộc môn {subject?.name}.</small>
                  </div>
                </div>
                <button
                  className="lr-btn lr-btn-primary lr-btn-continue"
                  disabled={!selectedDocuments.length}
                  onClick={() => {
                    setError("");
                    setCurrentStep("step2_set_goals");
                  }}
                >
                  Tiếp tục
                </button>
              </footer>
            </div>
          )}

          {/* ==================== STEP 2: THIẾT LẬP MỤC TIÊU & THỜI GIAN ==================== */}
          {currentStep === "step2_set_goals" && (
            <form className="lr-wizard-card" onSubmit={generateRoadmap}>
              {/* Block 1: Goals */}
              <div className="lr-card-section">
                <div className="lr-section-title-wrap">
                  <span className="lr-number-pill">2</span>
                  <div>
                    <h2 className="lr-section-title">Mục tiêu của bạn</h2>
                    <p className="lr-section-sub">Bạn có thể chọn nhiều mục tiêu</p>
                  </div>
                </div>

                <div className="lr-goals-grid">
                  {GOALS.map((goal) => {
                    const isChecked = selectedGoals.includes(goal);
                    return (
                      <label
                        key={goal}
                        className={`lr-goal-pill ${isChecked ? "is-selected" : ""}`}
                      >
                        <div className="lr-goal-check-box">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleGoalToggle(goal)}
                            aria-label={goal}
                          />
                          {isChecked ? <Check size={14} strokeWidth={3} /> : <span className="lr-empty-circle" />}
                        </div>
                        <span className="lr-goal-text">{goal}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="lr-divider" />

              {/* Block 2: Time Inputs (3 columns) */}
              <div className="lr-card-section">
                <div className="lr-time-columns">
                  <div className="lr-input-box">
                    <label>Thời gian còn lại</label>
                    <div className="lr-input-unit-wrap">
                      <input
                        type="number"
                        min={1}
                        max={104}
                        aria-label="Thời gian còn lại"
                        value={weeks}
                        onChange={(e) => setWeeks(e.target.value)}
                        required
                      />
                      <span className="lr-unit">tuần</span>
                    </div>
                  </div>

                  <div className="lr-input-box">
                    <label>Thời gian học mỗi ngày</label>
                    <div className="lr-input-unit-wrap">
                      <input
                        type="number"
                        step={0.5}
                        min={0.5}
                        max={12}
                        aria-label="Thời gian học mỗi ngày"
                        value={dailyHours}
                        onChange={(e) => setDailyHours(e.target.value)}
                        required
                      />
                      <span className="lr-unit">giờ</span>
                    </div>
                  </div>

                  <div className="lr-input-box">
                    <label>Số ngày học mỗi tuần</label>
                    <div className="lr-input-unit-wrap">
                      <input
                        type="number"
                        min={1}
                        max={7}
                        aria-label="Số ngày học mỗi tuần"
                        value={daysPerWeek}
                        onChange={(e) => setDaysPerWeek(e.target.value)}
                        required
                      />
                      <span className="lr-unit">ngày / tuần</span>
                    </div>
                  </div>
                </div>

                {/* Calculation Summary Card */}
                <div className="lr-time-calc-card lr-time-summary">
                  <div className="lr-calc-left">
                    <div className="lr-calc-calendar-icon">
                      <CalendarDays size={22} />
                    </div>
                    <div>
                      <span className="lr-calc-kicker">THỜI GIAN HỌC DỰ KIẾN</span>
                      <p className="lr-calc-formula">
                        {dailyHours || 0} giờ × {daysPerWeek || 0} ngày × {weeks || 0} tuần
                      </p>
                    </div>
                  </div>
                  <div className="lr-calc-right">
                    <span className="lr-calc-total">= {validTime ? totalHours : "—"}</span>
                    <small>giờ</small>
                  </div>
                </div>
                <p className="lr-section-sub">Nova sẽ sử dụng thời gian này để phân bổ nội dung trong lộ trình.</p>
                <label className="lr-demo-option"><input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /> Chế độ demo — mô phỏng Nova trong vài giây</label>
              </div>

              {/* Footer */}
              <footer className="lr-card-footer-bar">
                <button
                  type="button"
                  className="lr-back-btn"
                  onClick={() => setCurrentStep("step1_select_docs")}
                >
                  <ArrowLeft size={16} /> Quay lại
                </button>
                <button
                  className="lr-btn lr-btn-primary lr-btn-start"
                  type="submit"
                  disabled={!permissions.personalizedRoadmap || !selectedGoals.length || !validTime || Boolean(busy)}
                  title={roadmapLock.title}
                >
                  <Sparkles size={17} /> Tạo lộ trình với Nova
                </button>
              </footer>
            </form>
          )}

          {/* ==================== OVERVIEW DASHBOARD ==================== */}
          {currentStep === "overview" && (
            <div className="lr-overview-layout">
              <RoadmapBanner
                hasRoadmap={Boolean(roadmap)}
                completed={completed}
                topics={lessonRows.length}
                hours={roadmap ? formatHours(roadmapHours) : 0}
                documents={roadmap ? roadmapDocuments.length : 0}
                onCreate={beginWizard}
                onUpload={onUpload}
                canCreate={permissions.personalizedRoadmap}
                canUpload={permissions.canUpload}
              />

              <div className="lr-section-header-row">
                <div>
                  <h2 className="lr-heading-2">Lộ trình hiện tại</h2>
                  <p className="lr-sub-2">Tiếp tục hành trình bạn đang theo đuổi</p>
                </div>
                {documents.length > 0 && (
                  <button
                    className="lr-link-btn"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? "Thu gọn" : "Xem tất cả"} <ArrowRight size={15} />
                  </button>
                )}
              </div>

              {!loaded ? (
                <div className="lr-loading-inline" role="status">
                  <BookOpen size={18} aria-hidden="true" /> Đang tải dữ liệu lộ trình...
                </div>
              ) : roadmap ? (
                <CurrentRoadmapCard
                  disabled={!permissions.personalizedRoadmap}
                  title={roadmapTitle}
                  description={roadmapDescription}
                  fileType={fileType(primaryDocument || {})}
                  completed={completed}
                  topics={lessonRows.length}
                  documents={roadmapDocuments.length}
                  completedHours={formatHours(completedHours)}
                  totalHours={formatHours(roadmapHours)}
                  remainingHours={formatHours(remainingHours)}
                  percentage={overallProgress}
                  streak={Number(streak.current_streak || 0)}
                  progress={<ProgressBar value={overallProgress} label="Tiến độ học tập" />}
                  onRename={(title) => updatePlan({ title })}
                  onContinue={() => openLesson(nextLesson)}
                />
              ) : (
                /* Empty State */
                <div className="lr-empty-card">
                  <RoadmapLogo size="md" interactive />
                  <h2>Bạn chưa có lộ trình học nào</h2>
                  <p>Chọn tài liệu từ Kho học liệu hoặc tải tài liệu mới lên để Nova tạo lộ trình cho bạn.</p>
                  <button className="lr-btn lr-btn-primary" {...roadmapLock} onClick={beginWizard}>
                    <Plus size={18} /> Tạo lộ trình đầu tiên
                  </button>
                </div>
              )}

              {/* Show All Source Docs */}
              {showAll && (
                <section className="lr-all-sources-section">
                  <h3 className="lr-sources-title">Kho tài liệu của bạn</h3>
                  <div className="lr-quick-grid">
                    {documents.map((doc) => (
                      <button
                        type="button"
                        className="lr-quick-card"
                        key={doc.id}
                        onClick={() => setSourceDocument(doc)}
                      >
                        <div className="lr-quick-icon">
                          <FileText size={18} />
                        </div>
                        <div className="lr-quick-info">
                          <strong>{doc.title}</strong>
                          <small>
                            {doc.subject_name} · {fileType(doc)}
                          </small>
                        </div>
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Quick Section: Học nhanh hôm nay */}
              {roadmap && (
                <section className="lr-quick-study-section">
                  <div className="lr-section-header-row">
                    <div>
                      <h2 className="lr-heading-2">Học nhanh hôm nay</h2>
                      <p className="lr-sub-2">Một chút tiến bộ, mỗi ngày</p>
                    </div>
                  </div>
                  <div className="lr-quick-grid">
                    {lessonRows
                      .filter((row, idx) => !locked(idx) && lessonMastery(row) < 60)
                      .slice(0, 3)
                      .map((row) => (
                        <button
                          type="button"
                          className="lr-quick-card"
                          key={row.lesson.key}
                          onClick={() => openLesson(row)}
                        >
                          <div className="lr-quick-icon is-mint">
                            <BookOpen size={18} />
                          </div>
                          <div className="lr-quick-info">
                            <strong>{row.lesson.title}</strong>
                            <small>
                              {row.module.title} · {row.lesson.estimated_minutes} phút
                            </small>
                          </div>
                          <ArrowRight size={15} />
                        </button>
                      ))}
                    {overallProgress >= 100 && (
                      <p className="lr-finished-note">🎉 Bạn đã hoàn thành toàn bộ lộ trình này!</p>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ==================== ROADMAP STUDY VIEW ==================== */}
          {currentStep === "roadmap_view" && roadmap && (
            <div className="lr-study-view">
              <div className="lr-schedule-overview">
                <span><Clock3 size={19} /><b>{roadmapHours}</b> giờ học</span>
                <span><CalendarDays size={19} /><b>{currentPlan?.weeks || 8}</b> tuần</span>
                <span><BookOpen size={19} /><b>{currentPlan?.daysPerWeek || 5}</b> ngày / tuần</span>
                <span><Sparkles size={19} /><b>{currentPlan?.dailyHours || 2}</b> giờ / ngày</span>
              </div>
              {roadmap.demo && <p className="lr-demo-note">Bản demo · Chủ đề lấy từ đề mục tài liệu; quá trình phân tích Nova được mô phỏng.</p>}
              <div className="lr-progress-header">
                <strong>
                  {formatHours(completedHours)} / {roadmapHours} giờ · {completed} / {lessonRows.length} chủ đề
                </strong>
                <span>{overallProgress}%</span>
              </div>
              <ProgressBar value={overallProgress} label="Tiến độ lộ trình" />

              {roadmap.adaptation_note && (
                <p className="lr-adaptation-badge">
                  <Sparkles size={16} /> {roadmap.adaptation_note}
                </p>
              )}

              <div className="lr-study-layout">
                <ol className="lr-timeline" aria-label="Các chủ đề trong lộ trình">
                  {lessonRows.map((row, index) => {
                    const score = lessonMastery(row);
                    const isDone = score >= 60;
                    const isLocked = locked(index);
                    const isStarted = !isDone && !isLocked && (score > 0 || currentPlan?.started?.[row.lesson.key]);
                    const start = lessonRows.slice(0, index).reduce((sum, item) => sum + topicHours(item), 0);
                    const duration = topicHours(row);
                    return (
                      <li key={row.lesson.key} className={`lr-timeline-node ${isDone ? "is-done" : isStarted ? "is-current" : isLocked ? "is-locked" : "is-ready"}`}>
                        <span className="lr-timeline-dot" aria-hidden="true">{isDone ? <Check size={18} /> : isLocked ? <LockKeyhole size={16} /> : String(index + 1).padStart(2, "0")}</span>
                        <button type="button" {...roadmapLock} className={`lr-topic-card lr-lesson-btn lr-lesson ${selectedLesson === row ? "is-selected" : ""}`} aria-pressed={selectedLesson === row} onClick={() => openLesson(row)}>
                          <span className="lr-topic-top"><span>STEP {String(index + 1).padStart(2, "0")}</span><span>{isDone ? "Hoàn thành" : isLocked ? "Đã khóa" : isStarted ? "Đang học" : "Chưa bắt đầu"}</span></span>
                          <strong>{row.lesson.title}</strong>
                          <span className="lr-topic-range"><Clock3 size={14} /> {formatHours(start)} – {formatHours(start + duration)} giờ · {formatHours(duration)} giờ học</span>
                          <span className="lr-topic-description">{row.lesson.source?.excerpt?.slice(0, 150) || row.lesson.objectives?.[0]}</span>
                          <span className="lr-topic-source"><FileText size={14} /> {row.lesson.source?.documentTitle || "Tài liệu đã chọn"}</span>
                          {isStarted && <ProgressBar value={score} label={`Tiến độ ${row.lesson.title}`} />}
                          {!isLocked && !isDone && <span className="lr-topic-link">{isStarted ? "Tiếp tục học" : "Bắt đầu học"} <ArrowRight size={15} /></span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {/* Lesson Detail Sidebar */}
                <aside className="lr-study-detail-sidebar lr-detail">
                  {selectedLesson && (
                    <div className="lr-detail-inner-card">
                      <span className="lr-eyebrow">
                        CHỦ ĐỀ {selectedLessonIndex + 1} / {lessonRows.length}
                      </span>
                      <h2 className="lr-lesson-detail-title">{selectedLesson.lesson.title}</h2>
                      <p className="lr-time-estimate">
                        <Clock3 size={15} /> {formatHours(topicHours(selectedLesson) * (lessonMastery(selectedLesson) >= 60 ? 1 : lessonMastery(selectedLesson) / 100))} / {formatHours(topicHours(selectedLesson))} giờ · {lessonMastery(selectedLesson)}%
                      </p>
                      <ProgressBar value={lessonMastery(selectedLesson)} label="Tiến độ chủ đề" />

                      {selectedLesson.lesson.objectives?.length > 0 && (
                        <div className="lr-objectives-block">
                          <h4>Mục tiêu học</h4>
                          <ul>
                            {selectedLesson.lesson.objectives.map((obj, i) => (
                              <li key={i}>{obj}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedLesson.lesson.examples?.length > 0 && (
                        <div className="lr-example-snippet">
                          <code>{selectedLesson.lesson.examples[0]}</code>
                        </div>
                      )}

                      {locked(selectedLessonIndex) && (
                        <p className="lr-locked-warning">
                          <LockKeyhole size={15} /> Đạt 60% ở các chủ đề trước để tiếp tục.
                        </p>
                      )}

                      <div className="lr-exercise-btn-row">
                        <button
                          className="lr-btn lr-btn-primary"
                          disabled={locked(selectedLessonIndex) || Boolean(busy)}
                          onClick={() => {
                            updatePlan({ started: { ...plan.started, [selectedLesson.lesson.key]: true } });
                            const doc = roadmapDocuments.find((item) => String(item.id) === selectedLesson.lesson.source?.documentId) || roadmapDocuments[0];
                            if (doc) setSourceDocument(doc);
                          }}
                        >
                          Bắt đầu học
                        </button>
                        <button className="lr-btn lr-btn-outline" disabled={locked(selectedLessonIndex) || !onAskNova} onClick={() => onAskNova(roadmapDocuments.find((doc) => String(doc.id) === selectedLesson.lesson.source?.documentId) || roadmapDocuments[0])}><Sparkles size={16} /> Hỏi Nova</button>
                        <button
                          className="lr-btn lr-btn-secondary"
                          disabled={
                            locked(selectedLessonIndex) ||
                            Boolean(busy) ||
                            !selectedLesson.exercises.some((ex) => ex.exercise_type === "multiple_choice")
                          }
                          onClick={() =>
                            startExercise(
                              selectedLesson.exercises.find((ex) => ex.exercise_type === "multiple_choice")
                            )
                          }
                        >
                          Làm Quiz
                        </button>
                        <button className="lr-btn lr-btn-secondary" disabled={locked(selectedLessonIndex) || lessonMastery(selectedLesson) >= 60} onClick={markComplete}><Check size={16} /> Đánh dấu hoàn thành</button>
                      </div>

                      {/* Active Exercise Form */}
                      {activeExercise && (
                        <form className="lr-exercise-box" onSubmit={sendExercise}>
                          <div className="lr-exercise-header">
                            <strong>
                              {activeExercise.exercise_type === "multiple_choice" ? "Quiz" : "Bài luyện tập"}
                            </strong>
                            <button
                              type="button"
                              className="lr-close-btn"
                              aria-label="Đóng bài tập"
                              onClick={() => startExercise(null)}
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <p className="lr-exercise-prompt">{activeExercise.prompt}</p>

                          {activeExercise.options?.length ? (
                            <div className="lr-quiz-choices">
                              {activeExercise.options.map((opt, i) => (
                                <label key={i} className="lr-choice-label">
                                  <input
                                    type="radio"
                                    name="roadmap-quiz-opt"
                                    checked={answer === opt}
                                    aria-label={opt}
                                    onChange={() => setAnswer(opt)}
                                    disabled={Boolean(busy)}
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <textarea
                              rows={4}
                              value={answer}
                              onChange={(e) => setAnswer(e.target.value)}
                              placeholder="Viết câu trả lời của bạn..."
                              required
                              disabled={Boolean(busy)}
                            />
                          )}

                          {grade && (
                            <div className="lr-grade-report lr-grade">
                              <strong>
                                {grade.percentage}% · {grade.grade}
                              </strong>
                              <p>{grade.feedback}</p>
                            </div>
                          )}

                          <button
                            className="lr-btn lr-btn-primary"
                            type="submit"
                            disabled={!answer.trim() || Boolean(busy)}
                          >
                            {busy === "grade" ? "Đang chấm..." : "Nộp bài"}
                          </button>
                        </form>
                      )}

                      {/* Sources for this roadmap */}
                      {roadmapDocuments.length > 0 && (
                        <div className="lr-detail-sources-block">
                          <h4>Tài liệu nguồn</h4>
                          {(selectedLesson.lesson.source ? roadmapDocuments.filter((doc) => String(doc.id) === selectedLesson.lesson.source.documentId) : roadmapDocuments).map((doc) => (
                            <button
                              type="button"
                              className="lr-doc-link-btn"
                              key={doc.id}
                              onClick={() => setSourceDocument(doc)}
                            >
                              <FileText size={15} />
                              <span>{doc.title}{selectedLesson.lesson.source?.sourceLine ? ` · Dòng ${selectedLesson.lesson.source.sourceLine}` : ""}</span>
                              <ArrowRight size={14} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </aside>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
