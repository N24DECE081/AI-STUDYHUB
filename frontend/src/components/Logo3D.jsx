import { useRef } from 'react';
import '../Logo3D.css';
import studyHubLogo from '../assets/studyhub-logo.png';

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
  const moveParallax = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    const container = event.currentTarget.parentElement;
    container.style.setProperty('--parallax-x', `${x * 5}px`);
    container.style.setProperty('--parallax-y', `${y * 5}px`);
  };
  return (
    <div className="logo-3d-container">
      <div className="logo-3d-orbit" aria-hidden="true" />
      <div className="logo-3d-particles" aria-hidden="true">
        {particles.map(([kind, left, top, duration, delay], index) => (
          <span key={index} className={`logo-3d-particle ${kind}`} style={{ left, top, '--particle-duration': duration, '--particle-hover-duration': `${Math.max(3.5, parseFloat(duration) * 0.82)}s`, animationDelay: delay }} />
        ))}
      </div>
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
          moveParallax(event);
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
        onPointerLeave={(event) => {
          event.currentTarget.parentElement.style.setProperty('--parallax-x', '0px');
          event.currentTarget.parentElement.style.setProperty('--parallax-y', '0px');
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          rotate(event.currentTarget, event.key === 'ArrowUp' ? 25 : event.key === 'ArrowDown' ? -25 : 0,
            event.key === 'ArrowLeft' ? -30 : event.key === 'ArrowRight' ? 30 : 0);
        }}>
        <div className="logo-3d">
          <img className="logo-artwork" src={studyHubLogo} alt="" draggable="false" />
        </div>
      </div>
      <span className="logo-3d-hint" id="logo-3d-hint">Kéo hoặc dùng phím mũi tên để xoay</span>
    </div>
  );
}
