import { useCallback, useEffect, useRef, useState } from "react";

export function useStudyTimer(onSave) {
  const [seconds, setSeconds] = useState(0); const [running, setRunning] = useState(false); const started = useRef(null); const lastActive = useRef(0);
  useEffect(() => { if (!running) return undefined; const timer = setInterval(() => { if (document.hidden || Date.now() - lastActive.current > 300000) setRunning(false); else setSeconds((value) => value + 1); }, 1000); return () => clearInterval(timer); }, [running]);
  useEffect(() => { const active = () => { lastActive.current = Date.now(); }; ["pointerdown", "keydown", "mousemove"].forEach((name) => window.addEventListener(name, active)); return () => ["pointerdown", "keydown", "mousemove"].forEach((name) => window.removeEventListener(name, active)); }, []);
  const start = useCallback(() => { started.current ||= new Date(); lastActive.current = Date.now(); setRunning(true); }, []);
  const finish = useCallback((context) => { if (seconds > 0 && started.current) onSave({ ...context, startedAt: started.current.toISOString(), endedAt: new Date().toISOString(), minutes: Math.max(1, Math.round(seconds / 60)), source: "timer" }); setSeconds(0); setRunning(false); started.current = null; }, [onSave, seconds]);
  return { seconds, running, start, pause: () => setRunning(false), finish };
}
