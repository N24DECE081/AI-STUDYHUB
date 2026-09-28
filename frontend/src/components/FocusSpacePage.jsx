import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, Headphones, Link2, Music2, Pause, Play, Plus,
  Settings2, Sparkles, X, RotateCcw, Sun, Moon,
} from "lucide-react";
import FocusMusicPlayer from "./FocusMusicPlayer.jsx";
import { MUSIC } from "./focusMusic.js";
import { parseFocusMediaUrl } from "./focusMedia.js";
import focusLogo from "../assets/focus-space-logo.png";
import "./FocusSpacePage.css";
import FlipClock from './FlipClock.jsx';
import MotivationalQuote from './MotivationalQuote.jsx';
import { remainingSeconds } from './focusPlayerState.js';

export default function FocusSpacePage({ user, onBack, active = true, theme, onToggleTheme }) {
  const [playerSession, setPlayerSession] = useState(null);
  const [studyMinutes, setStudyMinutes] = useState(45);
  const [customStudy, setCustomStudy] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [music, setMusic] = useState("silent");
  const [musicUrl, setMusicUrl] = useState("");
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

  const selectedMusic = MUSIC.find((item) => item.id === music);
  const mediaEmbed = parseFocusMediaUrl(musicUrl);
  const musicName = music === "stream" ? mediaEmbed?.provider || "YouTube / Spotify" : music === "custom" ? customMusic?.name || "My music" : selectedMusic?.name || "Silent";
  const sceneSource = customScene?.url;
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
      const next = remainingSeconds(deadlineRef.current);
      setRemaining(next);
      if (next === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setRunning(false);
        if (phase === "focus") setCompleted((count) => count + 1);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, phase]);

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
    setSceneError(false);
    setError("");
    event.target.value = "";
  };
  const startFocus = () => {
    if (!Number.isFinite(studyMinutes) || studyMinutes < 1 || studyMinutes > 180) {
      setError("Thời gian học cần từ 1 đến 180 phút.");
      return;
    }
    if (music === "stream" && !mediaEmbed) {
      setSoundError("Hãy dán URL YouTube hoặc Spotify hợp lệ.");
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
    const track = music === 'custom' && customMusic
      ? { id: customMusic.url, url: customMusic.url, title: customMusic.name, artist: 'Tệp trên thiết bị' }
      : music === 'stream' && mediaEmbed?.provider === 'YouTube'
        ? { id: musicUrl, videoId: mediaEmbed.src.match(/embed\/([^?]+)/)[1], title: 'YouTube', artist: 'Video đã chọn' }
        : music === 'stream' && mediaEmbed?.provider === 'Spotify'
          ? { id: musicUrl, spotify: mediaEmbed.src, title: 'Spotify', artist: 'Điều khiển bằng trình phát Spotify' } : null;
    setPlayerSession({ id: Date.now(), track });
  };
  const toggleTimer = () => {
    if (running) {
      setRemaining(remainingSeconds(deadlineRef.current));
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

  const resetTimer = () => {
    setRunning(false);
    setPhase('focus');
    setRemaining(studyMinutes * 60);
    finishedRef.current = false;
  };
  return <>
    {playerSession && <FocusMusicPlayer key={playerSession.id} initialTrack={playerSession.track} initialVolume={volume} initialMuted={!ambientEnabled} />}
    {active && (sessionOpen ? (
    <main className="focus-session" aria-label="Focus Space session">
      {sceneSource && !sceneError && <img className="focus-session__scene" src={sceneSource} alt="" onError={() => setSceneError(true)} />}
      <header className="focus-session__top">
        <button type="button" className="focus-session__back" onClick={onBack}><ArrowLeft aria-hidden="true" /> StudyHub</button>
        <div className="focus-session__tools">
          <button type="button" onClick={onToggleTheme} aria-label="Đổi giao diện sáng tối">{theme === 'dark' ? <Sun /> : <Moon />}</button>
          <button type="button" onClick={returnToSetup} aria-label="Chỉnh cài đặt" title="Chỉnh cài đặt"><Settings2 aria-hidden="true" /></button>
          <button type="button" onClick={returnToSetup} aria-label="Đóng phiên học" title="Đóng phiên học"><X aria-hidden="true" /></button>
        </div>
      </header>
      <div className="focus-session__center">
        <section className="focus-session__clock" aria-label="Đồng hồ đếm ngược">
          <FlipClock seconds={remaining} label={phase === "focus" ? "FOCUS TIME" : "BREAK TIME"} />
          <div className="focus-session__clock-controls">
            <button type="button" onClick={toggleTimer} aria-label={running ? "Tạm dừng đồng hồ" : remaining === 0 ? "Bắt đầu giai đoạn tiếp theo" : "Tiếp tục đồng hồ"} title={running ? "Tạm dừng" : remaining === 0 ? "Tiếp theo" : "Tiếp tục"}>{running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <button type="button" onClick={resetTimer} aria-label="Đặt lại đồng hồ" title="Đặt lại"><RotateCcw /></button>
          </div>
          {remaining === 0 && <p role="status">Hoàn thành {phase === 'focus' ? 'phiên học' : 'giờ nghỉ'}! Bạn đã làm rất tốt.</p>}
        </section>
        {soundError && <p className="focus-session__error" role="alert">{soundError}</p>}
        {sceneError && <p className="focus-session__error" role="alert">Không tải được cảnh nền. Bạn có thể quay lại để chọn cảnh khác.</p>}
      </div>
      <footer className="focus-session__progress"><div><span>SESSION PROGRESS</span><span>{progress}%</span></div><progress value={progress} max="100" aria-label="Tiến độ phiên học" /></footer>
      <MotivationalQuote />
    </main>
  ) : (
    <main className="focus-space-page" aria-labelledby="focus-space-title">
      <header className="focus-space-header">
        <button type="button" className="focus-space-brand" onClick={onBack} aria-label="Về StudyHub"><img src={focusLogo} alt="" /><span><strong>StudyHub</strong><small>Focus Space</small></span></button>
        <div className="focus-space-presence"><button type="button" onClick={onToggleTheme} aria-label="Đổi giao diện sáng tối">{theme === 'dark' ? <Sun /> : <Moon />}</button><i aria-hidden="true" />Your quiet corner <span aria-hidden="true">{avatar}</span></div>
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
            <div className="focus-space-music-options">{MUSIC.map(({ id, name, Icon }) => <button type="button" key={id} className={music === id ? "is-selected" : ""} aria-pressed={music === id} onClick={() => chooseMusic(id)}>{music === id && <Check className="focus-space-selected-check" aria-hidden="true" />}<span className="focus-space-music-icon"><Icon aria-hidden="true" /></span><small>{name}</small></button>)}<button type="button" className={music === "custom" ? "is-selected focus-space-add" : "focus-space-add"} onClick={() => chooseMusic("custom")}><span className="focus-space-music-icon"><Plus aria-hidden="true" /></span><small>{customMusic?.name || "Add Music"}</small></button><button type="button" className={music === "stream" ? "is-selected" : ""} aria-pressed={music === "stream"} onClick={() => chooseMusic("stream")}><span className="focus-space-music-icon"><Link2 aria-hidden="true" /></span><small>YouTube / Spotify</small></button></div>
            <input ref={musicInputRef} className="focus-space-file-input" type="file" accept="audio/*" onChange={uploadMusic} aria-label="Chọn tệp nhạc" />
            {music === "stream" && <label className="focus-space-music-url">Music URL<input type="url" value={musicUrl} onChange={(event) => { setMusicUrl(event.target.value); setSoundError(""); }} placeholder="https://www.youtube.com/watch?v=..." aria-label="URL YouTube hoặc Spotify" /></label>}
          </section>

          <section className="focus-space-step" aria-labelledby="background-title"><h2 id="background-title"><span>04</span> Study background</h2>
            {customScene && <div className="focus-space-scene-options"><img src={customScene.url} alt={customScene.name} /><button type="button" onClick={() => { setCustomScene(null); setSceneError(false); }} aria-label="Xóa ảnh nền đã chọn"><X aria-hidden="true" /></button></div>}
            <button type="button" className="focus-space-upload" onClick={() => sceneInputRef.current?.click()}><Plus aria-hidden="true" /><span>Upload from device</span></button>
            <input ref={sceneInputRef} className="focus-space-file-input" type="file" accept="image/*" onChange={uploadScene} aria-label="Chọn ảnh nền" />
          </section>

          <section className="focus-space-step focus-space-step--sound" aria-labelledby="sound-title"><h2 id="sound-title"><span>05</span> Sound</h2>
            {music === "stream" ? <p className="focus-space-provider-note">Phát nhạc và chỉnh âm lượng bằng trình phát {mediaEmbed?.provider || "YouTube / Spotify"} hoặc thiết bị của bạn.</p> : <div className="focus-space-sound-controls"><label className="focus-space-sound-toggle">Ambient sound <input type="checkbox" checked={ambientEnabled} onChange={(event) => { setAmbientEnabled(event.target.checked); setSoundError(""); }} /><span aria-hidden="true" /></label><label className="focus-space-volume"><Music2 aria-hidden="true" /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} disabled={!ambientEnabled || music === "silent"} aria-label="Âm lượng âm thanh nền" /><span>{ambientEnabled && music !== "silent" ? volume : 0}%</span></label></div>}
          </section>
          {error && <p className="focus-space-error" role="alert">{error}</p>}
          {soundError && <p className="focus-space-error" role="alert">{soundError}</p>}
          <button type="button" className="focus-space-start" onClick={startFocus}><Sparkles aria-hidden="true" /><span>START FOCUS</span><ArrowRight aria-hidden="true" /></button>
        </section>

        <aside className="focus-space-preview" aria-label="Live preview"><div className="focus-space-preview__heading"><div><span>LIVE PREVIEW</span><h2>Your little corner</h2></div><span className="focus-space-preview__music"><Headphones aria-hidden="true" />{musicName}</span></div>
          <div className="focus-space-preview__scene">{sceneSource && !sceneError ? <img src={sceneSource} alt={customScene.name} onError={() => setSceneError(true)} /> : <p>{sceneError ? "Không tải được ảnh nền. Hãy chọn ảnh khác." : "Chưa chọn ảnh nền"}</p>}</div>
          <dl className="focus-space-preview__stats"><div><dt>FOCUS</dt><dd>{studyMinutes || 0} min</dd></div><div><dt>BREAK</dt><dd>{breakMinutes ? `${breakMinutes} min` : "None"}</dd></div><div><dt>AMBIENCE</dt><dd>{music === "stream" ? mediaEmbed?.provider || "Link" : ambientEnabled && music !== "silent" ? `${volume}%` : "Off"}</dd></div></dl>
          <p>A calm space is ready whenever you are.</p>
          {completed > 0 && <small className="focus-space-preview__completed">{completed} focus session{completed > 1 ? "s" : ""} completed</small>}
        </aside>
      </div>
    </main>
  ))}
  </>;
}
