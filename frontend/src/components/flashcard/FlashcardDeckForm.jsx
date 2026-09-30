import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { previewFlashcardDocument } from "../../api";
import { DEFAULT_FLASHCARD_COLOR, FLASHCARD_COLORS, normalizeFlashcardColor } from "./flashcardTheme";
import "./flashcard.css";

const newCard = () => ({ id: crypto.randomUUID(), front: "", back: "", color: null, language: "", pronunciation: "", audioUrl: "", remembered: false });
const emptyDeck = () => ({ id: crypto.randomUUID(), name: "", subject: "", description: "", keywords: [], difficulty: "beginner", color: DEFAULT_FLASHCARD_COLOR, cover: "lines", cards: [newCard()] });

export default function FlashcardDeckForm({ onCreate, onCancel, userKey, initialDeck }) {
  const draftKey = `studyhub-flashcard-draft:${userKey}:${initialDeck?.id || 'new'}`;
  const [deck, setDeck] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey)); if (saved && Array.isArray(saved.cards) && saved.cards.length) return saved; } catch { /* Invalid local draft is ignored. */ }
    return initialDeck || emptyDeck();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const controller = useRef(null);
  const saved = useRef(false);
  useEffect(() => { if (!saved.current) { try { localStorage.setItem(draftKey, JSON.stringify(deck)); } catch { /* Saving to the server remains available. */ } } }, [deck, draftKey]);
  useEffect(() => () => controller.current?.abort(), []);
  const update = (change) => setDeck((current) => ({ ...current, ...change }));
  const updateCard = (id, change) => setDeck((current) => ({ ...current, cards: current.cards.map((card) => card.id === id ? { ...card, ...change } : card) }));
  const suggest = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if ((deck.name || deck.cards.some((card) => card.front || card.back)) && !window.confirm('Thay bản nháp hiện tại bằng gợi ý từ tài liệu mới?')) return;
    if (!file.size) { setError('File không được rỗng'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('File vượt quá 20MB'); return; }
    setBusy(true); setError(''); setWarning('');
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 60000);
    try {
      const result = await previewFlashcardDocument(file, abort.signal);
      if (!abort.signal.aborted) { setDeck({ ...result.suggestion, id: deck.id }); setWarning(result.warning || 'Kiểm tra và chỉnh sửa gợi ý trước khi lưu.'); }
    } catch (failure) { if (controller.current === abort) setError(abort.signal.aborted ? 'Phân tích quá thời gian. Bản nháp của bạn vẫn được giữ.' : failure.message); }
    finally { clearTimeout(timer); setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onCreate(deck); saved.current = true; try { localStorage.removeItem(draftKey); } catch { /* Server save already succeeded. */ } }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const swatches = (value, change) => <div className="flashcard-swatches">{FLASHCARD_COLORS.map((option) => <button type="button" key={option.value} className={normalizeFlashcardColor(value) === option.value ? 'is-selected' : ''} style={{ '--flashcard-color': option.value }} onClick={() => change(option.value)} aria-label={option.name} aria-pressed={normalizeFlashcardColor(value) === option.value} title={option.name} />)}</div>;
  return <form className="auth-form flashcard-deck-form" onSubmit={submit}>
    <label>Tự điền từ tài liệu<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.txt,.md,.csv" disabled={busy} onChange={suggest} /></label>
    {busy && <p role="status">Đang xử lý…</p>}{error && <p role="alert">{error}</p>}{warning && <p role="status">{warning}</p>}
    <fieldset className="flashcard-editor" disabled={busy}>
      <label>Tên bộ thẻ<input required maxLength={100} value={deck.name} onChange={(e) => update({ name: e.target.value })} /></label>
      <label>Môn học / Chuyên đề<input maxLength={200} value={deck.subject} onChange={(e) => update({ subject: e.target.value })} /></label>
      <label>Mô tả<textarea aria-label="Mô tả" maxLength={2000} value={deck.description} onChange={(e) => update({ description: e.target.value })} /></label>
      <label>Từ khóa<input value={(deck.keywords || []).join(',')} onChange={(e) => update({ keywords: e.target.value.split(',') })} /></label>
      <label>Độ khó<select aria-label="Độ khó" value={deck.difficulty} onChange={(e) => update({ difficulty: e.target.value })}><option value="beginner">Cơ bản</option><option value="intermediate">Trung bình</option><option value="advanced">Nâng cao</option></select></label>
      <div className="flashcard-form-row"><fieldset className="flashcard-color-field"><legend>Màu bộ thẻ</legend>{swatches(deck.color, (color) => update({ color }))}</fieldset><label>Mẫu bìa<select aria-label="Mẫu bìa" value={deck.cover} onChange={(e) => update({ cover: e.target.value })}><option value="lines">Đường kẻ</option><option value="grid">Ô lưới</option><option value="plain">Đơn sắc</option></select></label></div>
      <div className={`quiz-deck-cover is-${deck.cover}`} style={{ '--deck-color': normalizeFlashcardColor(deck.color) }} aria-label="Xem trước màu bộ thẻ" />
      <div className="flashcard-form-heading"><strong>Thẻ ghi nhớ</strong><button type="button" disabled={deck.cards.length >= 100} onClick={() => update({ cards: [...deck.cards, newCard()] })}><Plus size={16} /> Thêm thẻ</button></div>
      <div className="flashcard-form-cards">{deck.cards.map((card, index) => <fieldset key={card.id} className="flashcard-form-card" style={{ borderColor: normalizeFlashcardColor(card.color || deck.color) }}><legend>Thẻ {index + 1}</legend><button type="button" className="flashcard-remove" disabled={deck.cards.length === 1} onClick={() => update({ cards: deck.cards.filter((item) => item.id !== card.id) })} aria-label={`Xóa thẻ ${index + 1}`}><Trash2 size={16} /></button><label>Mặt trước<input required maxLength={1000} value={card.front} onChange={(e) => updateCard(card.id, { front: e.target.value, pronunciation: '', audioUrl: '' })} /></label><label>Mặt sau<textarea aria-label="Mặt sau" required maxLength={4000} value={card.back} onChange={(e) => updateCard(card.id, { back: e.target.value })} /></label><label>Ngôn ngữ<select aria-label="Ngôn ngữ" value={card.language || ''} onChange={(e) => updateCard(card.id, { language: e.target.value })}><option value="">Khác</option><option value="en">Tiếng Anh</option></select></label>{card.language === 'en' && <label>IPA (không bắt buộc)<input value={card.pronunciation || ''} onChange={(e) => updateCard(card.id, { pronunciation: e.target.value })} /></label>}{swatches(card.color || deck.color, (color) => updateCard(card.id, { color }))}</fieldset>)}</div>
    </fieldset>
    <div className="quiz-modal-actions"><button type="button" onClick={onCancel}>Đóng, giữ bản nháp</button><button className="btn quiz-create-button" disabled={busy} type="submit">Lưu bộ thẻ</button></div>
  </form>;
}
