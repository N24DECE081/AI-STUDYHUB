import { DocumentIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { Material } from "./roadmap.types";

interface Props {
  materials: Material[];
  selected: string[];
  multiple?: boolean;
  query: string;
  onQuery: (value: string) => void;
  onToggle: (id: string) => void;
}

export default function MaterialList({ materials, selected, multiple = false, query, onQuery, onToggle }: Props) {
  return <div className="rm-material-list">
    <label className="rm-search"><MagnifyingGlassIcon aria-hidden="true" /><span className="sr-only">Tìm tài liệu</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Tìm theo tên tài liệu…" /></label>
    <div role={multiple ? "group" : "radiogroup"} aria-label="Danh sách tài liệu">
      {materials.length ? materials.map((material) => <label key={material.id} className={`rm-material-row ${selected.includes(material.id) ? "is-selected" : ""}`}>
        <input type={multiple ? "checkbox" : "radio"} name={multiple ? undefined : "material"} checked={selected.includes(material.id)} onChange={() => onToggle(material.id)} />
        <span className={`rm-file-icon is-${material.type}`}><DocumentIcon aria-hidden="true" /><small>{material.type}</small></span>
        <span><strong>{material.name}</strong><small>{material.subject} · {material.chapters} chương</small></span>
      </label>) : <p className="rm-empty-small">Không tìm thấy tài liệu phù hợp.</p>}
    </div>
  </div>;
}
