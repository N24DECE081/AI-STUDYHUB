import { useEffect, useRef } from "react";
import { ArrowTopRightOnSquareIcon, BookOpenIcon, CheckIcon, QuestionMarkCircleIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Material, RoadmapStep } from "./roadmap.types";

interface Props {
  step: RoadmapStep | null;
  materials: Material[];
  onClose: () => void;
  onComplete: (step: RoadmapStep) => void;
  onAskNova: () => void;
  onStudy?: () => void;
  onQuiz?: () => void;
}

export default function TopicDrawer({ step, materials, onClose, onComplete, onAskNova, onStudy, onQuiz }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!step) return undefined;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, onClose]);
  if (!step) return null;
  const progress = step.status === "completed" ? 100 : 35;
  return <div className="rm-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="rm-drawer" role="dialog" aria-modal="true" aria-labelledby="topic-drawer-title">
      <header><div><span className="rm-kicker">CHỦ ĐỀ {String(step.order).padStart(2, "0")}</span><h2 id="topic-drawer-title">{step.title}</h2></div><button ref={closeRef} type="button" className="rm-icon-button" onClick={onClose} aria-label="Đóng chi tiết chủ đề"><XMarkIcon aria-hidden="true" /></button></header>
      <section><div className="rm-progress-copy"><strong>Tiến độ chủ đề</strong><span>{progress}%</span></div><progress max="100" value={progress} /></section>
      <section><span className="rm-kicker">MỤC TIÊU HỌC</span><ul className="rm-objectives">{step.objectives.map((item) => <li key={item}><CheckIcon aria-hidden="true" />{item}</li>)}</ul></section>
      <section><span className="rm-kicker">NGUỒN TÀI LIỆU</span><div className="rm-drawer-sources">{step.sources.map((source) => <button type="button" key={source.materialId} onClick={onStudy}><ArrowTopRightOnSquareIcon aria-hidden="true" /><span><strong>{materials.find((item) => item.id === source.materialId)?.name}</strong><small>{source.chapterRange || "Phần liên quan"}</small></span></button>)}</div></section>
      <div className="rm-drawer-actions">
        <button type="button" className="btn btn-primary" onClick={onStudy}><BookOpenIcon aria-hidden="true" />Học nội dung</button>
        <button type="button" className="btn btn-outline" onClick={onAskNova}><SparklesIcon aria-hidden="true" />Hỏi Nova</button>
        <button type="button" className="btn btn-outline" onClick={onQuiz}><QuestionMarkCircleIcon aria-hidden="true" />Làm Quiz</button>
        <button type="button" className="btn btn-ghost" disabled={step.status === "completed"} onClick={() => onComplete(step)}><CheckIcon aria-hidden="true" />{step.status === "completed" ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}</button>
      </div>
    </aside>
  </div>;
}
