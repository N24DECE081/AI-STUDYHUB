import { useMemo, useState } from 'react';
import { askAiTutor, uploadDocument } from '../../api';
import AITutorSidebar from './AITutorSidebar';
import AITutorChat from './AITutorChat';
import AITutorJourney from './AITutorJourney';
import AITutorExercise from './AITutorExercise';
import './ai-tutor.css';

const STORE = 'studyhub-nova-conversations-v2';
const VIEWS = [['chat', 'Trò chuyện'], ['journey', 'Lộ trình học'], ['practice', 'Luyện tập']];
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const freshConversation = () => ({ id: newId(), title: 'Cuộc hội thoại mới', updatedAt: Date.now(), messages: [{ id: newId(), role: 'assistant', content: 'Chào bạn, mình là **Nova**. Bạn muốn mình giải thích, gợi ý hay tạo quiz từ tài liệu nào?' }] });
const load = () => { try { const value = JSON.parse(localStorage.getItem(STORE)); return Array.isArray(value) && value.length && value.every((item) => item?.id && Array.isArray(item.messages)) ? value : [freshConversation()]; } catch { return [freshConversation()]; } };

export default function AITutorPage({ selectedDocument }) {
  const [initialConversations] = useState(load);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0].id);
  const [draft, setDraft] = useState(''); const [mode, setMode] = useState('explain'); const [files, setFiles] = useState(() => selectedDocument?.id ? [{ id: String(selectedDocument.id), name: selectedDocument.title || 'Tài liệu đã chọn', existing: true }] : []);
  const [search, setSearch] = useState(''); const [sending, setSending] = useState(false); const [drawer, setDrawer] = useState(false); const [view, setView] = useState('chat');
  const save = (next) => { setConversations(next); localStorage.setItem(STORE, JSON.stringify(next)); };
  const conversation = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [conversations, activeId]);
  const updateConversation = (id, updater) => save(conversations.map((item) => item.id === id ? updater(item) : item));
  const createConversation = () => { const next = freshConversation(); save([next, ...conversations]); setActiveId(next.id); setFiles([]); setDrawer(false); };
  const deleteConversation = (id) => { const next = conversations.filter((item) => item.id !== id); if (!next.length) { createConversation(); return; } save(next); if (id === activeId) setActiveId(next[0].id); };
  const upload = async (file) => { const placeholder = { id: newId(), name: `${file.name} đang tải…`, uploading: true }; setFiles((current) => [...current, placeholder]); try { const result = await uploadDocument({ file, title: file.name.replace(/\.[^.]+$/, ''), description: 'Tài liệu dùng trong AI Tutor', subjectCode: 'CS' }); setFiles((current) => current.map((item) => item.id === placeholder.id ? { id: String(result.id || result.document_id), name: file.name } : item)); } catch (error) { setFiles((current) => current.map((item) => item.id === placeholder.id ? { ...item, name: `${file.name} — tải thất bại`, error: error.message } : item)); } };
  const send = async (retryMessage) => {
    const text = retryMessage?.original || draft.trim(); if (!text || sending) return;
    const userMessage = { id: newId(), role: 'user', content: text };
    if (!retryMessage) { updateConversation(conversation.id, (current) => ({ ...current, title: current.messages.length <= 1 ? text.slice(0, 44) : current.title, updatedAt: Date.now(), messages: [...current.messages, userMessage] })); setDraft(''); }
    else updateConversation(conversation.id, (current) => ({ ...current, messages: current.messages.filter((message) => message.id !== retryMessage.id) }));
    setSending(true);
    try { const result = await askAiTutor({ conversationId: conversation.id, message: text, mode, fileIds: files.filter((file) => !file.uploading && !file.error).map((file) => file.id) }); updateConversation(conversation.id, (current) => ({ ...current, updatedAt: Date.now(), messages: [...current.messages, { id: result.message_id || newId(), role: 'assistant', content: result.content }] })); }
    catch (error) { updateConversation(conversation.id, (current) => ({ ...current, messages: [...current.messages, { id: newId(), role: 'assistant', content: '', error: `Không thể kết nối AI Tutor: ${error.message}`, original: text }] })); }
    finally { setSending(false); }
  };
  return <div className="ai-tutor-page"><AITutorSidebar conversations={conversations} activeId={conversation.id} search={search} setSearch={setSearch} onNew={createConversation} onSelect={(id) => { setActiveId(id); setDrawer(false); }} onDelete={deleteConversation} open={drawer} onClose={() => setDrawer(false)} /><div className="tutor-main">
    <nav className="tutor-tabs" aria-label="Khu vực AI Tutor">{VIEWS.map(([id, label]) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}<button type="button" className="tutor-menu" onClick={() => setDrawer(true)} aria-label="Mở danh sách hội thoại">☰</button></nav>
    {view === 'chat' ? <AITutorChat conversation={conversation} value={draft} onChange={setDraft} onSend={send} mode={mode} setMode={setMode} sending={sending} files={files} onUpload={upload} onRemove={(id) => setFiles((current) => current.filter((item) => item.id !== id))} onRetry={send} onOpenSidebar={() => setDrawer(true)} /> : null}
    {view === 'journey' ? <AITutorJourney onPractice={() => setView('practice')} /> : null}
    {view === 'practice' ? <AITutorExercise onNeedJourney={() => setView('journey')} /> : null}
  </div></div>;
}
