import { useEffect, useRef } from 'react';
import AITutorMessage from './AITutorMessage';
import AITutorInput from './AITutorInput';

const DEPTHS = [['auto', 'Tự động'], ['basic', 'Cơ bản'], ['standard', 'Tiêu chuẩn'], ['deep', 'Chuyên sâu']];

export default function AITutorChat({ conversation, ...props }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [conversation.messages.length, props.sending]);
  const engine = props.engine;
  const status = engine ? engine.label : 'Sẵn sàng hỗ trợ';
  const models = Array.isArray(engine?.models) ? engine.models : [];
  return <section className="tutor-chat"><header className="tutor-chat-header"><button className="tutor-menu" onClick={props.onOpenSidebar}>☰</button><div><span className="tutor-overline">STUDYHUB AI</span><h1>AI Tutor <em>Nova</em></h1></div><div className="tutor-chat-controls">
    <label>Mức giải thích<select value={props.depth} onChange={(event) => props.onDepthChange(event.target.value)} disabled={props.sending}>{DEPTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {models.length ? <label>Model<select value={props.model} onChange={(event) => props.onModelChange(event.target.value)} disabled={props.sending}><option value="auto">Tự động chuyển khi khả dụng</option>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
  </div><span className={`tutor-status ${engine?.engine === 'local' || engine?.degraded ? 'offline' : ''}`} title={engine?.hint || ''}><i /> {status}</span></header>
    <p className="tutor-mode-note">Mức giải thích áp dụng cho tin nhắn tiếp theo; đổi lựa chọn không gửi lại câu hỏi và không làm mất hội thoại.</p>
    <div className="tutor-messages">{conversation.messages.map((message) => <AITutorMessage key={message.id} message={message} onRetry={() => props.onRetry(message)} />)}{props.sending && <div className="tutor-thinking"><i /><i /><i /> Nova đang suy nghĩ…</div>}<div ref={endRef} /></div>
    <AITutorInput {...props} />
  </section>;
}
