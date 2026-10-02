import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../Logo3D.css';
import studyHubLogo from '../assets/studyhub-logo.png';
import QuoteBubble from './QuoteBubble';

const COPY = { label: 'Nhận câu động lực', tooltip: 'Nhấn để nhận động lực', hint: 'Kéo hoặc dùng phím mũi tên để xoay' };

const particles = [
  ['star back orbit mint', '12%', '23%', '7.2s', '-2.1s'],
  ['dot back', '29%', '8%', '6.8s', '-4.4s'],
  ['star middle pink', '82%', '16%', '5.7s', '-1.3s'],
  ['dot middle orbit', '91%', '39%', '8s', '-5s'],
  ['star fore mint', '87%', '72%', '5.2s', '-3.1s'],
  ['dot fore', '69%', '91%', '6.5s', '-.8s'],
  ['star back', '23%', '83%', '7.6s', '-5.8s'],
  ['dot middle', '7%', '56%', '5.9s', '-2.8s'],
  ['star middle orbit pink', '46%', '2%', '8.3s', '-6.2s'],
  ['dot back', '96%', '56%', '7.1s', '-3.7s'],
  ['star fore', '12%', '39%', '5.5s', '-1.9s'],
  ['dot middle pink', '76%', '4%', '6.3s', '-4.9s'],
];

export default function Logo3D({ quote, pickNext, onNotify }) {
  const drag = useRef(null);
  const wasDragged = useRef(false);
  const containerRef = useRef(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const showQuote = () => {
    if (!pickNext()) return;
    setBubbleOpen(true);
    setClickCount((count) => count + 1);
  };
  useEffect(() => {
    if (!bubbleOpen) return;
    const close = () => setBubbleOpen(false);
    const startX = window.scrollX, startY = window.scrollY;
    const scrolled = (event) => {
      // Ignore a queued scroll event from before the click that opened the bubble.
      if ((event.target === document || event.target === window) && window.scrollX === startX && window.scrollY === startY) return;
      close();
    };
    const outside = (event) => {
      const root = containerRef.current;
      if (!root?.querySelector('.logo-3d-control')?.contains(event.target) &&
          !root?.querySelector('.quote-bubble')?.contains(event.target)) close();
    };
    const escape = (event) => { if (event.key === 'Escape') close(); };
    const timer = window.setTimeout(close, 6000);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [bubbleOpen, clickCount]);
  useLayoutEffect(() => {
    if (!quote || !bubbleOpen) return;
    const root = containerRef.current;
    const hero = root.closest('.hero-section');
    const visual = root.parentElement;
    const bubble = root.querySelector('.quote-bubble');
    const place = () => {
      const bounds = root.getBoundingClientRect();
      const card = hero.getBoundingClientRect();
      const region = visual.getBoundingClientRect();
      const copy = hero.querySelector('.hero-copy').getBoundingClientRect();
      const anchor = root.querySelector('.logo-3d-control').getBoundingClientRect();
      const minX = Math.max(region.left + 8, card.left + 16);
      const maxX = Math.min(region.right - 8, card.right - 16);
      const width = Math.min(360, maxX - minX);
      root.style.setProperty('--quote-width', width + 'px');
      const height = bubble.offsetHeight;
      const minY = Math.max(card.top + 16, document.querySelector('.topbar').getBoundingClientRect().bottom + 12,
        copy.right > region.left ? copy.bottom + 12 : card.top + 16);
      const maxY = Math.min(card.bottom - 16, window.innerHeight - 16);
      const above = anchor.top - height - 14;
      const below = above < minY && window.innerWidth < 900;
      const top = Math.max(minY, Math.min(below ? anchor.bottom + 14 : above, maxY - height));
      const left = Math.max(minX, Math.min(bounds.left + bounds.width / 2 - width / 2, maxX - width));
      root.style.setProperty('--quote-left', left - bounds.left + 'px');
      root.style.setProperty('--quote-top', top - bounds.top + 'px');
      root.dataset.quotePlacement = below ? 'below' : 'above';
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(hero);
    observer.observe(visual);
    observer.observe(document.querySelector('.topbar'));
    return () => observer.disconnect();
  }, [quote, bubbleOpen]);
  const rotate = (element, x, y) => {
    element.style.setProperty('--rotate-x', `${x}deg`);
    element.style.setProperty('--rotate-y', `${y}deg`);
  };
  const release = (event) => {
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    rotate(event.currentTarget, 0, 0);
  };
  const moveParallax = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    const container = event.currentTarget.parentElement;
    container.style.setProperty('--parallax-x', `${x * 5}px`);
    container.style.setProperty('--parallax-y', `${y * 5}px`);
  };
  return (
    <div className="logo-3d-container" ref={containerRef}>
      <div className="logo-3d-orbit" aria-hidden="true" />
      <div className="logo-3d-particles" aria-hidden="true">
        {particles.map(([kind, left, top, duration, delay], index) => (
          <span key={index} className={`logo-3d-particle ${kind}`} style={{ left, top, '--particle-duration': duration, '--particle-hover-duration': `${Math.max(3.5, parseFloat(duration) * 0.82)}s`, animationDelay: delay }} />
        ))}
      </div>
      <button type="button" className="logo-3d-control"
        aria-label={COPY.label} aria-expanded={bubbleOpen} title={!quote ? COPY.tooltip : undefined}
        aria-describedby="logo-3d-hint"
        onClick={(event) => { if (event.detail === 0 || !wasDragged.current) showQuote(); }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          wasDragged.current = false;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.setAttribute('data-dragging', 'true');
        }}
        onPointerMove={(event) => {
          moveParallax(event);
          if (!drag.current) return;
          if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5) wasDragged.current = true;
          rotate(event.currentTarget,
            Math.max(-30, Math.min(30, (drag.current.y - event.clientY) / 3)),
            Math.max(-40, Math.min(40, (event.clientX - drag.current.x) / 3)));
        }}
        onPointerUp={(event) => {
          if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5) wasDragged.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          release(event);
        }}
        onPointerCancel={(event) => { wasDragged.current = true; release(event); }} onLostPointerCapture={release} onBlur={release}
        onPointerLeave={(event) => {
          event.currentTarget.parentElement.style.setProperty('--parallax-x', '0px');
          event.currentTarget.parentElement.style.setProperty('--parallax-y', '0px');
        }}
        onKeyDown={(event) => {
          if (['Enter', ' '].includes(event.key)) {
            if (event.repeat) event.preventDefault();
            return;
          }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          rotate(event.currentTarget, event.key === 'ArrowUp' ? 25 : event.key === 'ArrowDown' ? -25 : 0,
            event.key === 'ArrowLeft' ? -30 : event.key === 'ArrowRight' ? 30 : 0);
        }}>
        <div className="logo-3d">
          <img key={clickCount} className={"logo-artwork" + (bubbleOpen ? " logo-artwork--clicked" : "")} src={studyHubLogo} alt="" draggable="false" />
        </div>
      </button>
      <span className="logo-3d-hint" id="logo-3d-hint">{COPY.hint}</span>
      {quote && <QuoteBubble quote={quote} open={bubbleOpen} onNotify={onNotify} />}
    </div>
  );
}
