import { useEffect, useRef, useState } from "react";
import { ArrowPathIcon, ArrowUpTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { createSubject, getSubjects, uploadDocument } from "../../api";
import type { Material, MaterialType } from "./roadmap.types";

interface Props { subject?: string; onComplete: (material: Material) => void }
const TYPES: MaterialType[] = ["pdf", "docx", "pptx", "txt"];
const errorMessage = (error: unknown) => {
  const text = String((error as Error)?.message || error || "");
  if (/network|fetch|mạng/i.test(text)) return "Mất mạng. File chưa được tải lên.";
  if (/password|encrypted|locked|hỏng|corrupt/i.test(text)) return "File hỏng hoặc bị khóa mật khẩu.";
  return text || "Không thể xử lý tài liệu. Vui lòng thử lại.";
};

export default function MaterialUploader({ subject = "", onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(new Set<string>());
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<(Material & { file: File })[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectCode, setSubjectCode] = useState("");
  const [newSubject, setNewSubject] = useState("");
  useEffect(() => { getSubjects().then((rows) => { setSubjects(rows); const selected = rows.find((row: any) => row.name === subject) || rows[0]; setSubjectCode(selected?.code || ""); }).catch(() => undefined); }, [subject]);

  const run = async (item: Material & { file: File }) => {
    if (!subjectCode) { setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "failed", error: "Hãy chọn hoặc tạo môn học trước." } : row)); return; }
    const tick = window.setInterval(() => setItems((current) => current.map((row) => row.id === item.id && row.status === "uploading" ? { ...row, progress: Math.min(90, (row.progress || 0) + 8) } : row)), 250);
    try {
      const document = await uploadDocument({ file: item.file, title: item.name.replace(/\.[^.]+$/, ""), description: "", subjectCode });
      window.clearInterval(tick); if (cancelled.current.has(item.id)) return;
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "processing", progress: 100 } : row));
      const ready: Material = { id: `library-${document.id}`, name: document.original_filename || item.name, type: item.type, chapters: Number(document.page_count || 1), subject: document.subject_name || item.subject, status: "ready", progress: 100 };
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...ready, file: item.file } : row)); onComplete(ready);
    } catch (error) { window.clearInterval(tick); if (!cancelled.current.has(item.id)) setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "failed", error: errorMessage(error) } : row)); }
  };
  const add = (files: FileList | File[]) => Array.from(files).forEach((file) => {
    const type = file.name.split(".").pop()?.toLowerCase() as MaterialType;
    const error = !TYPES.includes(type) ? "Sai định dạng. Chỉ hỗ trợ PDF, DOCX, PPTX, TXT." : file.size > 50 * 1024 * 1024 ? "File vượt quá dung lượng tối đa 50MB." : file.size === 0 ? "File rỗng hoặc bị hỏng." : "";
    const item = { id: crypto.randomUUID(), name: file.name, type, chapters: 0, subject: subjects.find((row) => row.code === subjectCode)?.name || subject || "Chưa phân loại", status: error ? "failed" as const : "uploading" as const, progress: 0, error, file };
    setItems((current) => [...current, item]); if (!error) run(item);
  });
  const create = async () => {
    const name = newSubject.trim(); if (!name) return;
    const code = `SUB-${Date.now()}`; const created = await createSubject({ name, code, description: "" });
    setSubjects((current) => [...current, created]); setSubjectCode(created.code || code); setNewSubject("");
  };

  return <div className="rm-uploader">
    <div className="rm-upload-subject"><select aria-label="Môn học của tài liệu" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)}><option value="">Chọn môn học</option>{subjects.map((row) => <option key={row.id || row.code} value={row.code}>{row.name}</option>)}</select><input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="Tạo môn mới" /><button type="button" className="btn btn-outline" onClick={create} disabled={!newSubject.trim()}>Thêm môn</button></div>
    <input ref={inputRef} type="file" accept=".pdf,.docx,.pptx,.txt" multiple hidden onChange={(event) => event.target.files && add(event.target.files)} />
    <button type="button" className={`rm-dropzone ${dragging ? "is-dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}><ArrowUpTrayIcon aria-hidden="true" /><strong>Kéo thả tài liệu vào đây</strong><span>hoặc bấm để chọn nhiều file · PDF, DOCX, PPTX, TXT · tối đa 50MB/file</span></button>
    {items.map((item) => <div className="rm-upload-status" key={item.id} role="status"><div><strong>{item.name}</strong><span>{item.status === "uploading" ? `${item.progress || 0}%` : item.status === "processing" ? "Nova đang đọc tài liệu..." : item.status === "ready" ? "Sẵn sàng" : item.error}</span></div>{item.status === "uploading" && <progress max="100" value={item.progress} />}{item.status === "failed" && <button type="button" className="btn btn-outline" onClick={() => { setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "uploading", error: "", progress: 0 } : row)); run(item); }}><ArrowPathIcon aria-hidden="true" />Thử lại</button>}<button type="button" className="rm-icon-button" aria-label={`Huỷ ${item.name}`} onClick={() => { cancelled.current.add(item.id); setItems((current) => current.filter((row) => row.id !== item.id)); }}><XMarkIcon aria-hidden="true" /></button></div>)}
  </div>;
}
