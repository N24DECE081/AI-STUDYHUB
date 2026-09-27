import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CloudRain, Coffee, Headphones, LibraryBig,
  Music2, Pause, Play, Plus, Settings2, Sparkles, Trees, VolumeX, X,
} from "lucide-react";
import focusLogo from "../assets/focus-space-logo.png";
import winterScene from "../assets/focus-winter.webp";
import cityScene from "../assets/focus-city.webp";
import starsScene from "../assets/focus-stars.webp";
import autumnScene from "../assets/focus-autumn.webp";
import forestScene from "../assets/focus-forest.webp";
import "./FocusSpacePage.css";

const SCENES = [
  { id: "winter", name: "Snowy meadow", src: winterScene },
  { id: "city", name: "Quiet city", src: cityScene },
  { id: "stars", name: "Starry night", src: starsScene },
  { id: "autumn", name: "Autumn cottage", src: autumnScene },
  { id: "forest", name: "Green forest", src: forestScene },
];
const MUSIC = [
  { id: "rain", name: "Rain", Icon: CloudRain, filter: "highpass", frequency: 500 },
  { id: "coffee", name: "Coffee Shop", Icon: Coffee, filter: "lowpass", frequency: 700 },
  { id: "forest", name: "Forest", Icon: Trees, filter: "bandpass", frequency: 1100 },
  { id: "library", name: "Library", Icon: LibraryBig, filter: "lowpass", frequency: 320 },
  { id: "silent", name: "Silent", Icon: VolumeX },
];
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function FocusSpacePage({ user, onBack }) {
  const [studyMinutes, setStudyMinutes] = useState(45);
  const [customStudy, setCustomStudy] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [music, setMusic] = useState("rain");
  const [scene, setScene] = useState("winter");
  const [customMusic, setCustomMusic] = useState(null);
  const [customScene, setCustomScene] = useState(null);
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [volume, setVolume] = useState(62);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("focus");
  const [remaining, setRemaining] = useState(45 * 60);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState("");
  const [soundError, setSoundError] = useState("");
  const [sceneError, setSceneError] = useState(false);
  const musicInputRef = useRef(null);
  const sceneInputRef = useRef(null);
  const deadlineRef = useRef(0);
  const finishedRef = useRef(false);
  const audioRef = useRef(null);
  const volumeRef = useRef(volume);

  const selectedMusic = MUSIC.find((item) => item.id === music);
  const musicName = music === "custom" ? customMusic?.name || "My music" : selectedMusic?.name || "Silent";
  const sceneSource = scene === "custom" ? customScene?.url : SCENES.find((item) => item.id === scene)?.src;
  const phaseSeconds = (phase === "focus" ? studyMinutes : breakMinutes) * 60;
  const progress = phaseSeconds ? Math.min(100, Math.max(0, Math.round((phaseSeconds - remaining) * 100 / phaseSeconds))) : 0;
  const avatar = String(user?.first_name || user?.name || "M").trim().charAt(0).toUpperCase() || "M";

  useEffect(() => () => {
    if (customMusic?.url) URL.revokeObjectURL(customMusic.url);
  }, [customMusic]);
  useEffect(() => () => {
    if (customScene?.url) URL.revokeObjectURL(customScene.url);
  }, [customScene]);

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setRunning(false);
        if (phase === "focus") setCompleted((count) => count + 1);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, phase]);

  useEffect(() => {
    if (!running || !ambientEnabled || music === "silent") return undefined;
    if (music === "custom") {
      if (!customMusic?.url) return undefined;
      const audio = new Audio(customMusic.url);
      let active = true;
      audio.loop = true;
      audio.volume = volumeRef.current / 100;
      audioRef.current = { audio };
      void audio.play().catch(() => { if (active) setSoundError("Không phát được tệp âm thanh này. Hãy chọn tệp khác."); });
      return () => {
        active = false;
        audio.pause();
        audioRef.current = null;
      };
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      queueMicrotask(() => setSoundError("Trình duyệt này chưa hỗ trợ âm thanh nền."));
      return undefined;
    }
    let context;
    try {
      context = new AudioContextClass();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = selectedMusic.filter;
      filter.frequency.value = selectedMusic.frequency;
      gain.gain.value = volumeRef.current / 100 * 0.13;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();
      audioRef.current = { gain };
      let active = true;
      void context.resume().catch(() => { if (active) setSoundError("Trình duyệt chặn âm thanh. Hãy thử bật lại âm thanh nền."); });
      return () => {
        active = false;
        source.stop();
        void context.close();
        audioRef.current = null;
      };
    } catch {
      if (context) void context.close();
      queueMicrotask(() => setSoundError("Không thể phát âm thanh nền trên trình duyệt này."));
      return undefined;
    }
  }, [running, ambientEnabled, music, customMusic, selectedMusic]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current?.audio) audioRef.current.audio.volume = volume / 100;
    if (audioRef.current?.gain) audioRef.current.gain.gain.value = volume / 100 * 0.13;
  }, [volume]);

  const chooseStudyTime = (minutes) => {
    setCustomStudy(false);
    setStudyMinutes(minutes);
    if (!sessionOpen) setRemaining(minutes * 60);
    setError("");
  };
  const chooseMusic = (id) => {
    if (id === "custom") {
      musicInputRef.current?.click();
      return;
    }
    setMusic(id);
    setSoundError("");
  };
  const uploadMusic = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setSoundError("Hãy chọn một tệp âm thanh hợp lệ.");
      return;
    }
    setCustomMusic({ name: file.name, url: URL.createObjectURL(file) });
    setMusic("custom");
    setSoundError("");
    event.target.value = "";
  };
  const uploadScene = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Hãy chọn một tệp ảnh hợp lệ.");
      return;
    }
    setCustomScene({ name: file.name, url: URL.createObjectURL(file) });
    setScene("custom");
    setSceneError(false);
    setError("");
    event.target.value = "";
  };
  const startFocus = () => {
    if (!Number.isFinite(studyMinutes) || studyMinutes < 1 || studyMinutes > 180) {
      setError("Thời gian học cần từ 1 đến 180 phút.");
      return;
    }
    setError("");
    setSoundError("");
    setPhase("focus");
    setRemaining(studyMinutes * 60);
    deadlineRef.current = Date.now() + studyMinutes * 60_000;
    finishedRef.current = false;
    setSessionOpen(true);
    setRunning(true);
  };
  const toggleTimer = () => {
    if (running) {
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      setRunning(false);
      return;
    }
    if (remaining === 0) {
      const nextPhase = phase === "focus" && breakMinutes > 0 ? "break" : "focus";
      const nextSeconds = (nextPhase === "focus" ? studyMinutes : breakMinutes) * 60;
      setPhase(nextPhase);
      setRemaining(nextSeconds);
      deadlineRef.current = Date.now() + nextSeconds * 1000;
    } else {
      deadlineRef.current = Date.now() + remaining * 1000;
    }
    finishedRef.current = false;
    setRunning(true);
  };
  const returnToSetup = () => {
    setRunning(false);
    setSessionOpen(false);
  };

  if (sessionOpen) return (
    <main className="focus-session" aria-label="Focus Space session">
      {sceneSource && !sceneError && <img className="focus-session__scene" src={sceneSource} alt="" onError={() => setSceneError(true)} />}
      <div className="focus-session__shade" />
      <header className="focus-session__top">
        <button type="button" className="focus-session__back" onClick={returnToSetup}><ArrowLeft aria-hidden="true" /> Focus Space</button>
        <div className="focus-session__tools">
          <button type="button" onClick={returnToSetup} aria-label="Chỉnh cài đặt" title="Chỉnh cài đặt"><Settings2 aria-hidden="true" /></button>
          <button type="button" onClick={() => { setAmbientEnabled((enabled) => !enabled); setSoundError(""); }} aria-label={ambientEnabled ? "Tắt âm thanh" : "Bật âm thanh"} aria-pressed={ambientEnabled} title={ambientEnabled ? "Tắt âm thanh" : "Bật âm thanh"}>{ambientEnabled ? <Music2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}</button>
          <button type="button" onClick={returnToSetup} aria-label="Đóng phiên học" title="Đóng phiên học"><X aria-hidden="true" /></button>
        </div>
      </header>
      <section className="focus-session__clock" aria-live="polite">
        <strong>{formatTime(remaining)}</strong>
        <span>{phase === "focus" ? "FOCUS TIME" : "BREAK TIME"}</span>
        <button type="button" onClick={toggleTimer}>{running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{running ? "Pause" : remaining === 0 ? (phase === "focus" && breakMinutes > 0 ? "Start break" : "New focus") : "Resume"}</button>
      </section>
      {soundError && <p className="focus-session__error" role="alert">{soundError}</p>}
      {sceneError && <p className="focus-session__error" role="alert">Không tải được cảnh nền. Bạn có thể quay lại để chọn cảnh khác.</p>}
      <footer className="focus-session__progress"><div><span>SESSION PROGRESS</span><span>{progress}%</span></div><progress value={progress} max="100" aria-label="Tiến độ phiên học" /></footer>
    </main>
  );

  return (
    <main className="focus-space-page" aria-labelledby="focus-space-title">
      <header className="focus-space-header">
        <button type="button" className="focus-space-brand" onClick={onBack} aria-label="Về StudyHub"><img src={focusLogo} alt="" /><span><strong>StudyHub</strong><small>Focus Space</small></span></button>
        <div className="focus-space-presence"><i aria-hidden="true" />Your quiet corner <span aria-hidden="true">{avatar}</span></div>
      </header>
      <div className="focus-space-layout">
        <section className="focus-space-setup">
          <div className="focus-space-intro"><span>YOUR SESSION</span><h1 id="focus-space-title">Create your focus space</h1><p>Set up your perfect study session.</p></div>

          <section className="focus-space-step" aria-labelledby="focus-time-title"><h2 id="focus-time-title"><span>01</span> Study time</h2>
            <div className="focus-space-time-options">{[25, 45, 60].map((minutes) => <button type="button" key={minutes} className={!customStudy && studyMinutes === minutes ? "is-selected" : ""} aria-pressed={!customStudy && studyMinutes === minutes} onClick={() => chooseStudyTime(minutes)}><strong>{minutes}</strong> min</button>)}<button type="button" className={customStudy ? "is-selected" : ""} aria-pressed={customStudy} onClick={() => setCustomStudy(true)}>Custom</button></div>
            {customStudy && <label className="focus-space-custom-time">Minutes <input type="number" min="1" max="180" value={studyMinutes} onChange={(event) => { setStudyMinutes(Number(event.target.value)); setRemaining(Number(event.target.value || 0) * 60); }} /></label>}
          </section>

          <section className="focus-space-step" aria-labelledby="break-time-title"><h2 id="break-time-title"><span>02</span> Break time</h2>
            <div className="focus-space-time-options">{[5, 10, 15, 0].map((minutes) => <button type="button" key={minutes} className={breakMinutes === minutes ? "is-selected" : ""} aria-pressed={breakMinutes === minutes} onClick={() => setBreakMinutes(minutes)}>{minutes ? <><strong>{minutes}</strong> min</> : "No break"}</button>)}</div>
          </section>

          <section className="focus-space-step" aria-labelledby="music-title"><h2 id="music-title"><span>03</span> Background music</h2>
            <div className="focus-space-music-options">{MUSIC.map(({ id, name, Icon }) => <button type="button" key={id} className={music === id ? "is-selected" : ""} aria-pressed={music === id} onClick={() => chooseMusic(id)}>{music === id && <Check className="focus-space-selected-check" aria-hidden="true" />}<span className="focus-space-music-icon"><Icon aria-hidden="true" /></span><small>{name}</small></button>)}<button type="button" className={music === "custom" ? "is-selected focus-space-add" : "focus-space-add"} onClick={() => chooseMusic("custom")}><span className="focus-space-music-icon"><Plus aria-hidden="true" /></span><small>{customMusic?.name || "Add Music"}</small></button></div>
            <input ref={musicInputRef} className="focus-space-file-input" type="file" accept="audio/*" onChange={uploadMusic} aria-label="Chọn tệp nhạc" />
          </section>

          <section className="focus-space-step" aria-labelledby="background-title"><h2 id="background-title"><span>04</span> Study background</h2>
            <div className="focus-space-scene-options">{SCENES.map((item) => <button type="button" key={item.id} className={scene === item.id ? "is-selected" : ""} onClick={() => { setScene(item.id); setSceneError(false); }} aria-label={item.name} aria-pressed={scene === item.id}><img src={item.src} alt="" loading="lazy" /></button>)}{customScene && <button type="button" className={scene === "custom" ? "is-selected" : ""} onClick={() => { setScene("custom"); setSceneError(false); }} aria-label={customScene.name} aria-pressed={scene === "custom"}><img src={customScene.url} alt="" /></button>}</div>
            <button type="button" className="focus-space-upload" onClick={() => sceneInputRef.current?.click()}><Plus aria-hidden="true" /><span>Upload from device</span></button>
            <input ref={sceneInputRef} className="focus-space-file-input" type="file" accept="image/*" onChange={uploadScene} aria-label="Chọn ảnh nền" />
          </section>

          <section className="focus-space-step focus-space-step--sound" aria-labelledby="sound-title"><h2 id="sound-title"><span>05</span> Sound</h2>
            <div className="focus-space-sound-controls"><label className="focus-space-sound-toggle">Ambient sound <input type="checkbox" checked={ambientEnabled} onChange={(event) => { setAmbientEnabled(event.target.checked); setSoundError(""); }} /><span aria-hidden="true" /></label><label className="focus-space-volume"><Music2 aria-hidden="true" /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} disabled={!ambientEnabled || music === "silent"} aria-label="Âm lượng âm thanh nền" /><span>{ambientEnabled && music !== "silent" ? volume : 0}%</span></label></div>
          </section>
          {error && <p className="focus-space-error" role="alert">{error}</p>}
          {soundError && <p className="focus-space-error" role="alert">{soundError}</p>}
          <button type="button" className="focus-space-start" onClick={startFocus}><Sparkles aria-hidden="true" /><span>START FOCUS</span><ArrowRight aria-hidden="true" /></button>
        </section>

        <aside className="focus-space-preview" aria-label="Live preview"><div className="focus-space-preview__heading"><div><span>LIVE PREVIEW</span><h2>Your little corner</h2></div><span className="focus-space-preview__music"><Headphones aria-hidden="true" />{musicName}</span></div>
          <div className="focus-space-preview__scene">{sceneSource && !sceneError ? <img src={sceneSource} alt={SCENES.find((item) => item.id === scene)?.name || customScene?.name || "Study background"} onError={() => setSceneError(true)} /> : <p>Không tải được cảnh nền. Hãy chọn cảnh khác.</p>}</div>
          <dl className="focus-space-preview__stats"><div><dt>FOCUS</dt><dd>{studyMinutes || 0} min</dd></div><div><dt>BREAK</dt><dd>{breakMinutes ? `${breakMinutes} min` : "None"}</dd></div><div><dt>AMBIENCE</dt><dd>{ambientEnabled && music !== "silent" ? `${volume}%` : "Off"}</dd></div></dl>
          <p>A calm space is ready whenever you are.</p>
          {completed > 0 && <small className="focus-space-preview__completed">{completed} focus session{completed > 1 ? "s" : ""} completed</small>}
        </aside>
      </div>
    </main>
  );
}
