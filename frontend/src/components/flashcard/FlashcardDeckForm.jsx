import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_FLASHCARD_COLOR, FLASHCARD_COLORS } from "./flashcardTheme";
import "./flashcard.css";

const newCard = () => ({ id: crypto.randomUUID(), front: "", back: "", color: null, remembered: false });

export default function FlashcardDeckForm({ onCreate, onCancel }) {
  const [cards, setCards] = useState(() => [newCard()]);
  const [color, setColor] = useState(DEFAULT_FLASHCARD_COLOR);
  const [cover, setCover] = useState("lines");

  const updateCard = (id, change) => setCards((current) => current.map((card) => card.id === id ? { ...card, ...change } : card));
  const submit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const completed = cards.map((card) => ({ ...card, front: card.front.trim(), back: card.back.trim(), color: card.color || color }));
    if (completed.some((card) => !card.front || !card.back)) return;
    onCreate({
      id: crypto.randomUUID(),
      name: String(data.get("deckName") || "").trim(),
      subject: String(data.get("deckSubject") || "").trim(),
      description: String(data.get("deckDescription") || "").trim(),
      color,
      cover,
      cards: completed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <form className="auth-form flashcard-deck-form" onSubmit={submit}>
      <label>Tên bộ thẻ<input name="deckName" required maxLength="100" placeholder="Ví dụ: Java OOP" /></label>
      <label>Môn học / Chuyên đề<input name="deckSubject" placeholder="Ví dụ: Lập trình" /></label>
      <label>Mô tả<textarea name="deckDescription" rows="2" placeholder="Mục tiêu ôn tập" /></label>
      <div className="flashcard-form-row">
        <fieldset className="flashcard-color-field"><legend>Màu bộ thẻ</legend><div className="flashcard-swatches">{FLASHCARD_COLORS.map((option) => <button type="button" key={option.value} className={color === option.value ? "is-selected" : ""} style={{ "--flashcard-color": option.value }} onClick={() => setColor(option.value)} aria-label={option.name} aria-pressed={color === option.value} title={option.name} />)}</div></fieldset>
        <label>Mẫu bìa<select value={cover} onChange={(event) => setCover(event.target.value)}><option value="lines">Đường kẻ</option><option value="grid">Ô lưới</option><option value="plain">Đơn sắc</option></select></label>
      </div>
      <div className="flashcard-form-heading"><strong>Thẻ ghi nhớ</strong><button type="button" onClick={() => setCards((current) => [...current, newCard()])}><Plus size={16} /> Thêm thẻ</button></div>
      <div className="flashcard-form-cards">{cards.map((card, index) => <fieldset key={card.id} className="flashcard-form-card"><legend>Thẻ {index + 1}</legend><button type="button" className="flashcard-remove" disabled={cards.length === 1} onClick={() => setCards((current) => current.filter((item) => item.id !== card.id))} aria-label={`Xóa thẻ ${index + 1}`} title="Xóa thẻ"><Trash2 size={16} /></button><label>Mặt trước<input value={card.front} onChange={(event) => updateCard(card.id, { front: event.target.value })} required /></label><label>Mặt sau<textarea value={card.back} onChange={(event) => updateCard(card.id, { back: event.target.value })} required rows="2" /></label><div className="flashcard-swatches" role="group" aria-label={`Màu thẻ ${index + 1}`}>{FLASHCARD_COLORS.map((option) => <button type="button" key={option.value} className={(card.color || color) === option.value ? "is-selected" : ""} style={{ "--flashcard-color": option.value }} onClick={() => updateCard(card.id, { color: option.value })} aria-label={option.name} aria-pressed={(card.color || color) === option.value} title={option.name} />)}</div></fieldset>)}</div>
      <div className="quiz-modal-actions"><button type="button" className="text-link" onClick={onCancel}>Hủy</button><button className="btn quiz-create-button" type="submit"><Plus size={17} /> Tạo bộ thẻ</button></div>
    </form>
  );
}
