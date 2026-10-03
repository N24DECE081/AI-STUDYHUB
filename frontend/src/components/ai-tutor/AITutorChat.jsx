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
  const isMaster = props.permissions.multipleModels;
  const isLimitReached = Boolean(props.isLimitReached);

  return <section className="tutor-chat"><header className="tutor-chat-header"><button className="tutor-menu" onClick={props.onOpenSidebar}>☰</button><div><span className="tutor-overline">STUDYHUB AI</span><h1>AI Tutor <em>Nova</em></h1></div><div className="tutor-chat-controls">
    <label>Mức giải thích<select value={!isMaster && props.depth === 'deep' ? 'auto' : props.depth} onChange={(event) => {
      if (event.target.value === 'deep' && !isMaster) {
        window.alert("Mức giải thích Chuyên sâu yêu cầu Gói Master Thủ Khoa. Vui lòng nâng cấp gói để mở khóa!");
        props.onUpgrade?.();
        return;
      }
      props.onDepthChange(event.target.value);
    }} disabled={props.sending}>{DEPTHS.map(([value, label]) => <option key={value} value={value} disabled={value === 'deep' && !isMaster} title={value === 'deep' && !isMaster ? 'Nâng cấp để sử dụng' : undefined}>{value === 'deep' && !isMaster ? 'Chuyên sâu 🔒 (Cần Gói Master)' : label}</option>)}</select></label>
    {models.length ? <label title={!isMaster ? 'Nâng cấp để sử dụng' : undefined}>Model {!isMaster && "🔒"}<select title={!isMaster ? 'Nâng cấp để sử dụng' : undefined} value={isMaster ? props.model : 'auto'} onChange={(event) => {
      if (!isMaster) {
        window.alert("Tính năng Sử dụng nhiều mô hình AI chỉ dành riêng cho Gói Master Thủ Khoa. Vui lòng nâng cấp gói!");
        props.onUpgrade?.();
        return;
      }
      props.onModelChange(event.target.value);
    }} disabled={props.sending || !isMaster} style={!isMaster ? { opacity: 0.75, cursor: 'not-allowed' } : {}}><option value="auto">{!isMaster ? "Tự động (Khóa chọn model)" : "Tự động chuyển khi khả dụng"}</option>{models.map((item) => <option key={item} value={item} disabled={!isMaster}>{item} {!isMaster && "🔒"}</option>)}</select></label> : null}
  </div><span className={`tutor-status ${engine?.engine === 'local' || engine?.degraded ? 'offline' : ''}`} title={engine?.hint || ''}><i /> {status}</span></header>
    {props.permissions.tutor_limit !== null && (
      <div className="tutor-plan-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', padding: '7px 16px', background: isLimitReached ? 'var(--pink-soft)' : 'var(--mint-soft)', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-body)' }}>
        <span>{isLimitReached ? '🔒 ' : '⚡ '}Lượt AI Tutor {props.permissions.tutor_period === 'day' ? 'hôm nay' : 'tháng này'}: <strong>{props.permissions.tutor_used}/{props.permissions.tutor_limit}</strong></span>
        <button type="button" onClick={props.onUpgrade} style={{ border: 'none', background: 'var(--primary-pink)', color: 'var(--button-ink)', fontWeight: '700', padding: '3px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '11px' }}>Nâng cấp gói</button>
      </div>
    )}
    <p className="tutor-mode-note">Mức giải thích áp dụng cho tin nhắn tiếp theo; đổi lựa chọn không gửi lại câu hỏi và không làm mất hội thoại.</p>
    <div className="tutor-messages">{conversation.messages.map((message) => <AITutorMessage key={message.id} message={message} retryDisabled={isLimitReached} onRetry={() => props.onRetry(message)} />)}{props.sending && <div className="tutor-thinking"><i /><i /><i /> Nova đang suy nghĩ…</div>}<div ref={endRef} /></div>
    <AITutorInput {...props} disabled={props.sending || isLimitReached} />
  </section>;
}
