import { useEffect, useRef, useState } from "react";
import focusSpaceLogo from "../assets/focus-space-logo.png";
import "./FocusSpaceLogo.css";

export default function FocusSpaceLogo({ onOpen }) {
  const [showLabel, setShowLabel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!showLabel) return undefined;
    const timeout = window.setTimeout(() => setShowLabel(false), 3200);
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setShowLabel(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowLabel(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showLabel]);

  const open = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setShowLabel(true);
    setError("");
    try {
      const result = await onOpen?.();
      if (result === false) setShowLabel(false);
    } catch {
      setError("Không mở được Không gian học tập. Vui lòng thử lại.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={"focus-space-logo" + (showLabel ? " is-open" : "")} ref={rootRef}>
      {(showLabel || error) && <button type="button" className="focus-space-logo__tip" onClick={open} disabled={busy} role={error ? "alert" : undefined}>{error || (busy ? "Đang mở..." : "Không gian học tập")}</button>}
      <button
        type="button"
        className="focus-space-logo__button"
        aria-label="Mở Không gian học tập"
        aria-expanded={showLabel}
        onMouseEnter={() => setShowLabel(true)}
        onFocus={() => setShowLabel(true)}
        onClick={open}
        disabled={busy}
      >
        <img src={focusSpaceLogo} alt="" draggable="false" />
      </button>
      <span className="focus-space-logo__bee focus-space-logo__bee--one" aria-hidden="true" />
      <span className="focus-space-logo__bee focus-space-logo__bee--two" aria-hidden="true" />
    </div>
  );
}
