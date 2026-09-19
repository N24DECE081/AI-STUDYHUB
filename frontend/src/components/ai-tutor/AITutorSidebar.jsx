import AITutorIcon from './AITutorIcon';

export default function AITutorSidebar({ conversations, activeId, search, setSearch, onNew, onSelect, onDelete, open, onClose }) {
  const filtered = conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  return <aside className={`tutor-sidebar ${open ? 'open' : ''}`} aria-label="Danh sách hội thoại AI Tutor">
    <div className="tutor-sidebar-head"><div className="tutor-brand"><AITutorIcon size={25} /><strong>Nova</strong></div><button className="tutor-mobile-close" aria-label="Đóng danh sách" onClick={onClose}>×</button></div>
    <button className="tutor-new" onClick={onNew}>＋ Cuộc hội thoại mới</button>
    <label className="tutor-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm hội thoại" /></label>
    <div className="tutor-conversation-list">{filtered.map((item) => <div className={item.id === activeId ? 'tutor-conversation active' : 'tutor-conversation'} key={item.id}><button onClick={() => onSelect(item.id)}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</small></button><button className="tutor-delete" aria-label={`Xóa ${item.title}`} onClick={() => onDelete(item.id)}>×</button></div>)}</div>
  </aside>;
}
