import { useEffect, useRef } from 'react';
import AITutorFileUpload from './AITutorFileUpload';

// Một khung chat duy nhất: Nova tự đọc câu hỏi để quyết định giải thích, giải bài, gợi ý,
// tóm tắt hay tạo quiz. Các chip dưới đây chỉ là câu mẫu bấm nhanh (điền sẵn vào ô chat để
// người học sửa lại), không phải chế độ — chúng biến mất ngay khi hội thoại có tin nhắn.
const STARTERS = [
  'Stack là gì? Cho ví dụ.',
  'Giải bài này giúp mình: cho mảng [5, 2, 9, 1], sắp xếp tăng dần bằng nổi bọt.',
  'Gợi ý cho mình cách làm, đừng cho đáp án.',
  'Tóm tắt tài liệu mình đã tải lên.',
  'Tạo quiz 4 câu về Stack và Queue.',
];

export default function AITutorInput({ value, onChange, onSend, sending, files, onUpload, onRemove, showStarters }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`; } }, [value]);
  return <form className="tutor-input-shell" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
    {showStarters ? <div className="tutor-starters">{STARTERS.map((starter) => <button type="button" key={starter} onClick={() => onChange(starter)}>{starter}</button>)}</div> : null}
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} disabled={sending} rows="1" placeholder="Hỏi Nova bất cứ điều gì: hỏi khái niệm, nhờ giải bài, xin gợi ý, tóm tắt tài liệu hay tạo quiz…" onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); }
    }} />
    <div className="tutor-input-actions"><AITutorFileUpload onUpload={onUpload} disabled={sending} files={files} onRemove={onRemove} /><span className="tutor-keyboard-tip">Enter gửi · Shift + Enter xuống dòng</span><button className="tutor-send" disabled={sending || !value.trim()}>{sending ? 'Nova đang suy nghĩ…' : 'Gửi'}</button></div>
  </form>;
}
