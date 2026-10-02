import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function LearningDialog({ title, children, onClose, busy = false, eyebrow = 'STUDYHUB · NOVA AI' }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog className="qc-dialog" ref={ref} aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div>
      <button type="button" className="btn btn-ghost" aria-label="Đóng hộp thoại" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>, document.body);
}
