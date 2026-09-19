import { useEffect, useRef } from 'react';
import AITutorFileUpload from './AITutorFileUpload';

const MODES = [['explain', 'Giải thích'], ['solve', 'Giải bài'], ['hint', 'Gợi ý'], ['summarize', 'Tóm tắt'], ['generate_quiz', 'Tạo quiz']];

export default function AITutorInput({ value, onChange, onSend, mode, setMode, sending, files, onUpload, onRemove }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`; } }, [value]);
  return <form className="tutor-input-shell" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
    <div className="tutor-mode-row">{MODES.map(([id, label]) => <button type="button" key={id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>{label}</button>)}</div>
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} disabled={sending} rows="1" placeholder="Hỏi Nova về tài liệu hoặc bài học của bạn…" onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); }
    }} />
    <div className="tutor-input-actions"><AITutorFileUpload onUpload={onUpload} disabled={sending} files={files} onRemove={onRemove} /><span className="tutor-keyboard-tip">Enter gửi · Shift + Enter xuống dòng</span><button className="tutor-send" disabled={sending || !value.trim()}>{sending ? 'Nova đang suy nghĩ…' : 'Gửi'}</button></div>
  </form>;
}
