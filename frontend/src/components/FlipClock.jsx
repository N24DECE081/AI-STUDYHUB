import { useEffect, useState } from 'react';
import './FlipClock.css';

function FlipDigit({ digit }) {
  const [current, setCurrent] = useState(digit);
  const [previous, setPrevious] = useState(digit);
  const [flipping, setFlipping] = useState(false);

  if (digit !== current) {
    setPrevious(current);
    setCurrent(digit);
    setFlipping(true);
  }

  useEffect(() => {
    if (!flipping) return;
    const timeout = setTimeout(() => setFlipping(false), 600);
    return () => clearTimeout(timeout);
  }, [current, flipping]);

  return (
    <div key={current} className={`flip-digit${flipping ? ' is-flipping' : ''}`} aria-hidden="true">
      <div className="flip-digit__top">
        <span>{current}</span>
      </div>
      <div className="flip-digit__bottom">
        <span>{flipping ? previous : current}</span>
      </div>
      <div className="flip-digit__flap-front">
        <span>{flipping ? previous : current}</span>
      </div>
      <div className="flip-digit__flap-back">
        <span>{current}</span>
      </div>
    </div>
  );
}

export default function FlipClock({ seconds, label }) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  const showHours = total >= 3600;

  return (
    <div className="flip-clock" role="timer" aria-label={`${h}:${m}:${s}`}>
      <span className="sr-only">{`${h}:${m}:${s}`}</span>
      {showHours && (
        <>
          <div className="flip-clock__group">
            <FlipDigit digit={h[0]} id="h0" />
            <FlipDigit digit={h[1]} id="h1" />
            <span className="flip-clock__label">GIỜ</span>
          </div>
          <span className="flip-clock__sep" aria-hidden="true">:</span>
        </>
      )}
      <div className="flip-clock__group">
        <FlipDigit digit={m[0]} id="m0" />
        <FlipDigit digit={m[1]} id="m1" />
        <span className="flip-clock__label">PHÚT</span>
      </div>
      <span className="flip-clock__sep" aria-hidden="true">:</span>
      <div className="flip-clock__group">
        <FlipDigit digit={s[0]} id="s0" />
        <FlipDigit digit={s[1]} id="s1" />
        <span className="flip-clock__label">GIÂY</span>
      </div>
      {label && <div className="flip-clock__phase">{label}</div>}
    </div>
  );
}
