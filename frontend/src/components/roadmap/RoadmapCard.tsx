import { ArrowRightIcon, BookOpenIcon, ClockIcon, DocumentIcon, RectangleStackIcon } from "@heroicons/react/24/outline";
import type { Roadmap } from "./roadmap.types";
import { formatHours } from "./roadmap.logic";

interface Props { roadmap: Roadmap; onOpen: (roadmap: Roadmap) => void }

export default function RoadmapCard({ roadmap, onOpen }: Props) {
  const percent = Math.min(100, Math.round(roadmap.hoursDone * 100 / roadmap.totalHours));
  const completed = roadmap.steps.filter((step) => step.status === "completed").length;
  const remainingWeeks = Math.max(0, Math.ceil((roadmap.totalHours - roadmap.hoursDone) / (roadmap.daysPerWeek * roadmap.hoursPerDay)));
  return <article className="rm-roadmap-card">
    <div className="rm-card-head">
      <span className={`rm-type-badge is-${roadmap.type}`}>{roadmap.type === "document" ? <DocumentIcon aria-hidden="true" /> : <RectangleStackIcon aria-hidden="true" />}{roadmap.type === "document" ? "TÀI LIỆU" : "MÔN HỌC"}</span>
      <span className={`rm-status is-${roadmap.status}`}>{roadmap.status === "completed" ? "Hoàn thành" : "Đang học"}</span>
    </div>
    <h2>{roadmap.title}</h2>
    <p className="rm-source-line"><BookOpenIcon aria-hidden="true" />{roadmap.type === "document" ? roadmap.sources[0]?.name : `${roadmap.subject} · ${roadmap.sources.length} tài liệu`}</p>
    <div className="rm-progress-copy"><strong>{formatHours(roadmap.hoursDone)} / {formatHours(roadmap.totalHours)}</strong><span>{percent}%</span></div>
    <progress max="100" value={percent} aria-label={`Tiến độ ${percent}%`} />
    <dl className="rm-card-stats">
      <div><dt>Chủ đề</dt><dd>{completed}/{roadmap.steps.length}</dd></div>
      <div><dt>Nguồn</dt><dd>{roadmap.sources.length}</dd></div>
      <div><dt><ClockIcon aria-hidden="true" /> Còn lại</dt><dd>{remainingWeeks} tuần</dd></div>
    </dl>
    <button type="button" className="btn btn-primary full" onClick={() => onOpen(roadmap)}>Tiếp tục học <ArrowRightIcon aria-hidden="true" /></button>
  </article>;
}
