import { useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { DEFAULT_FLASHCARD_COLOR, FLASHCARD_COLORS } from "./flashcard/flashcardTheme";

function cardsFor(deck) {
  if (Array.isArray(deck.cards) && deck.cards.length) return deck.cards;
  return [
    { front: deck.name, back: deck.description || `Chủ đề ôn tập: ${deck.subject || "Chưa phân loại"}` },
    { front: "Mục tiêu của bộ thẻ", back: `Ghi nhớ và tự kiểm tra kiến thức ${deck.subject || deck.name}.` },
  ];
}

export default function StudyDeckSession({ deck, onUpdateDeck, onClose }) {
  const cards = useMemo(() => cardsFor(deck), [deck]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState({});
  const [finished, setFinished] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const advanceTimer = useRef(null);
  const card = cards[index];
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const updateCard = (change) => {
    const nextCards = cards.map((item, cardIndex) => cardIndex === index ? { ...item, ...change } : item);
    onUpdateDeck({ ...deck, cards: nextCards, updatedAt: new Date().toISOString() });
  };

  const rate = (value) => {
    const next = { ...ratings, [index]: value };
    setRatings(next);
    updateCard({ remembered: value === "known", rememberedAt: value === "known" ? new Date().toISOString() : null });
    if (value === "known") setCelebrating(true);
    advanceTimer.current = window.setTimeout(() => {
      setCelebrating(false);
      setFlipped(false);
      if (index === cards.length - 1) setFinished(true);
      else setIndex(index + 1);
    }, value === "known" ? 650 : 0);
  };

  const reset = () => {
    setIndex(0);
    setFlipped(false);
    setRatings({});
    setFinished(false);
  };

  const remembered = Object.values(ratings).filter((value) => value === "known").length;

  return (
    <div className="study-session-backdrop" role="presentation">
      <section className="study-session" role="dialog" aria-modal="true" aria-labelledby="study-session-title">
        <header>
          <div><span className="eyebrow">BỘ THẺ ÔN TẬP</span><h2 id="study-session-title">{deck.name}</h2><p>{deck.subject || "Chưa phân loại"}</p></div>
          <button type="button" className="study-session-close" onClick={onClose} aria-label="Đóng phiên ôn tập">×</button>
        </header>

        {!finished ? <>
          <div className="study-session-progress"><span style={{ width: `${((index + 1) / cards.length) * 100}%` }} /></div>
          <div className="study-session-counter">Thẻ {index + 1}/{cards.length}</div>
          <button type="button" className={`study-card${flipped ? " is-flipped" : ""}${celebrating ? " is-remembered" : ""}`} style={{ "--card-color": card.color || deck.color || DEFAULT_FLASHCARD_COLOR }} onClick={() => setFlipped((value) => !value)}>
            <Flame className="study-card__flame" size={22} aria-hidden="true" />
            <span>{flipped ? "MẶT SAU" : "MẶT TRƯỚC"}</span>
            <strong>{flipped ? card.back : card.front}</strong>
            <small>{flipped ? "Đánh giá mức độ ghi nhớ bên dưới" : "Nhấn vào thẻ để xem đáp án"}</small>
          </button>
          <div className="flashcard-swatches" role="group" aria-label="Màu của thẻ hiện tại">{FLASHCARD_COLORS.map((option) => <button type="button" key={option.value} className={(card.color || deck.color || DEFAULT_FLASHCARD_COLOR) === option.value ? "is-selected" : ""} style={{ "--flashcard-color": option.value }} onClick={() => updateCard({ color: option.value })} aria-label={option.name} aria-pressed={(card.color || deck.color || DEFAULT_FLASHCARD_COLOR) === option.value} title={option.name} />)}</div>
          {flipped ? (
            <div className="study-rating-actions">
              <button type="button" className="btn study-again" disabled={celebrating} onClick={() => rate("again")}>Chưa nhớ</button>
              <button type="button" className="btn study-known" disabled={celebrating} onClick={() => rate("known")}>Đã nhớ</button>
            </div>
          ) : (
            <div className="study-nav-actions">
              <button type="button" className="btn btn-ghost" disabled={index === 0} onClick={() => { setIndex(index - 1); setFlipped(false); }}>← Thẻ trước</button>
              <button type="button" className="btn btn-ghost" disabled={index === cards.length - 1} onClick={() => { setIndex(index + 1); setFlipped(false); }}>Thẻ sau →</button>
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
