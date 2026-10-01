import { CheckIcon, ClockIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import type { Material, RoadmapStep, RoadmapType } from "./roadmap.types";
import { formatHours } from "./roadmap.logic";

interface Props { step: RoadmapStep; type: RoadmapType; materials: Material[]; onOpen: (step: RoadmapStep) => void }

export default function TimelineStepCard({ step, type, materials, onOpen }: Props) {
  const icon = step.status === "completed" ? <CheckIcon aria-hidden="true" /> : step.status === "locked" ? <LockClosedIcon aria-hidden="true" /> : step.order;
  return <article className={`rm-timeline-step is-${step.status}`}>
    <div className="rm-step-marker" aria-hidden="true">{icon}</div>
    <button type="button" onClick={() => onOpen(step)} disabled={step.status === "locked"} aria-label={`${step.title}${step.status === "locked" ? ", đã khóa" : ""}`}>
      <span className="rm-kicker">STEP {String(step.order).padStart(2, "0")} · {step.status === "completed" ? "ĐÃ HOÀN THÀNH" : step.status === "in_progress" ? "ĐANG HỌC" : "ĐÃ KHÓA"}</span>
      <strong>{step.title}</strong><p>{step.description}</p>
      <div className="rm-step-meta"><span><ClockIcon aria-hidden="true" />{formatHours(step.durationHours)}</span>
        {type === "document" ? <span>{step.sources[0]?.chapterRange}</span> : <span className="rm-source-chips">{step.sources.map((source) => <i key={source.materialId}>{materials.find((item) => item.id === source.materialId)?.name || "Tài liệu"}</i>)}</span>}
      </div>
    </button>
  </article>;
}
