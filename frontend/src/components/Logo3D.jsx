import { useRef } from 'react';
import '../Logo3D.css';

export default function Logo3D() {
  const drag = useRef(null);
  const rotate = (element, x, y) => {
    element.style.setProperty('--rotate-x', `${x}deg`);
    element.style.setProperty('--rotate-y', `${y}deg`);
    element.setAttribute('aria-valuenow', Math.round(y));
  };
  const release = (event) => {
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    rotate(event.currentTarget, 0, 0);
  };
  return (
    <div className="logo-3d-container">
      <div className="logo-3d-orbit" aria-hidden="true" />
      <div className="logo-3d-control" role="slider" tabIndex={0}
        aria-label="Xoay logo StudyHub 3D" aria-valuemin={-40} aria-valuemax={40} aria-valuenow={0}
        aria-describedby="logo-3d-hint"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.setAttribute('data-dragging', 'true');
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          rotate(event.currentTarget,
            Math.max(-30, Math.min(30, (drag.current.y - event.clientY) / 3)),
            Math.max(-40, Math.min(40, (event.clientX - drag.current.x) / 3)));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          release(event);
        }}
        onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          rotate(event.currentTarget, event.key === 'ArrowUp' ? 25 : event.key === 'ArrowDown' ? -25 : 0,
            event.key === 'ArrowLeft' ? -30 : event.key === 'ArrowRight' ? 30 : 0);
        }}>
        <div className="logo-3d">
          <span className="logo-mark" aria-hidden="true"><b>S</b><i>H</i></span>
          <span className="logo-sparkle" aria-hidden="true">✦</span>
        </div>
      </div>
      <span className="logo-3d-hint" id="logo-3d-hint">Kéo hoặc dùng phím mũi tên để xoay</span>
    </div>
  );
}
