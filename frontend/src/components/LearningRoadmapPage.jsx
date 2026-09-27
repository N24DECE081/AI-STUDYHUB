import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, BookOpenIcon, CheckIcon, ClockIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  generateTutorRoadmap,
  getDocumentContent,
  getTutorRoadmap,
  getTutorSubmissions,
  submitTutorExercise,
} from "../api";
import "./learning-roadmap.css";

const FIELDS = [
  { name: "Software Engineering", goal: "Backend Developer", icon: "⌘" },
  { name: "Web Development", goal: "Full-stack Developer", icon: "⌁" },
  { name: "AI / Machine Learning", goal: "Machine Learning Engineer", icon: "✳" },
  { name: "Cyber Security", goal: "Security Analyst", icon: "⛨" },
  { name: "Data Science", goal: "Data Scientist", icon: "▥" },
  { name: "Database", goal: "Database Engineer", icon: "▤" },
  { name: "Computer Networks", goal: "Network Engineer", icon: "⌘" },
  { name: "Mobile Development", goal: "Mobile Developer", icon: "▯" },
];
const LEVELS = [["beginner", "Mới bắt đầu"], ["intermediate", "Đã có nền tảng"], ["advanced", "Nâng cao"]];
const FILTERS = [["all", "Tất cả"], ["in-progress", "Đang học"], ["completed", "Hoàn thành"], ["recent", "Mới thêm"]];
const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));
const levelLabel = (value) => LEVELS.find(([id]) => id === value)?.[1] || value || "Chưa xác định";
const masteryLabel = (value) => value >= 95 ? "Mastered" : value >= 80 ? "Proficient" : value >= 60 ? "Familiar" : value >= 40 ? "Learning" : "Not started";

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
    if (title && !headings.some((item) => item.title.toLocaleLowerCase("vi") === title.toLocaleLowerCase("vi"))) headings.push({ title, line: index });
  });
  if (!headings.length) {
    const excerpt = lines.map((line) => line.trim()).find(Boolean) || "";
    return excerpt ? [{ id: String(document.id) + "-source", title: document.title, excerpt: excerpt.slice(0, 700), sourceOnly: true }] : [];
  }
  return headings.slice(0, 32).map((heading, index) => {
    const end = headings[index + 1]?.line ?? lines.length;
    const excerpt = lines.slice(heading.line + 1, end).map((line) => line.trim()).filter(Boolean).join(" ");
    return { id: String(document.id) + "-" + index, title: heading.title, excerpt: excerpt.slice(0, 700), sourceLine: heading.line + 1 };
  });
};

const readProgress = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
};

export default function LearningRoadmapPage({
  documents = [], progress = [], onOpenDocument, onTakeQuiz,
  user, streak = {}, studyTime = {},
}) {
  const userScope = String(user?.id || user?.email || "guest");
  const [mode, setMode] = useState("documents");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [sourceContent, setSourceContent] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [sourceDone, setSourceDone] = useState(() => readProgress("studyhub-source-roadmap:" + userScope));
  const [field, setField] = useState(FIELDS[0].name);
  const [goal, setGoal] = useState(FIELDS[0].goal);
  const [currentLevel, setCurrentLevel] = useState("beginner");
  const [targetLevel, setTargetLevel] = useState("advanced");
  const [weeklyHours, setWeeklyHours] = useState("8");
  const [careerRoadmap, setCareerRoadmap] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [roadmapLoaded, setRoadmapLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [activeExerciseId, setActiveExerciseId] = useState(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState(null);

  const sourceStorageKey = "studyhub-source-roadmap:" + userScope;
  const careerIsLoaded = roadmapLoaded || userScope === "guest";
  const progressByDocument = useMemo(() => new Map(progress.map((item) => [String(item.documentId), Number(item.percent || 0)])), [progress]);
  const selectedDocument = documents.find((document) => String(document.id) === String(selectedDocumentId));
  const sourceSections = useMemo(
    () => selectedDocument ? extractSourceSections(sourceContent, selectedDocument) : [],
    [sourceContent, selectedDocument],
  );
  const selectedSource = sourceSections[selectedSourceIndex] || null;
  const selectedSourceKey = selectedSource ? String(selectedDocumentId) + ":" + selectedSource.id : "";
  const completedSourceCount = sourceSections.filter((section) => sourceDone[String(selectedDocumentId) + ":" + section.id]).length;
  const sourceCompletion = sourceSections.length ? Math.round(completedSourceCount * 100 / sourceSections.length) : 0;

  const filteredDocuments = useMemo(() => {
    let items = documents.filter((document) => {
      const query = search.trim().toLocaleLowerCase("vi");
      const matchesSearch = !query || (String(document.title || "") + " " + String(document.subject_name || "") + " " + String(document.original_filename || "")).toLocaleLowerCase("vi").includes(query);
      const percent = progressByDocument.get(String(document.id)) || 0;
      const matchesFilter = filter === "all" || filter === "recent"
        || (filter === "completed" && percent >= 100)
        || (filter === "in-progress" && percent > 0 && percent < 100);
      return matchesSearch && matchesFilter;
    });
    if (filter === "recent") items = [...items].sort((a, b) => String(b.uploaded_at || b.created_at || "").localeCompare(String(a.uploaded_at || a.created_at || "")));
    return items;
  }, [documents, filter, progressByDocument, search]);

  const lessonRows = useMemo(() => (careerRoadmap?.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({
    module,
    lesson,
    exercises: (careerRoadmap.exercises || []).filter((exercise) => String(exercise.lesson_key) === String(lesson.key)),
  }))), [careerRoadmap]);
  const exerciseGrades = useMemo(() => {
    const ids = new Set((careerRoadmap?.exercises || []).map((exercise) => String(exercise.id)));
    const best = new Map();
    submissions.forEach((item) => {
      const id = String(item.exercise_id);
      if (!ids.has(id)) return;
      const previous = best.get(id);
      if (!previous || clamp(item.percentage) > previous.percentage) {
        best.set(id, { percentage: clamp(item.percentage), score: Number(item.score || 0) });
      }
    });
    return best;
  }, [careerRoadmap, submissions]);
  const lessonMastery = (row) => {
    const scores = row.exercises.map((exercise) => exerciseGrades.get(String(exercise.id))?.percentage).filter((value) => value !== undefined);
    return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  };
  const careerMastery = lessonRows.length ? Math.round(lessonRows.reduce((sum, row) => sum + lessonMastery(row), 0) / lessonRows.length) : 0;
  const selectedLessonRow = lessonRows.find((row) => row.lesson.key === selectedLessonId) || lessonRows[0] || null;
  const selectedLessonIndex = selectedLessonRow ? lessonRows.findIndex((row) => row.lesson.key === selectedLessonRow.lesson.key) : -1;
  const isLessonLocked = selectedLessonIndex > 0 && lessonRows.slice(0, selectedLessonIndex).some((row) => lessonMastery(row) < 60);
  const selectedExercises = selectedLessonRow?.exercises || [];
  const activeExercise = selectedExercises.find((exercise) => String(exercise.id) === String(activeExerciseId)) || null;
  const gradedCount = exerciseGrades.size;
  const xp = Math.round([...exerciseGrades.values()].reduce((sum, result) => sum + result.score, 0));
  const playerLevel = Math.floor(xp / 250) + 1;
  const masteryBadge = [...exerciseGrades.values()].some((result) => result.percentage >= 95);
  const studyMinutes = Math.floor(Number(studyTime.total_seconds || 0) / 60);
  const selectedPrevious = selectedLessonIndex > 0 ? lessonRows[selectedLessonIndex - 1] : null;
  const practiceExercise = selectedExercises.find((item) => item.exercise_type !== "multiple_choice") || selectedExercises[0];
  const quizExercise = selectedExercises.find((item) => item.exercise_type === "multiple_choice") || selectedExercises[0];

  useEffect(() => {
    if (mode !== "career" || roadmapLoaded || userScope === "guest") return undefined;
    let active = true;
    Promise.allSettled([getTutorRoadmap(), getTutorSubmissions()]).then(([pathResult, submissionsResult]) => {
      if (!active) return;
      if (pathResult.status === "fulfilled" && pathResult.value?.roadmap_id) {
        const data = pathResult.value;
        setCareerRoadmap(data);
        setField(FIELDS.find((item) => item.name === data.subject)?.name || data.subject || FIELDS[0].name);
        setGoal(data.goal || FIELDS[0].goal);
        setCurrentLevel(data.current_level || "beginner");
        setTargetLevel(data.target_level || "advanced");
        setWeeklyHours(String(Math.max(2, Math.min(40, Math.round(Number(data.study_time || 480) / 60)))));
        setSelectedLessonId(data.modules?.[0]?.lessons?.[0]?.key || null);
      }
      if (submissionsResult.status === "fulfilled") setSubmissions(submissionsResult.value?.items || []);
      if (pathResult.status === "rejected") setError(pathResult.reason?.message || "Không tải được lộ trình đã lưu.");
      setRoadmapLoaded(true);
    });
    return () => { active = false; };
  }, [mode, roadmapLoaded, userScope]);

  const openSourceRoadmap = async (document) => {
    setSelectedDocumentId(document.id);
    setSelectedSourceIndex(0);
    setSourceContent("");
    setSourceError("");
    setSourceBusy(true);
    try {
      const result = await getDocumentContent(document.id);
      setSourceContent(result.content || "");
    } catch (requestError) {
      setSourceError(requestError.message || "Không thể đọc nội dung tài liệu.");
    } finally {
      setSourceBusy(false);
    }
  };

  const completeSourceNode = () => {
    if (!selectedSource || !selectedSourceKey) return;
    const next = { ...sourceDone, [selectedSourceKey]: !sourceDone[selectedSourceKey] };
    setSourceDone(next);
    try { localStorage.setItem(sourceStorageKey, JSON.stringify(next)); } catch { /* giữ state trong phiên hiện tại */ }
  };

  const generateCareerRoadmap = async (event) => {
    event.preventDefault();
    const hours = Math.max(2, Math.min(40, Number(weeklyHours) || 0));
    if (!goal.trim()) {
      setError("Hãy nhập mục tiêu nghề nghiệp trước khi tạo lộ trình.");
      return;
    }
    setBusy("generate");
    setError("");
    setGrade(null);
    try {
      const previousIds = new Set((careerRoadmap?.exercises || []).map((exercise) => String(exercise.id)));
      const relevant = submissions.filter((item) => previousIds.has(String(item.exercise_id)) && careerRoadmap?.subject === field);
      const strengths = [...new Set(relevant.filter((item) => Number(item.percentage) >= 80).map((item) => item.topic).filter(Boolean))].slice(0, 5);
      const weaknesses = [...new Set(relevant.filter((item) => Number(item.percentage) < 60).map((item) => item.topic).filter(Boolean))].slice(0, 5);
      const data = await generateTutorRoadmap({
        subject: field,
        goal: goal.trim(),
        current_level: currentLevel,
        target_level: targetLevel,
        pace: hours <= 4 ? "slow" : hours <= 8 ? "steady" : "fast",
        study_time: hours * 60,
        strengths,
        weaknesses,
        topics: [],
      });
      setCareerRoadmap(data);
      setSelectedLessonId(data.modules?.[0]?.lessons?.[0]?.key || null);
      setActiveExerciseId(null);
      setRoadmapLoaded(true);
      const latest = await getTutorSubmissions().catch(() => null);
      if (latest) setSubmissions(latest.items || []);
    } catch (requestError) {
      setError(requestError.message || "Không thể tạo lộ trình AI lúc này.");
    } finally {
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
    if (!activeExercise || !answer.trim() || busy) return;
    setBusy("grade");
    setError("");
    try {
      const answerType = activeExercise.exercise_type === "multiple_choice" ? "choice" : activeExercise.exercise_type;
      const result = await submitTutorExercise(activeExercise.id, { answer: answer.trim(), answerType });
      setGrade(result);
      const [pathData, submissionData] = await Promise.all([getTutorRoadmap(), getTutorSubmissions()]);
      if (pathData?.roadmap_id) setCareerRoadmap(pathData);
      setSubmissions(submissionData?.items || []);
    } catch (requestError) {
      setError(requestError.message || "Không chấm được bài làm.");
    } finally {
      setBusy("");
    }
  };

  const badges = [
    { icon: "⚡", title: "Bước đầu", earned: gradedCount > 0 },
    { icon: "🧠", title: "Quiz Master", earned: masteryBadge },
    { icon: "🔥", title: "7 ngày streak", earned: Number(streak.current_streak || 0) >= 7 },
    { icon: "🏆", title: "Hoàn tất hành trình", earned: Boolean(careerRoadmap?.progress?.completed) },
  ];

  return (
    <section className="learning-roadmap-page" aria-labelledby="learning-roadmap-title">
      <header className="lr-header">
        <div><span className="lr-kicker"><SparklesIcon aria-hidden="true" /> STUDYHUB · LEARNING ROADMAP</span><h1 id="learning-roadmap-title">Your journey to mastery</h1><p>Chọn hành trình của bạn, đi từng mốc và theo dõi mastery qua bài luyện thực tế.</p></div>
        <div className="lr-stats" aria-label="Thành tích học tập">
          <span><b>🔥 {streak.current_streak || 0}</b><small>ngày streak</small></span>
          <span><b>LV {String(playerLevel).padStart(2, "0")}</b><small>{xp.toLocaleString("vi-VN")} XP</small></span>
          <span><b>{studyMinutes >= 60 ? (studyMinutes / 60).toFixed(1) + "h" : studyMinutes + "m"}</b><small>thời gian học</small></span>
        </div>
      </header>

      <nav className="lr-modes" aria-label="Chọn loại lộ trình">
        <button type="button" className={mode === "documents" ? "is-active" : ""} aria-pressed={mode === "documents"} onClick={() => { setMode("documents"); setError(""); }}><BookOpenIcon aria-hidden="true" /><span><strong>Theo tài liệu</strong><small>Học từ nguồn của bạn</small></span></button>
        <button type="button" className={mode === "career" ? "is-active" : ""} aria-pressed={mode === "career"} onClick={() => { setMode("career"); setError(""); }}><span className="lr-mode-icon" aria-hidden="true">✳</span><span><strong>Theo chuyên ngành</strong><small>Từ nền tảng đến mục tiêu nghề nghiệp</small></span></button>
      </nav>
      {error && <p className="lr-error" role="alert">{error}</p>}

      {mode === "documents" ? (
        <div className="lr-document-mode">
          <aside className="lr-library">
            <div className="lr-library-head"><div><span className="lr-eyebrow">SOURCE LIBRARY</span><h2>Tài liệu của bạn</h2></div><span className="lr-count">{documents.length}</span></div>
            <label className="lr-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tài liệu..." aria-label="Tìm tài liệu" /></label>
            <div className="lr-filters" role="group" aria-label="Lọc tài liệu">{FILTERS.map(([id, label]) => <button type="button" key={id} className={filter === id ? "is-active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
            <div className="lr-document-list">
              {filteredDocuments.map((document) => {
                const percent = clamp(progressByDocument.get(String(document.id)) || 0);
                const active = String(document.id) === String(selectedDocumentId);
                return <article className={"lr-document-row" + (active ? " is-selected" : "")} key={document.id}><button type="button" onClick={() => openSourceRoadmap(document)} aria-pressed={active}><span className="lr-document-icon">▤</span><span className="lr-document-copy"><strong>{document.title}</strong><small>{document.subject_code || document.subject_name || "Tài liệu"} · {(document.file_type || "FILE").toString().replace(/^\./, "").toUpperCase()}</small><span className="lr-mini-progress"><i style={{ width: percent + "%" }} /></span><small>{percent}% đã đọc</small></span><ArrowRightIcon aria-hidden="true" /></button></article>;
              })}
              {!filteredDocuments.length && <p className="lr-empty">{documents.length ? "Không tìm thấy tài liệu phù hợp." : "Kho tài liệu đang trống."}</p>}
            </div>
            <div className="lr-source-note"><span>📄</span><p>Chủ đề hiển thị được trích từ heading và nội dung thật của tài liệu.</p></div>
          </aside>

          <section className="lr-source-workspace" aria-label="Lộ trình theo tài liệu">
            {!selectedDocument ? <div className="lr-workspace-empty"><span>◈</span><h2>Chọn tài liệu để mở hành trình</h2><p>Node học bám theo tiêu đề và đoạn văn có trong nguồn đã chọn.</p></div>
              : sourceBusy ? <div className="lr-workspace-empty" role="status"><span className="lr-spinner" /><h2>Đang đọc tài liệu</h2><p>Đang lấy văn bản gốc để dựng các mốc học.</p></div>
                : sourceError ? <div className="lr-workspace-empty"><span>!</span><h2>Không đọc được tài liệu</h2><p>{sourceError}</p><button type="button" className="lr-button" onClick={() => openSourceRoadmap(selectedDocument)}>Thử lại</button></div>
                  : sourceSections.length ? <>
                    <div className="lr-source-heading"><div><span className="lr-eyebrow">📄 SOURCE CONTENT · {selectedDocument.file_name || selectedDocument.original_filename || "TÀI LIỆU"}</span><h2>{selectedDocument.title}</h2><p>{sourceSections.length} mốc từ văn bản trích xuất · Chỉ nội dung có trong nguồn</p></div><div className="lr-overall"><strong>{sourceCompletion}%</strong><span>đã hoàn thành</span><i><b style={{ width: sourceCompletion + "%" }} /></i></div></div>
                    <div className="lr-source-layout">
                      <div className="lr-source-path" aria-label="Các mốc từ tài liệu"><div className="lr-path-line" />
                        {sourceSections.map((section, index) => {
                          const done = Boolean(sourceDone[String(selectedDocumentId) + ":" + section.id]);
                          const locked = index > 0 && !sourceDone[String(selectedDocumentId) + ":" + sourceSections[index - 1].id];
                          const selected = selectedSourceIndex === index;
                          return <button type="button" className={"lr-source-node" + (done ? " is-done" : "") + (locked ? " is-locked" : "") + (selected ? " is-current" : "")} key={section.id} onClick={() => setSelectedSourceIndex(index)} aria-pressed={selected}><span className="lr-node-orb">{done ? <CheckIcon aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span><span className="lr-source-node-copy"><small>{section.sourceOnly ? "DOCUMENT SOURCE" : "SOURCE · " + String(index + 1).padStart(2, "0")}</small><strong>{section.title}</strong><em>{done ? "Hoàn thành" : locked ? "Đang khóa" : selected ? "Đang học" : "Sẵn sàng"}</em></span></button>;
                        })}
                        <div className="lr-path-end">END OF SOURCE</div>
                      </div>
                      <aside className="lr-detail-panel" aria-live="polite">
                        {selectedSource ? <>
                          <div className="lr-detail-top"><span>DOCUMENT NODE</span><button type="button" onClick={() => setSelectedSourceIndex(-1)} aria-label="Đóng chi tiết"><XMarkIcon aria-hidden="true" /></button></div>
                          <span className="lr-detail-index">{String(selectedSourceIndex + 1).padStart(2, "0")} / {String(sourceSections.length).padStart(2, "0")}</span><h3>{selectedSource.title}</h3>
                          <span className="lr-source-pill">📄 From your document</span><h4>Nội dung trích từ nguồn</h4><p className="lr-source-excerpt">{selectedSource.excerpt || "Tiêu đề được trích trực tiếp từ tài liệu. Mở bản gốc để xem nội dung."}</p>
                          {selectedSource.sourceLine && <small className="lr-source-line">Dòng nguồn {selectedSource.sourceLine}</small>}
                          <div className="lr-detail-meta"><span><ClockIcon aria-hidden="true" /> Theo nhịp học của bạn</span><span>Tiên quyết: {selectedSourceIndex ? sourceSections[selectedSourceIndex - 1]?.title : "Không có"}</span></div>
                          <div className="lr-detail-actions"><button type="button" className="lr-button lr-button-primary" disabled={selectedSourceIndex > 0 && !sourceDone[String(selectedDocumentId) + ":" + sourceSections[selectedSourceIndex - 1]?.id]} onClick={completeSourceNode}>{sourceDone[selectedSourceKey] ? "Đánh dấu chưa hoàn thành" : "Hoàn tất mốc"}<CheckIcon aria-hidden="true" /></button>{onOpenDocument && <button type="button" className="lr-button" onClick={() => onOpenDocument(selectedDocument)}>Mở tài liệu</button>}{onTakeQuiz && <button type="button" className="lr-button lr-button-quiet" onClick={() => onTakeQuiz(selectedDocument)}>Tạo Quiz từ tài liệu</button>}</div>
                        </> : <div className="lr-detail-blank"><span>◉</span><p>Chọn một node để xem nội dung nguồn và các thao tác học.</p></div>}
                      </aside>
                    </div>
                  </> : <div className="lr-workspace-empty"><span>⌁</span><h2>Văn bản chưa có heading nhận diện được</h2><p>Không tự suy diễn chủ đề. Bạn vẫn có thể mở tài liệu gốc hoặc tạo Quiz từ nội dung đã tải lên.</p><div className="lr-empty-actions">{onOpenDocument && <button type="button" className="lr-button" onClick={() => onOpenDocument(selectedDocument)}>Mở tài liệu</button>}{onTakeQuiz && <button type="button" className="lr-button lr-button-primary" onClick={() => onTakeQuiz(selectedDocument)}>Tạo Quiz</button>}</div></div>}
          </section>
        </div>
      ) : (
        <div className="lr-career-mode">
          <aside className="lr-career-setup"><span className="lr-eyebrow">BUILD YOUR PATH</span><h2>Chọn điểm đến</h2><p>Lộ trình tạo theo chuyên ngành, trình độ và thời gian học của bạn.</p>
            <form onSubmit={generateCareerRoadmap}>
              <label>Chuyên ngành<select value={field} onChange={(event) => { const next = FIELDS.find((item) => item.name === event.target.value); setField(event.target.value); if (next) setGoal(next.goal); }}>{FIELDS.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
              <label>Trình độ hiện tại<select value={currentLevel} onChange={(event) => setCurrentLevel(event.target.value)}>{LEVELS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
              <label>Mục tiêu nghề nghiệp<input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ví dụ: Backend Developer" maxLength={200} /></label>
              <div className="lr-level-pair"><label>Đích đến<select value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>{LEVELS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label>Giờ / tuần<input type="number" min="2" max="40" value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /></label></div>
              <button className="lr-button lr-button-primary lr-generate" type="submit" disabled={busy === "generate"}>{busy === "generate" ? <><span className="lr-spinner" />Nova đang tạo...</> : <><SparklesIcon aria-hidden="true" />Tạo lộ trình AI</>}</button>
            </form>
            <div className="lr-ai-note"><span>✳</span><p>Kết quả quiz đã chấm trong cùng chuyên ngành giúp nhận diện điểm mạnh và phần cần ôn.</p></div>
          </aside>

          <section className="lr-career-workspace" aria-label="Lộ trình theo chuyên ngành">
            {!careerIsLoaded ? <div className="lr-workspace-empty" role="status"><span className="lr-spinner" /><h2>Đang tải hành trình</h2><p>Đang đồng bộ lộ trình và điểm luyện tập đã lưu.</p></div>
              : careerRoadmap ? <>
                <header className="lr-career-heading"><div><span className="lr-eyebrow">✳ AI PERSONALIZED PATH · {careerRoadmap.subject}</span><h2>{careerRoadmap.title}</h2><p>{careerRoadmap.summary || careerRoadmap.goal}</p><div className="lr-goal-tags"><span>{levelLabel(careerRoadmap.current_level)} → {levelLabel(careerRoadmap.target_level)}</span><span>{careerRoadmap.goal}</span></div></div><div className="lr-overall lr-overall-career"><strong>{careerMastery}%</strong><span>MASTERY</span><i><b style={{ width: careerMastery + "%" }} /></i><small>{gradedCount}/{careerRoadmap.exercises?.length || 0} bài đã chấm</small></div></header>
                {careerRoadmap.adaptation_note && <p className="lr-adaptation"><SparklesIcon aria-hidden="true" />{careerRoadmap.adaptation_note}</p>}
                <div className="lr-career-layout">
                  <div className="lr-career-path" aria-label="Các cấp độ trong lộ trình">
                    {careerRoadmap.modules.map((module, moduleIndex) => {
                      const moduleRows = lessonRows.filter((row) => row.module.key === module.key);
                      const moduleProgress = moduleRows.length ? Math.round(moduleRows.reduce((sum, row) => sum + lessonMastery(row), 0) / moduleRows.length) : 0;
                      return <section className="lr-level" key={module.key}>
                        <div className="lr-level-heading"><span>LEVEL {String(moduleIndex + 1).padStart(2, "0")}</span><div><h3>{module.title}</h3><small>{levelLabel(module.difficulty)} · {moduleRows.length} checkpoints</small></div><b>{moduleProgress}%</b></div>
                        <div className="lr-branch">{moduleRows.map((row, nodeIndex) => {
                          const mastery = lessonMastery(row);
                          const globalIndex = lessonRows.findIndex((item) => item.lesson.key === row.lesson.key);
                          const locked = globalIndex > 0 && lessonRows.slice(0, globalIndex).some((item) => lessonMastery(item) < 60);
                          const status = mastery >= 95 ? "mastered" : mastery >= 60 ? "familiar" : mastery > 0 ? "learning" : locked ? "locked" : "available";
                          const selected = selectedLessonRow?.lesson.key === row.lesson.key;
                          return <button type="button" className={"lr-career-node is-" + status + (selected ? " is-selected" : "")} key={row.lesson.key} onClick={() => { setSelectedLessonId(row.lesson.key); setActiveExerciseId(null); setGrade(null); setError(""); }} aria-pressed={selected}><span className="lr-node-orb">{status === "mastered" ? <CheckIcon aria-hidden="true" /> : locked ? "▣" : String(nodeIndex + 1).padStart(2, "0")}</span><span className="lr-career-node-copy"><small>{status === "locked" ? "LOCKED" : status === "available" ? "AVAILABLE" : masteryLabel(mastery).toUpperCase()}</small><strong>{row.lesson.title}</strong><em><i style={{ width: mastery + "%" }} />{mastery}%</em></span><ArrowRightIcon aria-hidden="true" /></button>;
                        })}</div>
                      </section>;
                    })}
                    <div className="lr-path-end">CAREER GOAL · {careerRoadmap.goal}</div>
                  </div>
                  <aside className="lr-detail-panel lr-career-detail" aria-live="polite">
                    {selectedLessonRow ? <>
                      <div className="lr-detail-top"><span>LEARNING CHECKPOINT</span><span className={"lr-difficulty is-" + selectedLessonRow.module.difficulty}>{levelLabel(selectedLessonRow.module.difficulty)}</span></div>
                      <span className="lr-detail-index">{String(selectedLessonIndex + 1).padStart(2, "0")} / {String(lessonRows.length).padStart(2, "0")}</span><h3>{selectedLessonRow.lesson.title}</h3>
                      <div className="lr-detail-meta"><span><ClockIcon aria-hidden="true" /> ~{selectedLessonRow.lesson.estimated_minutes} phút</span><span>Mastery: {lessonMastery(selectedLessonRow)}% · {masteryLabel(lessonMastery(selectedLessonRow))}</span></div>
                      {selectedPrevious && <p className="lr-prerequisite">Tiên quyết · {selectedPrevious.lesson.title}</p>}
                      {selectedLessonRow.lesson.objectives?.length ? <><h4>Bạn sẽ học</h4><ul className="lr-objectives">{selectedLessonRow.lesson.objectives.map((item) => <li key={item}>{item}</li>)}</ul></> : <p className="lr-empty-inline">Chưa có mục tiêu chi tiết cho node này.</p>}
                      {selectedLessonRow.lesson.examples?.length > 0 && <p className="lr-example">Ví dụ · {selectedLessonRow.lesson.examples[0]}</p>}
                      {isLessonLocked && <p className="lr-locked-note">Đạt mastery 60% ở checkpoint trước để mở node này.</p>}
                      <div className="lr-exercise-actions"><button type="button" className="lr-button lr-button-primary" disabled={isLessonLocked || !practiceExercise} onClick={() => startExercise(practiceExercise)}>Bắt đầu học <ArrowRightIcon aria-hidden="true" /></button><button type="button" className="lr-button" disabled={isLessonLocked || !quizExercise} onClick={() => startExercise(quizExercise)}>Làm Quiz</button></div>
                      {activeExercise && <form className="lr-exercise" onSubmit={sendExercise}>
                        <div className="lr-exercise-top"><span>{activeExercise.exercise_type === "multiple_choice" ? "QUIZ" : "PRACTICE"}</span><button type="button" onClick={() => startExercise(null)} aria-label="Đóng bài luyện"><XMarkIcon aria-hidden="true" /></button></div><p>{activeExercise.prompt}</p>
                        {activeExercise.options?.length ? <div className="lr-exercise-options">{activeExercise.options.map((option, index) => <label key={String(activeExercise.id) + "-" + index} className={answer === option ? "is-selected" : ""}><input type="radio" name={"exercise-" + activeExercise.id} checked={answer === option} onChange={() => setAnswer(option)} /><span>{option}</span></label>)}</div> : activeExercise.exercise_type === "math" ? <input inputMode="decimal" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Nhập đáp án" /> : <textarea rows="3" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Viết câu trả lời của bạn..." />}
                        {grade && <div className="lr-grade-result" role="status"><strong>{grade.percentage}% · {grade.grade}</strong><span>{grade.feedback}</span></div>}
                        <button type="submit" className="lr-button lr-button-primary" disabled={!answer.trim() || busy === "grade"}>{busy === "grade" ? "Đang chấm..." : "Nộp bài"}</button>
                      </form>}
                    </> : <div className="lr-detail-blank"><span>◉</span><p>Chọn một checkpoint trên hành trình để xem chi tiết.</p></div>}
                  </aside>
                </div>
              </> : <div className="lr-career-empty"><div className="lr-pixel-guide" aria-hidden="true">🧑‍🚀</div><span className="lr-eyebrow">READY WHEN YOU ARE</span><h2>Chọn chuyên ngành, bắt đầu hành trình</h2><p>Lộ trình sẽ được AI tạo theo mục tiêu, trình độ và thời gian học mỗi tuần của bạn.</p></div>}
          </section>
        </div>
      )}

      <footer className="lr-achievements">
        <div className="lr-achievement-head"><div><span className="lr-eyebrow">PLAYER PROFILE</span><h2>Thành tích hành trình</h2></div><span>LV {String(playerLevel).padStart(2, "0")} · {xp.toLocaleString("vi-VN")} XP</span></div>
        <div className="lr-xp-track" role="progressbar" aria-label="Tiến độ cấp độ" aria-valuenow={xp % 250} aria-valuemin="0" aria-valuemax="250"><i style={{ width: ((xp % 250) * 100 / 250) + "%" }} /></div>
        <div className="lr-badges">{badges.map((badge) => <span className={badge.earned ? "is-earned" : ""} key={badge.title}><i>{badge.icon}</i><b>{badge.title}</b>{badge.earned && <CheckIcon aria-label="Đã đạt" />}</span>)}</div>
        <div className="lr-pixel-guide"><span aria-hidden="true">🧑‍🚀</span><p><strong>{careerMastery >= 95 ? "Hành trình xuất sắc!" : careerMastery >= 60 ? "Bạn đang giữ nhịp tốt." : "Mỗi node là một bước tiến."}</strong><small> {careerMastery >= 60 ? "Cứ tiếp tục nhé!" : "Nova đồng hành cùng bạn."}</small></p></div>
      </footer>
    </section>
  );
}
