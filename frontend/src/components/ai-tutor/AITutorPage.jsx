import { useCallback, useEffect, useMemo, useState } from 'react';
import { askAiTutor, deleteDocument, getTutorEngine, getTutorConversations, getSubjects, uploadDocument } from '../../api';
import { freshConversation, loadConversations, mergeConversations, newId, persistConversations } from './conversationStore';
import AITutorSidebar from './AITutorSidebar';
import AITutorChat from './AITutorChat';
import AITutorJourney from './AITutorJourney';
import AITutorExercise from './AITutorExercise';
import './ai-tutor.css';

const VIEWS = [['chat', 'Trò chuyện'], ['journey', 'Lộ trình học'], ['practice', 'Luyện tập']];
const MAX_TUTOR_FILES = 5;

export default function AITutorPage({ selectedDocument, user, onDocumentsChanged, onDocumentDeleted }) {
  const userScope = String(user?.id || user?.email || 'guest');
  const [initialConversations] = useState(() => loadConversations(userScope));
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0].id);
  const [draft, setDraft] = useState(''); const [files, setFiles] = useState(() => selectedDocument?.id ? [{ id: String(selectedDocument.id), name: selectedDocument.title || 'Tài liệu đã chọn', existing: true }] : []);
  const [search, setSearch] = useState(''); const [sending, setSending] = useState(false); const [drawer, setDrawer] = useState(false); const [view, setView] = useState('chat');
  const [engine, setEngine] = useState(null);
  const loadEngine = () => getTutorEngine().then(setEngine).catch(() => setEngine(null));
  useEffect(() => { let alive = true; getTutorEngine().then((data) => { if (alive) setEngine(data); }).catch(() => { if (alive) setEngine(null); }); return () => { alive = false; }; }, []);
  const applyConversations = useCallback((updater) => setConversations((current) => { const next = typeof updater === 'function' ? updater(current) : updater; persistConversations(next, userScope); return next; }), [userScope]);
  useEffect(() => { const next = loadConversations(userScope); setConversations(next); setActiveId(next[0].id); setFiles(selectedDocument?.id ? [{ id: String(selectedDocument.id), name: selectedDocument.title || 'Tài liệu đã chọn', existing: true }] : []); }, [userScope, selectedDocument?.id, selectedDocument?.title]);
  useEffect(() => { let alive = true; if (userScope === 'guest') return undefined; (async () => { try { const data = await getTutorConversations(); if (!alive) return; const remote = Array.isArray(data?.conversations) ? data.conversations : []; if (remote.length) applyConversations((current) => mergeConversations(current, remote)); } catch { /* chưa đăng nhập hoặc offline: giữ lịch sử cục bộ */ } })(); return () => { alive = false; }; }, [userScope, applyConversations]);
  const conversation = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [conversations, activeId]);
  const updateConversation = (id, updater) => applyConversations((current) => current.map((item) => item.id === id ? updater(item) : item));
  const createConversation = () => { const next = freshConversation(); applyConversations((current) => [next, ...current]); setActiveId(next.id); setFiles([]); setDrawer(false); };
  const deleteConversation = (id) => { const next = conversations.filter((item) => item.id !== id); if (!next.length) { createConversation(); return; } applyConversations(next); if (id === activeId) setActiveId(next[0].id); };
  const upload = async (file) => {
    if (files.filter((item) => !item.error).length >= MAX_TUTOR_FILES) return;
    const placeholder = { id: newId(), name: `${file.name} đang tải…`, uploading: true };
    setFiles((current) => [...current, placeholder]);
    try {
      const subjects = await getSubjects();
      const subject = subjects[0];
      if (!subject) throw new Error('Chưa có môn học để gắn tài liệu.');
      const result = await uploadDocument({ file, title: file.name.replace(/\.[^.]+$/, ''), description: 'Tài liệu dùng trong AI Tutor', subjectCode: subject.code });
      setFiles((current) => current.map((item) => item.id === placeholder.id ? { id: String(result.id || result.document_id), name: file.name, existing: true } : item));
      await onDocumentsChanged?.();
    } catch (error) {
      setFiles((current) => current.map((item) => item.id === placeholder.id ? { ...item, uploading: false, name: `${file.name} — tải thất bại`, error: error.message } : item));
    }
  };
  const removeFile = async (file) => {
    if (file.uploading || file.deleting) return;
    if (file.error || !file.existing) {
      setFiles((current) => current.filter((item) => item.id !== file.id));
      return;
    }
    if (!window.confirm(`Xóa “${file.name}” khỏi kho dữ liệu?`)) return;
    setFiles((current) => current.map((item) => item.id === file.id ? { ...item, deleting: true, deleteError: null } : item));
    try {
      await deleteDocument(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      onDocumentDeleted?.(file.id);
      await onDocumentsChanged?.();
    } catch (error) {
      setFiles((current) => current.map((item) => item.id === file.id ? { ...item, deleting: false, deleteError: error.message } : item));
    }
  };
  const send = async (retryMessage) => {
    const text = retryMessage?.original || draft.trim(); if (!text || sending) return;
    const userMessage = { id: newId(), role: 'user', content: text };
    if (!retryMessage) { updateConversation(conversation.id, (current) => ({ ...current, title: current.messages.length <= 1 ? text.slice(0, 44) : current.title, updatedAt: Date.now(), messages: [...current.messages, userMessage] })); setDraft(''); }
    else updateConversation(conversation.id, (current) => ({ ...current, messages: current.messages.filter((message) => message.id !== retryMessage.id) }));
    setSending(true);
    try { const result = await askAiTutor({ conversationId: conversation.id, message: text, mode: 'auto', fileIds: files.filter((file) => !file.uploading && !file.deleting && !file.error).map((file) => file.id) }); updateConversation(conversation.id, (current) => ({ ...current, updatedAt: Date.now(), messages: [...current.messages, { id: result.message_id || newId(), role: 'assistant', content: result.content, quiz: result.quiz || null, mode: result.mode || null }] })); if (result.engine_degraded) loadEngine(); }
    catch (error) { updateConversation(conversation.id, (current) => ({ ...current, messages: [...current.messages, { id: newId(), role: 'assistant', content: '', error: `Không thể kết nối AI Tutor: ${error.message}`, original: text }] })); }
    finally { setSending(false); }
  };
  return <div className="ai-tutor-page"><AITutorSidebar conversations={conversations} activeId={conversation.id} search={search} setSearch={setSearch} onNew={createConversation} onSelect={(id) => { setActiveId(id); setDrawer(false); }} onDelete={deleteConversation} open={drawer} onClose={() => setDrawer(false)} /><div className="tutor-main">
    <nav className="tutor-tabs" aria-label="Khu vực AI Tutor">{VIEWS.map(([id, label]) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}<button type="button" className="tutor-menu" onClick={() => setDrawer(true)} aria-label="Mở danh sách hội thoại">☰</button></nav>
    {view === 'chat' ? <AITutorChat conversation={conversation} value={draft} onChange={setDraft} onSend={send} sending={sending} files={files} onUpload={upload} onRemove={removeFile} maxFiles={MAX_TUTOR_FILES} onRetry={send} onOpenSidebar={() => setDrawer(true)} engine={engine} /> : null}
    {view === 'journey' ? <AITutorJourney onPractice={() => setView('practice')} /> : null}
    {view === 'practice' ? <AITutorExercise onNeedJourney={() => setView('journey')} /> : null}
  </div></div>;
}
