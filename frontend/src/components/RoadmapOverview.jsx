import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, File, FileText, Flame, Map, Pencil, Plus, Presentation, Sparkles, Upload } from "lucide-react";
import RoadmapLogo from "./RoadmapLogo";
import "./RoadmapOverview.css";

export function RoadmapStatChips({ items }) {
  return <dl className="roadmap-stat-chips">{items.map(({ icon: Icon, value, label }) =>
    <div key={label}><Icon size={17} aria-hidden="true" /><dd>{value}{" "}</dd><dt>{label}</dt></div>
  )}</dl>;
}

export function RoadmapBanner({ hasRoadmap, completed, topics, hours, documents, onCreate, onUpload, canCreate = true, canUpload = true }) {
  return <section className="roadmap-banner" aria-labelledby="learning-roadmap-title">
    <div className="roadmap-banner-content">
      <span className="roadmap-banner-badge"><Sparkles size={15} aria-hidden="true" /> LỘ TRÌNH TỪ TÀI LIỆU</span>
      <h1 id="learning-roadmap-title">Lộ trình học<span>Từ tài liệu đến mục tiêu</span></h1>
      <p>Biến tài liệu của bạn thành một hành trình học tập rõ ràng và phù hợp với thời gian của bạn.</p>
      <div className="roadmap-banner-actions">
        <button type="button" className="lr-btn roadmap-create-button" disabled={!canCreate} title={!canCreate ? 'Nâng cấp để sử dụng' : undefined} onClick={onCreate}><Plus size={18} /> Tạo lộ trình mới</button>
        {onUpload && <button type="button" className="lr-btn roadmap-upload-button" disabled={!canUpload} title={!canUpload ? 'Nâng cấp để sử dụng' : undefined} onClick={onUpload}><Upload size={17} /> Upload tài liệu</button>}
      </div>
      <RoadmapStatChips items={[
        { icon: Map, value: hasRoadmap ? 1 : 0, label: "lộ trình học" },
        { icon: CheckCircle2, value: completed + " / " + topics, label: "chủ đề hoàn thành" },
        { icon: Clock3, value: hours, label: "giờ dự kiến" },
        { icon: BookOpen, value: documents, label: "tài liệu nguồn" },
      ]} />
    </div>
    <div className="roadmap-banner-art"><RoadmapLogo size="lg" bare eager /></div>
  </section>;
}

export function DocumentThumbnail({ fileType, title }) {
  const type = String(fileType || "FILE").toUpperCase();
  const Icon = type.startsWith("PPT") ? Presentation : type === "TXT" ? File : FileText;
  const initials = title.trim().split(/\s+/).slice(0, 3).map(word => Array.from(word)[0]).join("").toLocaleUpperCase("vi");
  return <div className="roadmap-document-thumbnail" role="img" aria-label={"Tài liệu " + type + ": " + title}>
    <Icon size={52} aria-hidden="true" /><strong aria-hidden="true">{initials}</strong><span aria-hidden="true">{type}</span>
  </div>;
}

export function CurrentRoadmapCard({ title, description, fileType, completed, topics, documents, completedHours, totalHours, remainingHours, percentage, streak, progress, onRename, onContinue, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const save = event => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) { setError("Tên lộ trình không được để trống."); return; }
    onRename(name);
    setEditing(false);
    setError("");
  };
  return <article className="lr-roadmap-card roadmap-current-card">
    <DocumentThumbnail fileType={fileType} title={title} />
    <div className="roadmap-current-content">
      <div className="roadmap-current-badges">
        <span className="lr-status-pill">{percentage >= 100 ? "HOÀN THÀNH" : percentage > 0 ? "ĐANG HỌC" : "CHƯA BẮT ĐẦU"}</span>
        <span className="roadmap-current-streak"><Flame size={14} aria-hidden="true" /> {streak} ngày liên tiếp</span>
      </div>
      {editing ? <form className="roadmap-name-form" onSubmit={save}>
        <label htmlFor="roadmap-name">Tên lộ trình</label>
        <input id="roadmap-name" autoFocus value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "roadmap-name-error" : undefined} />
        <div><button type="submit" className="lr-btn roadmap-upload-button">Lưu tên</button><button type="button" className="lr-btn roadmap-upload-button" onClick={() => setEditing(false)}>Hủy</button></div>
        {error && <p id="roadmap-name-error" role="alert">{error}</p>}
      </form> : <div className="roadmap-current-title-row">
        <h2 className="lr-hero-title" title={title}>{title}</h2>
        <button type="button" className="roadmap-rename-button" aria-label="Đổi tên lộ trình" onClick={() => { setDraft(title); setError(""); setEditing(true); }}><Pencil size={17} /></button>
      </div>}
      {description && <p className="lr-hero-subtitle">{description}</p>}
      <div className="roadmap-current-nova"><Sparkles size={14} aria-hidden="true" /> {"Lộ trình " + (documents ? "từ tài liệu của bạn" : "theo môn học")}</div>
      <div className="roadmap-current-progress"><div><strong>Tiến độ học tập</strong><span>{completedHours} / {totalHours} giờ · {percentage}%</span></div>{progress}</div>
      <RoadmapStatChips items={[
        { icon: BookOpen, value: documents, label: "tài liệu nguồn" },
        { icon: CheckCircle2, value: completed + " / " + topics, label: "chủ đề hoàn thành" },
        { icon: Clock3, value: "Còn khoảng " + remainingHours + " giờ", label: "thời gian dự kiến" },
      ]} />
      <button type="button" className="lr-btn roadmap-continue-button" onClick={onContinue} title={disabled ? 'Nâng cấp để sử dụng' : undefined} disabled={disabled || !topics}>Tiếp tục học <ArrowRight size={16} /></button>
    </div>
  </article>;
}
