import { useMemo, useState } from "react";
import { ArrowRightIcon, CheckIcon, ClockIcon, SparklesIcon } from "@heroicons/react/24/outline";

const TRACKS = [
  {
    id: "mvp",
    badge: "CẤP ĐỘ 1 · MVP",
    title: "Lộ trình cơ bản",
    subtitle: "Từ tài liệu đến bài kiểm tra 30 câu",
    description: "Chuẩn hóa kho học liệu, tạo Quiz Card theo môn và nhìn thấy tiến bộ sau từng lần làm bài.",
    accent: "indigo",
    focus: ["Upload & phân loại tài liệu", "Quiz Card tối đa 30 câu", "Chấm điểm và giải thích"],
  },
  {
    id: "active",
    badge: "CẤP ĐỘ 2 · HỌC CHỦ ĐỘNG",
    title: "Sinh viên năm 2–3",
    subtitle: "Mindmap + Micro-learning theo tuần",
    description: "Gom nhóm tri thức, xác định điểm yếu và chia mục tiêu thành nhịp học nhỏ mỗi ngày.",
    accent: "teal",
    focus: ["Mục tiêu điểm số & ngày thi", "Mindmap ghi nhớ sâu", "Quiz 10–30 câu theo phạm vi"],
  },
  {
    id: "advanced",
    badge: "CẤP ĐỘ 3 · POST-MVP",
    title: "Lộ trình nâng cao",
    subtitle: "Cá nhân hóa và lặp lại ngắt quãng",
    description: "Mở rộng từ Quiz thích ứng đến thống kê ma trận kiến thức và nhắc ôn theo 3–7–14 ngày.",
    accent: "amber",
    focus: ["Quiz theo độ khó", "Mindmap đổi màu theo điểm yếu", "Spaced repetition"],
  },
];

export default function LearningRoadmapPage({ documents = [], subjects = [], progress = [] }) {
  const [track, setTrack] = useState("active");
  const [centralTopic, setCentralTopic] = useState("");
  const [mainBranchesInput, setMainBranchesInput] = useState("");
  const [subBranchesInput, setSubBranchesInput] = useState("");
  const [targetScore, setTargetScore] = useState("8.0");
  const [daysLeft, setDaysLeft] = useState("14");
  const [weakTopic, setWeakTopic] = useState("");
  const [checked, setChecked] = useState([]);
  const activeTrack = TRACKS.find((item) => item.id === track) || TRACKS[1];
  const topicOptions = useMemo(() => [...new Set([...subjects.map((subject) => subject.name), ...documents.map((document) => document.subject_name)].filter(Boolean))], [documents, subjects]);
  const branchNames = useMemo(() => mainBranchesInput.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 4), [mainBranchesInput]);
  const subBranchNames = useMemo(() => subBranchesInput.split(",").map((value) => value.trim()).filter(Boolean), [subBranchesInput]);
  const mindmapBranches = useMemo(() => branchNames.map((title, index) => ({ title, tone: ["violet", "blue", "teal", "orange"][index], children: subBranchNames.filter((_, childIndex) => childIndex % Math.max(branchNames.length, 1) === index) })), [branchNames, subBranchNames]);
  const weeks = useMemo(() => {
    const topic = centralTopic.trim() || "môn học của bạn";
    return [
      { title: "Tuần 1", label: `Nền tảng ${topic}`, tone: "teal", days: [["Ngày 1–2", `Đọc tài liệu ${topic}`, "Ghi lại khái niệm chính"], ["Ngày 3–4", "Hoàn thiện Mindmap", "Kết nối các nhánh kiến thức"], ["Ngày 5", "Quiz Card tổng hợp Tuần 1", "Tối đa 20 câu"]] },
      { title: "Tuần 2", label: `Củng cố & luyện đề ${topic}`, tone: "violet", days: [["Ngày 6–7", `Khắc phục điểm yếu: ${weakTopic || "chủ đề cần ôn"}`, "Làm bài tập theo tài liệu"], ["Ngày 8–9", "Ôn lại nhánh kiến thức khó", "Đọc lại đoạn chưa chắc"], ["Ngày 10", "Quiz Card tổng hợp Tuần 2", "Tối đa 20 câu"], ["Ngày 11–12", "Tổng duyệt Mindmap & thi thử", "Chữa lỗi theo nguồn tài liệu"]] },
    ];
  }, [centralTopic, weakTopic]);
  const completeCount = checked.length;
  const totalDays = 7;
  const progressByDocument = useMemo(
    () => new Map(progress.map((item) => [String(item.documentId), Number(item.percent || 0)])),
    [progress],
  );
  const selectedSubject = useMemo(() => {
    const normalized = centralTopic.trim().toLocaleLowerCase("vi");
    return subjects.find((subject) =>
      [subject.name, subject.code].some((value) => String(value || "").toLocaleLowerCase("vi") === normalized),
    );
  }, [centralTopic, subjects]);
  const subjectDocuments = useMemo(() => {
    if (!centralTopic.trim()) return [];
    return documents.filter((document) =>
      selectedSubject
        ? String(document.subject_code) === String(selectedSubject.code)
        : String(document.subject_name || "").toLocaleLowerCase("vi") === centralTopic.trim().toLocaleLowerCase("vi"),
    );
  }, [centralTopic, documents, selectedSubject]);
  const destinyNodes = useMemo(() => {
    const documentNodes = subjectDocuments.map((document, index) => {
      const percent = progressByDocument.get(String(document.id)) || 0;
      const previous = index ? subjectDocuments[index - 1] : null;
      const previousPercent = previous ? progressByDocument.get(String(previous.id)) || 0 : 100;
      return {
        id: `document-${document.id}`,
        title: document.title,
        type: index % 3 === 2 ? "PRACTICE" : "DOCUMENT",
        progress: percent,
        status: percent >= 100 ? "completed" : previousPercent >= 60 ? "unlocked" : "locked",
      };
    });
    return [
      { id: "start", title: centralTopic.trim() ? `Bắt đầu ${centralTopic.trim()}` : "Chọn môn học", type: "START", progress: 100, status: "completed" },
      ...documentNodes,
      { id: "boss", title: `Final Boss · ${centralTopic.trim() || "Môn học"}`, type: "BOSS", progress: 0, status: documentNodes.length && documentNodes.every((node) => node.progress >= 60) ? "unlocked" : "locked" },
    ];
  }, [centralTopic, progressByDocument, subjectDocuments]);
  const petState = destinyNodes.some((node) => node.status === "unlocked") ? "FOLLOW" : centralTopic ? "THINK" : "IDLE";

  const toggleDay = (day) => setChecked((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);

  return (
    <section className="roadmap-page" aria-labelledby="roadmap-title">
      <header className="roadmap-hero">
        <div className="roadmap-hero__copy">
          <span className="roadmap-pill"><SparklesIcon aria-hidden="true" /> Lộ trình học chuẩn đại học</span>
          <h1 id="roadmap-title">Lộ trình học tập từ cơ bản đến nâng cao</h1>
          <p>Biến tài liệu rời rạc thành Mindmap, nhịp học theo ngày và những mốc Quiz Card rõ ràng để bạn biết hôm nay cần hoàn thành gì.</p>
        </div>
        <button type="button" className="roadmap-hero__action" onClick={() => document.querySelector(".roadmap-planner")?.scrollIntoView({ behavior: "smooth" })}><SparklesIcon aria-hidden="true" /> Tạo lộ trình riêng</button>
      </header>

      <nav className="roadmap-track-tabs" aria-label="Ba lộ trình ôn tập">
        {TRACKS.map((item) => <button type="button" aria-pressed={track === item.id} className={`roadmap-track-tab ${track === item.id ? "is-active" : ""} ${item.accent}`} key={item.id} onClick={() => setTrack(item.id)}><span>{item.badge}</span><strong>{item.title}</strong><small>{item.subtitle}</small></button>)}
      </nav>

      <div className="roadmap-grid">
        <section className="roadmap-panel roadmap-mindmap-panel" aria-labelledby="mindmap-heading">
          <div className="roadmap-section-heading"><div><span className="eyebrow">A · GHI NHỚ SÂU</span><h2 id="mindmap-heading">Sơ đồ tư duy môn học</h2><p>Central Topic → Main Branches → Keywords → câu hỏi dễ sai.</p></div><input className="roadmap-topic-inline" list="roadmap-subject-options" value={centralTopic} onChange={(event) => setCentralTopic(event.target.value)} placeholder="Nhập môn học" aria-label="Chủ đề trung tâm" /></div>
          <div className="mindmap-canvas">
            <svg className="mindmap-lines" viewBox="0 0 800 390" aria-hidden="true"><path d="M400 195 C270 125 215 75 120 68" /><path d="M400 195 C535 125 585 75 680 68" /><path d="M400 195 C270 265 215 315 120 322" /><path d="M400 195 C535 265 585 315 680 322" /></svg>
            <div className={`mindmap-root ${!centralTopic.trim() ? "is-empty" : ""}`}><span>CHỦ ĐỀ TRUNG TÂM</span><strong>{centralTopic.trim() || "Nhập môn học của bạn"}</strong><small>{daysLeft} ngày · mục tiêu {targetScore}/10</small></div>
            {mindmapBranches.map((branch, index) => <article className={`mindmap-branch ${branch.tone} branch-${index + 1}`} key={`${branch.title}-${index}`}><strong>{branch.title}</strong><ul>{(branch.children.length ? branch.children : ["Chưa có từ khóa — nhập ở phần thiết lập"]).map((child) => <li key={child}>{child}</li>)}</ul></article>)}
            {!mindmapBranches.length && <p className="mindmap-empty-note">Nhập các nhánh chính, phân cách bằng dấu phẩy, để tạo sơ đồ của riêng bạn.</p>}
          </div>
        </section>

        <form className="roadmap-panel roadmap-planner" aria-labelledby="planner-heading" onSubmit={(event) => { event.preventDefault(); setChecked([]); }}>
          <span className="eyebrow">MỤC TIÊU ĐẦU VÀO</span><h2 id="planner-heading">Thiết lập nhịp học</h2><p className="muted">Lộ trình sẽ chia khối lượng tài liệu theo thời gian còn lại và điểm yếu hiện tại.</p>
          <label htmlFor="roadmap-topic">Chủ đề / môn học<input id="roadmap-topic" list="roadmap-subject-options" value={centralTopic} onChange={(event) => setCentralTopic(event.target.value)} placeholder="Nhập tên môn học" /><datalist id="roadmap-subject-options">{topicOptions.map((topic) => <option value={topic} key={topic} />)}</datalist></label>
          <label htmlFor="roadmap-branches">Nhánh chính<input id="roadmap-branches" value={mainBranchesInput} onChange={(event) => setMainBranchesInput(event.target.value)} placeholder="VD: Chương 1, Chương 2, Bài tập" /></label>
          <label htmlFor="roadmap-keywords">Từ khóa / công thức<input id="roadmap-keywords" value={subBranchesInput} onChange={(event) => setSubBranchesInput(event.target.value)} placeholder="VD: định nghĩa, công thức, ví dụ" /></label>
          <label htmlFor="roadmap-score">Mục tiêu điểm số<select id="roadmap-score" value={targetScore} onChange={(event) => setTargetScore(event.target.value)}><option>6.5</option><option>7.5</option><option>8.0</option><option>9.0</option></select></label>
          <label htmlFor="roadmap-days">Còn lại trước ngày thi<select id="roadmap-days" value={daysLeft} onChange={(event) => setDaysLeft(event.target.value)}><option value="7">7 ngày</option><option value="14">14 ngày</option><option value="21">21 ngày</option><option value="30">30 ngày</option></select></label>
          <label htmlFor="roadmap-weak-topic">Điểm yếu hiện tại<input id="roadmap-weak-topic" value={weakTopic} onChange={(event) => setWeakTopic(event.target.value)} placeholder="VD: Bộ nhớ Cache" /></label>
          <div className="planner-summary" aria-live="polite"><span>Đã cấu hình</span><strong>{centralTopic.trim() || "Chưa nhập môn học"} · {daysLeft} ngày</strong><small>Ưu tiên khắc phục: {weakTopic.trim() || "Chưa chọn điểm yếu"}</small></div>
          <button type="submit" className="btn btn-primary full">Áp dụng lộ trình <ArrowRightIcon aria-hidden="true" /></button>
        </form>
      </div>

      <section className="roadmap-panel roadmap-weeks" aria-labelledby="micro-learning-heading">
        <div className="roadmap-section-heading"><div><span className="eyebrow">B · MICRO-LEARNING</span><h2 id="micro-learning-heading">{activeTrack.title}: chia nhỏ theo tuần & ngày</h2><p>{activeTrack.description}</p></div><div className="roadmap-progress" aria-live="polite"><strong>{completeCount}/{totalDays}</strong><span>mốc đã hoàn thành</span><progress value={completeCount} max={totalDays} aria-label={`${completeCount} trên ${totalDays} mốc đã hoàn thành`} /></div></div>
        <div className="week-grid">{weeks.map((week) => <article className={`week-card ${week.tone}`} key={week.title}><div className="week-card__header"><div><span>{week.title}</span><h3>{week.label}</h3></div><ClockIcon aria-hidden="true" /></div><div className="week-day-list">{week.days.map(([day, title, detail]) => <label className={`week-day ${checked.includes(day) ? "is-done" : ""}`} key={day}><input type="checkbox" checked={checked.includes(day)} onChange={() => toggleDay(day)} /><span className="week-day__marker">{checked.includes(day) ? <CheckIcon aria-hidden="true" /> : day.slice(-1)}</span><span><strong>{day}</strong><b>{title}</b><small>{detail}</small></span></label>)}</div></article>)}</div>
      </section>

      <section className="roadmap-panel destiny-map" aria-labelledby="destiny-map-heading">
        <div className="roadmap-section-heading">
          <div><span className="eyebrow">PERSONALIZED PATH</span><h2 id="destiny-map-heading">Your destiny · {centralTopic || "chọn một môn học"}</h2><p>Các node được dựng từ chính tài liệu và tiến độ của tài khoản hiện tại.</p></div>
          <div className={`roadmap-pet is-${petState.toLowerCase()}`} aria-label={`Tiểu Hắc đang ở trạng thái ${petState}`}><span>🐈‍⬛</span><strong>Tiểu Hắc · {petState}</strong><small>{petState === "FOLLOW" ? "Nice! Let's continue." : petState === "THINK" ? "Đang phân tích kho tài liệu..." : "Ready to begin?"}</small></div>
        </div>
        <div className="destiny-node-list">
          {destinyNodes.map((node, index) => (
            <article className={`destiny-node is-${node.status} type-${node.type.toLowerCase()}`} key={node.id}>
              <span>{index ? String(index).padStart(2, "0") : "🏠"}</span>
              <div><small>{node.type}</small><strong>{node.title}</strong><progress value={node.progress} max="100" /><em>{node.status === "locked" ? "Đang khóa · hoàn thành node trước ≥ 60%" : `${node.progress}% mastery`}</em></div>
            </article>
          ))}
        </div>
        {centralTopic && !subjectDocuments.length && <p className="empty-state">Môn này chưa có tài liệu. Hãy upload tài liệu vào Vault để sinh node học tập.</p>}
      </section>

      <section className={`roadmap-panel roadmap-focus ${activeTrack.accent}`}><div><span className="eyebrow">LỘ TRÌNH ĐANG CHỌN</span><h2>{activeTrack.title}</h2><p>{activeTrack.subtitle}. Các mốc chính được thiết kế để đi từ hiểu bản chất đến tự kiểm tra.</p></div><div className="roadmap-focus-list">{activeTrack.focus.map((item, index) => <span key={item}><strong>0{index + 1}</strong>{item}</span>)}</div></section>
    </section>
  );
}
