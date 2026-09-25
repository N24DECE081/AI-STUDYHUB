import { useEffect, useRef } from 'react';
import AITutorFileUpload from './AITutorFileUpload';

export default function AITutorInput({ value, onChange, onSend, sending, files, onUpload, onRemove, maxFiles }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`; } }, [value]);
  return <form className="tutor-input-shell" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} disabled={sending} rows="1" placeholder="Hỏi Nova bất cứ điều gì: hỏi khái niệm, nhờ giải bài, xin gợi ý, tóm tắt tài liệu hay tạo quiz…" onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); }
    }} />
    <div className="tutor-input-actions"><AITutorFileUpload onUpload={onUpload} disabled={sending} files={files} onRemove={onRemove} maxFiles={maxFiles} /><span className="tutor-keyboard-tip">Enter gửi · Shift + Enter xuống dòng</span><button className="tutor-send" disabled={sending || !value.trim()}>{sending ? 'Nova đang suy nghĩ…' : 'Gửi'}</button></div>
  </form>;
}
