import { BookOpenIcon, RectangleStackIcon } from "@heroicons/react/24/outline";
import type { RoadmapType } from "./roadmap.types";

interface Props { value: RoadmapType | null; onChange: (value: RoadmapType) => void }

export default function TypeSelector({ value, onChange }: Props) {
  const options: Array<{ id: RoadmapType; title: string; description: string }> = [
    { id: "document", title: "Từ 1 tài liệu", description: "Upload hoặc chọn một tài liệu, Nova tạo lộ trình học cho riêng tài liệu đó." },
    { id: "subject", title: "Từ cả môn học", description: "Chọn nhiều tài liệu cùng môn, Nova gộp thành một lộ trình hoàn chỉnh." },
  ];
  return <fieldset className="rm-type-grid">
    <legend className="sr-only">Chọn loại lộ trình</legend>
    {options.map((option) => <label key={option.id} className={`rm-type-card ${value === option.id ? "is-selected" : ""}`}>
      <input type="radio" name="roadmap-type" value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
      <span className="rm-type-icon">{option.id === "document" ? <BookOpenIcon aria-hidden="true" /> : <RectangleStackIcon aria-hidden="true" />}</span>
      <strong>{option.title}</strong><small>{option.description}</small><i>{value === option.id ? "Đã chọn" : "Chọn loại này"}</i>
    </label>)}
  </fieldset>;
}
