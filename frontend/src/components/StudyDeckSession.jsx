import Pronunciation from './flashcard/Pronunciation';
import { reviewFlashcard } from '../api';
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { normalizeFlashcardColor, FLASHCARD_COLORS } from "./flashcard/flashcardTheme";

export default function StudyDeckSession({ deck, onUpdateDeck, onClose }) {
  const [reviewIds] = useState(() => deck.reviewCardIds || null);
  const cards = useMemo(() => (deck.cards || []).filter((card) => !reviewIds || reviewIds.includes(card.id)), [deck.cards, reviewIds]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState({});
  const [finished, setFinished] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const advanceTimer = useRef(null);
  const card = cards[index];
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const updateCard = async (change) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await onUpdateDeck({ ...deck, cards: deck.cards.map((item) => item.id === card.id ? { ...item, ...change } : item) }); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };
  const rate = async (value) => {
    if (saving || celebrating) return;
    setSaving(true); setError('');
    try {
      const result = await reviewFlashcard(deck.id, card.id, value);
      await onUpdateDeck(result.deck, true);
      setRatings((current) => ({ ...current, [index]: value }));
      if (value === 'known') setCelebrating(true);
      advanceTimer.current = window.setTimeout(() => {
        setCelebrating(false); setFlipped(false);
        if (index === cards.length - 1) setFinished(true); else setIndex(index + 1);
      }, value === 'known' ? 650 : 0);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };

  const reset = () => {
    setIndex(0);
    setFlipped(false);
    setRatings({});
    setFinished(false);
  };

  const totalRemembered = (deck.cards || []).filter((item) => item.remembered).length;
  const remembered = Object.values(ratings).filter((value) => value === "known").length;

  return (
    <div className="study-session-backdrop" role="presentation">
      <section className="study-session" role="dialog" aria-modal="true" aria-labelledby="study-session-title">
        <header>
          <div><span className="eyebrow">BỘ THẺ ÔN TẬP</span><h2 id="study-session-title">{deck.name}</h2><p>{deck.subject || "Chưa phân loại"}</p></div>
          <button type="button" className="study-session-close" disabled={saving} onClick={onClose} aria-label="Đóng phiên ôn tập">×</button>
        </header>

        <div className="qc-learning-progress"><span>{totalRemembered} / {deck.cards.length} thẻ đã nhớ</span><progress max={Math.max(1,deck.cards.length)} value={totalRemembered}/><small>{totalRemembered} đã nhớ · {deck.cards.length-totalRemembered} chưa nhớ</small></div>
        {!cards.length ? <p>Bộ thẻ chưa có nội dung để ôn tập.</p> : !finished ? <>
          <div className="study-session-progress"><span style={{ width: `${((index + 1) / cards.length) * 100}%` }} /></div>
          <div className="study-session-counter">Thẻ {index + 1}/{cards.length}</div>
          <button type="button" className={`study-card${flipped ? " is-flipped" : ""}${celebrating ? " is-remembered" : ""}`} style={{ "--card-color": normalizeFlashcardColor(card.color || deck.color) }} onClick={() => setFlipped((value) => !value)}>
            <Flame className="study-card__flame" size={22} aria-hidden="true" />
            <span>{flipped ? "MẶT SAU" : "MẶT TRƯỚC"}</span>
            <strong>{flipped ? card.back : card.front}</strong>
            <small>{flipped ? "Đánh giá mức độ ghi nhớ bên dưới" : "Nhấn vào thẻ để xem đáp án"}</small>
          </button>
          {card.language === "en" && <Pronunciation key={`${card.id}:${card.front}`} card={card} />}
          {error && <p role="alert">{error}</p>}
          <div className="flashcard-swatches" role="group" aria-label="Màu của thẻ hiện tại">{FLASHCARD_COLORS.map((option) => <button type="button" key={option.value} className={(normalizeFlashcardColor(card.color || deck.color)) === option.value ? "is-selected" : ""} style={{ "--flashcard-color": option.value }} disabled={saving || celebrating} onClick={() => updateCard({ color: option.value })} aria-label={option.name} aria-pressed={(normalizeFlashcardColor(card.color || deck.color)) === option.value} title={option.name} />)}</div>
          {flipped ? (
            <div className="study-rating-actions">
              <button type="button" className="btn study-again" disabled={celebrating || saving} onClick={() => rate("again")}>Chưa nhớ</button>
              <button type="button" className="btn study-known" disabled={celebrating || saving} onClick={() => rate("known")}>Đã nhớ</button>
            </div>
          ) : (
            <div className="study-nav-actions">
              <button type="button" className="btn btn-ghost" disabled={saving || celebrating || index === 0} onClick={() => { setIndex(index - 1); setFlipped(false); }}>← Thẻ trước</button>
              <button type="button" className="btn btn-ghost" disabled={saving || celebrating || index === cards.length - 1} onClick={() => { setIndex(index + 1); setFlipped(false); }}>Thẻ sau →</button>
            </div>
          )}
        </> : (
          <div className="study-session-result">
            <span>✓</span><h3>Hoàn thành phiên ôn tập</h3>
            <strong>{remembered}/{cards.length} thẻ đã nhớ</strong>
            <p>{cards.length - remembered ? `Bạn nên ôn lại ${cards.length - remembered} thẻ chưa nhớ.` : "Tuyệt vời! Bạn đã nhớ toàn bộ bộ thẻ."}</p>
            <div><button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button><button type="button" className="btn btn-primary" onClick={reset}>Ôn lại</button></div>
          </div>
        )}
      </section>
    </div>
  );
}
