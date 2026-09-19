import { useEffect, useMemo, useRef, useState } from 'react';
import { askTutor } from '../api';
import './AiTutorLayer.css';

const STORAGE_KEY = 'studyhub-ai-conversations';
const newConversation = () => ({
  id: crypto.randomUUID(),
  title: 'Cuộc trò chuyện mới',
  messages: [{ id: crypto.randomUUID(), role: 'assistant', text: 'Chào bạn, mình là Nova — trợ lý học tập của StudyHub. Mình có thể giải thích, tạo quiz hoặc lập kế hoạch học.' }],
});

function NovaMark() {
  return <svg className="nova-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 20 12l10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" /><circle cx="16" cy="16" r="3.2" /></svg>;
}

function RichReply({ text }) {
  const lower = text.toLowerCase();
  const showPlan = lower.includes('kế hoạch') || lower.includes('25 phút');
  const showQuiz = lower.includes('quiz') || lower.includes('câu hỏi');
  return <div className="ai-rich-reply"><p>{text}</p>{showPlan && <div className="ai-plan-card"><strong>Phiên tập trung · 25 phút</strong><span>05' xem lại khái niệm</span><span>15' thực hành có hướng dẫn</span><span>05' tự kiểm tra & ghi chú</span></div>}{showQuiz && <div className="ai-quiz-card"><span>QUICK QUIZ</span><strong>Bạn muốn bắt đầu với 5 câu hỏi hay flashcards?</strong><div><button type="button">5 câu hỏi</button><button type="button">Flashcards</button></div></div>}</div>;
}

export default function AiTutorLayer({ activeView, selectedDocument, user }) {
  const [mode, setMode] = useState('closed');
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [newConversation()]; } catch { return [newConversation()]; }
  });
  const [activeId, setActiveId] = useState(() => conversations[0]?.id);
  const scrollRef = useRef(null);
  const active = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [conversations, activeId]);
  const suggestions = {
    home: ['Lập kế hoạch học hôm nay', 'Gợi ý tài liệu nên bắt đầu'],
    library: ['Tóm tắt tài liệu đang chọn', 'Tạo 5 câu quiz ôn tập'],
    dashboard: ['Phân tích tiến độ của tôi', 'Lập phiên học 25 phút'],
    pricing: ['Gói nào phù hợp với tôi?', 'So sánh các gói học'],
  }[activeView] || [];

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { if (mode !== 'closed') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages.length, mode]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && mode === 'fullscreen') setMode('sidebar'); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const startConversation = () => { const conversation = newConversation(); setConversations((items) => [conversation, ...items]); setActiveId(conversation.id); return conversation.id; };
  const send = async (event) => {
    event?.preventDefault(); const question = draft.trim();
    if (!question) return setMode('sidebar');
    setMode((current) => current === 'closed' ? 'sidebar' : current);
    const conversationId = active?.id || startConversation(); const answerId = crypto.randomUUID();
    setConversations((items) => items.map((item) => item.id !== conversationId ? item : { ...item, title: item.messages.length <= 1 ? question.slice(0, 42) : item.title, messages: [...item.messages, { id: crypto.randomUUID(), role: 'user', text: question }, { id: answerId, role: 'assistant', text: 'Nova đang phân tích…', loading: true }] }));
    setDraft('');
    try {
      const response = await askTutor({ documentId: selectedDocument?.serverId, question });
      setConversations((items) => items.map((item) => item.id !== conversationId ? item : { ...item, messages: item.messages.map((message) => message.id === answerId ? { ...message, text: response.answer, loading: false } : message) }));
    } catch {
      const context = selectedDocument ? ` về ${selectedDocument.title}` : '';
      setConversations((items) => items.map((item) => item.id !== conversationId ? item : { ...item, messages: item.messages.map((message) => message.id === answerId ? { ...message, text: `Mình chưa kết nối được AI Tutor${context}. Bạn có thể bắt đầu bằng 3 ý chính, một ví dụ minh hoạ và 5 câu hỏi tự kiểm tra.`, loading: false } : message) }));
    }
  };
  const applySuggestion = (text) => { setDraft(text); setMode('sidebar'); };

  return <>
    <form className={`ai-dock ${mode !== 'closed' ? 'is-open' : ''}`} onSubmit={send}>
      <NovaMark /><div><span>Hỏi Nova</span><input value={draft} onFocus={() => setMode('sidebar')} onChange={(e) => setDraft(e.target.value)} placeholder={selectedDocument ? `Hỏi về ${selectedDocument.title}` : 'Hỏi AI Tutor bất kỳ điều gì…'} /></div>
      <button type="submit" aria-label={draft.trim() ? 'Gửi câu hỏi' : 'Mở rộng AI Tutor'}>{draft.trim() ? 'Gửi ↑' : 'Mở rộng'}</button>
      <div className="ai-dock-suggestions">{suggestions.map((item) => <button type="button" key={item} onClick={() => applySuggestion(item)}>/ {item}</button>)}</div>
    </form>
    <aside className={`ai-sidebar ${mode === 'sidebar' || mode === 'fullscreen' ? 'expanded' : ''}`} aria-label="Nova AI Tutor">
      <div className="ai-sidebar-inner">
        <header className="ai-header"><div className="ai-title"><NovaMark /><div><strong>Nova</strong><small>{user ? 'Trợ lý học tập của bạn' : 'AI Tutor · khách'}</small></div></div><div><button type="button" title="Toàn màn hình" onClick={() => setMode('fullscreen')}>⛶</button><button type="button" title="Đóng sidebar" onClick={() => setMode('closed')}>×</button></div></header>
        <div className="ai-session-bar"><button type="button" onClick={startConversation}>＋ Cuộc trò chuyện mới</button></div>
        <div className="ai-history">{conversations.map((conversation) => <button type="button" key={conversation.id} className={conversation.id === active?.id ? 'selected' : ''} onClick={() => setActiveId(conversation.id)}>{conversation.title}</button>)}</div>
        <div className="ai-messages" ref={scrollRef}>{active?.messages.map((message) => <article key={message.id} className={`ai-message ${message.role}`}><span>{message.role === 'assistant' ? 'NOVA' : 'BẠN'}</span>{message.loading ? <div className="ai-thinking"><i /><i /><i /></div> : message.role === 'assistant' ? <RichReply text={message.text} /> : <p>{message.text}</p>}</article>)}</div>
        <div className="ai-context"><span>Ngữ cảnh</span><strong>{selectedDocument?.title || suggestions[0] || 'StudyHub'}</strong></div>
        <form className="ai-compose" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} placeholder="Nhắn Nova…" rows="2" /><button type="submit">Gửi ↑</button></form>
      </div>
    </aside>
    <section className={`ai-fullscreen ${mode === 'fullscreen' ? 'active' : ''}`} aria-hidden={mode !== 'fullscreen'}><div className="ai-fullscreen-shell"><header><div className="ai-title"><NovaMark /><strong>Nova · Focus session</strong></div><button type="button" onClick={() => setMode('sidebar')}>Thu về sidebar · Esc</button></header><div className="ai-fullscreen-content">{active?.messages.map((message) => <article key={message.id} className={`ai-message ${message.role}`}><span>{message.role === 'assistant' ? 'NOVA' : 'BẠN'}</span>{message.role === 'assistant' ? <RichReply text={message.text} /> : <p>{message.text}</p>}</article>)}</div></div></section>
  </>;
}
