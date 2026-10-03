import { useEffect, useRef } from 'react';
import AITutorFileUpload from './AITutorFileUpload';

export default function AITutorInput({ value, onChange, onSend, sending, disabled, uploadDisabled, files, onUpload, onRemove, maxFiles }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`; } }, [value]);
  return <form className="tutor-input-shell" title={disabled && !sending ? 'Nâng cấp để sử dụng' : undefined} onSubmit={(event) => { event.preventDefault(); if (!disabled) onSend(); }}>
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} disabled={sending || disabled} rows="1" placeholder="Hỏi Nova bất cứ điều gì: hỏi khái niệm, nhờ giải bài, xin gợi ý, tóm tắt tài liệu hay tạo quiz…" onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!disabled) onSend(); }
    }} />
    <div className="tutor-input-actions"><AITutorFileUpload onUpload={onUpload} disabled={sending || uploadDisabled} title={uploadDisabled ? 'Nâng cấp để sử dụng' : undefined} files={files} onRemove={onRemove} maxFiles={maxFiles} /><span className="tutor-keyboard-tip">Enter gửi · Shift + Enter xuống dòng</span><button className="tutor-send" title={disabled && !sending ? 'Nâng cấp để sử dụng' : undefined} disabled={sending || disabled || !value.trim()}>{sending ? 'Nova đang suy nghĩ…' : 'Gửi'}</button></div>
  </form>;
}
