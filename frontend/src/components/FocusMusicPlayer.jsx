import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Search, ListMusic, Minimize2, Maximize2, GripHorizontal, Tv, Headphones, Plus, Trash2, RotateCcw, Upload } from 'lucide-react';
import { loadYouTubeAPI, searchTracks } from './focusMusicSearch.js';
import { emptyPlayer, playerReducer, clampPosition } from './focusPlayerState.js';
import { formatTime } from './focusMusic.js';
import './FocusMusicPlayer.css';

function saved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export default function FocusMusicPlayer({ initialTrack, initialVolume = 62, initialMuted = false }) {
  const [state, dispatch] = useReducer(playerReducer, { ...emptyPlayer, track: initialTrack, status: initialTrack ? 'loading' : 'idle' });
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(100, Number(saved('studyhub-player-volume', initialVolume)))));
  const [muted, setMuted] = useState(initialMuted);
  const [mode, setMode] = useState(() => saved('studyhub-player-mode', 'audio') === 'video' ? 'video' : 'audio');
  const [collapsed, setCollapsed] = useState(false);
  const [panel, setPanel] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ time: 0, duration: 0 });
  const [position, setPosition] = useState(() => saved('studyhub-player-pos', { x: 16, y: 110 }));
  const [dragging, setDragging] = useState(false);
  const shell = useRef(null);
  const videoHost = useRef(null);
  const audio = useRef(null);
  const player = useRef(null);
  const drag = useRef(null);
  const request = useRef(null);
  const uploads = useRef([]);
  const fileInput = useRef(null);
  const volumeRef = useRef({ volume, muted });
  const lastVolume = useRef(volume || 62);
  const playing = state.status === 'playing';
  const youtube = Boolean(state.track?.videoId);
  const spotify = Boolean(state.track?.spotify);

  useEffect(() => {
    volumeRef.current = { volume, muted };
    if (volume > 0) lastVolume.current = volume;
    if (audio.current) { audio.current.volume = volume / 100; audio.current.muted = muted; }
    if (player.current?.setVolume) {
      player.current.setVolume(volume);
      if (muted) player.current.mute(); else player.current.unMute();
    }
    try { localStorage.setItem('studyhub-player-volume', JSON.stringify(volume)); } catch { /* Storage is optional. */ }
  }, [volume, muted]);
  useEffect(() => {
    try { localStorage.setItem('studyhub-player-mode', JSON.stringify(mode)); } catch { /* Storage is optional. */ }
  }, [mode]);
  useEffect(() => () => { request.current?.abort(); uploads.current.forEach(URL.revokeObjectURL); }, []);

  useEffect(() => {
    if (!state.track) return;
    let disposed = false;
    let instance;
    const track = state.track;
    if (track.videoId) {
      loadYouTubeAPI().then((YT) => {
        if (disposed) return;
        const target = document.createElement('div');
        videoHost.current.replaceChildren(target);
        let ended = false;
        instance = new YT.Player(target, {
          videoId: track.videoId,
          playerVars: { playsinline: 1, origin: window.location.origin, controls: 1 },
          events: {
            onReady: ({ target: ready }) => {
              if (disposed) return;
              player.current = ready;
              ready.setVolume(volumeRef.current.volume);
              if (volumeRef.current.muted) ready.mute();
              ready.playVideo();
              dispatch({ type: 'status', status: 'paused' });
            },
            onStateChange: ({ data }) => {
              if (disposed) return;
              if (data === 1) { ended = false; dispatch({ type: 'status', status: 'playing' }); }
              if (data === 2) dispatch({ type: 'status', status: 'paused' });
              if (data === 0 && !ended) { ended = true; dispatch({ type: 'ended' }); }
            },
            onAutoplayBlocked: () => { if (!disposed) { dispatch({ type: 'status', status: 'paused' }); setNotice('Nhấn Phát để bắt đầu nghe.'); } },
            onError: () => { if (!disposed) { dispatch({ type: 'status', status: 'error' }); setError('Video không phát được hoặc không cho phép nhúng. Hãy chọn bài khác.'); } },
          },
        });
      }).catch((err) => { if (!disposed) { setError(err.message); dispatch({ type: 'status', status: 'error' }); } });
    } else if (track.url && audio.current) {
      audio.current.volume = volumeRef.current.volume / 100;
      audio.current.muted = volumeRef.current.muted;
      audio.current.play().catch(() => { if (!disposed) { dispatch({ type: 'status', status: 'paused' }); setNotice('Nhấn Phát để bắt đầu nghe.'); } });
    }
    return () => { disposed = true; player.current = null; instance?.destroy(); };
  }, [state.track, state.revision]);

  useEffect(() => {
    if (!youtube) return;
    const timer = window.setInterval(() => {
      if (player.current?.getCurrentTime) setProgress({ time: player.current.getCurrentTime(), duration: player.current.getDuration() });
    }, 500);
    return () => window.clearInterval(timer);
  }, [youtube]);

  useEffect(() => {
    const fit = () => {
      const rect = shell.current.getBoundingClientRect();
      setPosition((current) => clampPosition(current, rect.width, rect.height, window.innerWidth, window.innerHeight));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(shell.current);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  const resetPosition = () => {
    const rect = shell.current.getBoundingClientRect();
    const next = clampPosition({ x: 16, y: window.innerHeight - rect.height - 16 }, rect.width, rect.height, window.innerWidth, window.innerHeight);
    setPosition(next);
    try { localStorage.setItem('studyhub-player-pos', JSON.stringify(next)); } catch { /* Optional. */ }
  };
  const dragStart = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = shell.current.getBoundingClientRect();
    drag.current = { x: event.clientX - rect.x, y: event.clientY - rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const dragMove = (event) => {
    if (!drag.current) return;
    const rect = shell.current.getBoundingClientRect();
    const next = clampPosition({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y }, rect.width, rect.height, window.innerWidth, window.innerHeight);
    const clock = document.querySelector('.focus-session__clock')?.getBoundingClientRect();
    // Keep the timer and its controls reachable while moving the player.
    if (clock && next.x < clock.right && next.x + rect.width > clock.left && next.y < clock.bottom && next.y + rect.height > clock.top) return;
    setPosition(next);
  };
  const dragEnd = (event) => {
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    try { localStorage.setItem('studyhub-player-pos', JSON.stringify(position)); } catch { /* Optional. */ }
  };
  const select = (track) => { setError(''); setProgress({ time: 0, duration: 0 }); dispatch({ type: 'select', track }); };
  const next = () => { setError(''); setProgress({ time: 0, duration: 0 }); dispatch({ type: 'next' }); };
  const play = (replay = false) => {
    setError('');
    if (youtube) {
      if (replay || state.status === 'ended') player.current?.seekTo(0, true);
      if (playing && !replay) player.current?.pauseVideo(); else player.current?.playVideo();
    } else if (audio.current) {
      if (replay || state.status === 'ended') audio.current.currentTime = 0;
      if (playing && !replay) audio.current.pause();
      else audio.current.play().catch(() => setError('Không phát được tệp nhạc. Hãy chọn lại tệp.'));
    }
  };
  const search = async (event) => {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSearching(true); setError(''); setResults(null);
    try { const tracks = await searchTracks(query, controller.signal); if (!controller.signal.aborted) setResults(tracks); }
    catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const add = (track) => { dispatch({ type: 'add', track }); setNotice(`Đã thêm: ${track.title}`); };
  const upload = (event) => {
    for (const file of event.target.files || []) {
      if (!file.type.startsWith('audio/')) { setError('Hãy chọn tệp âm thanh.'); continue; }
      const url = URL.createObjectURL(file); uploads.current.push(url);
      add({ id: url, url, title: file.name, artist: 'Tệp trên thiết bị' });
    }
    event.target.value = '';
  };
  const VolumeIcon = muted || volume === 0 ? VolumeX : Volume2;

  return createPortal(<section ref={shell} className={`focus-player ${dragging ? 'is-dragging' : ''} ${mode === 'video' ? 'is-video' : ''}`} style={{ left: position.x, top: position.y }} aria-label="Trình phát nhạc tập trung">
    <header className="focus-player__header" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <span><GripHorizontal aria-hidden="true" /> Nhạc tập trung</span>
      <button onClick={resetPosition} aria-label="Đặt lại vị trí" title="Đặt lại vị trí"><RotateCcw /></button>
      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Mở rộng player' : 'Thu nhỏ player'} aria-expanded={!collapsed}>{collapsed ? <Maximize2 /> : <Minimize2 />}</button>
    </header>
    <div className="focus-player__track"><strong>{state.track?.title || 'Góc nhạc của bạn'}</strong><small>{state.track?.artist || 'Tìm một bài hát hoặc tải nhạc từ thiết bị.'}</small></div>
    {/* Keep a single media instance mounted when collapsing or changing display mode. */}
    {youtube && <div ref={videoHost} className="focus-player__video" />}
    {spotify && <iframe className="focus-player__spotify" title="Spotify" src={state.track.spotify} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" />}
    {state.track?.url && <audio ref={audio} src={state.track.url} onPlay={() => dispatch({ type: 'status', status: 'playing' })} onPause={() => dispatch({ type: 'status', status: 'paused' })} onEnded={() => dispatch({ type: 'ended' })} onError={() => setError('Không đọc được tệp âm thanh.')} onTimeUpdate={(e) => setProgress({ time: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0 })} />}
    {state.track && !spotify && <>
      <div className="focus-player__transport"><button onClick={() => play(true)} aria-label="Phát lại"><SkipBack /></button><button className="focus-player__play" onClick={() => play()} aria-label={playing ? 'Tạm dừng nhạc' : 'Phát nhạc'}>{playing ? <Pause /> : <Play />}</button><button disabled={!state.queue.length} onClick={next} aria-label="Bài tiếp theo"><SkipForward /></button></div>
      {!collapsed && <div className="focus-player__progress"><progress value={progress.time} max={progress.duration || 1} aria-label="Tiến trình bài hát" /><span>{formatTime(progress.time)} / {formatTime(progress.duration)}</span></div>}
    </>}
    {state.status === 'ended' && <p role="status">Đã phát xong. Nhấn Phát lại để nghe tiếp.</p>}
    {!collapsed && <>
      {!spotify && <div className="focus-player__volume"><button onClick={() => { if (muted || !volume) { setVolume(volume || lastVolume.current); setMuted(false); } else setMuted(true); }} aria-label={muted || !volume ? 'Bật âm thanh' : 'Tắt âm thanh'}><VolumeIcon /></button><input type="range" min="0" max="100" value={muted ? 0 : volume} aria-label="Âm lượng nhạc" aria-valuetext={`${muted ? 0 : volume}%`} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} /><span>{muted ? 0 : volume}%</span></div>}
      <div className="focus-player__toolbar"><button disabled={!youtube} onClick={() => setMode(mode === 'audio' ? 'video' : 'audio')} aria-pressed={mode === 'video'}>{mode === 'audio' ? <Headphones /> : <Tv />}{youtube ? mode === 'audio' ? 'Video gọn' : 'Video lớn' : 'Âm thanh'}</button><button onClick={() => setPanel(panel === 'search' ? '' : 'search')} aria-expanded={panel === 'search'}><Search />Tìm</button><button onClick={() => setPanel(panel === 'queue' ? '' : 'queue')} aria-expanded={panel === 'queue'}><ListMusic />{state.queue.length}</button></div>
      {youtube && <small className="focus-player__note">YouTube cần giữ video hiển thị. Tệp nhạc hỗ trợ chỉ âm thanh.</small>}
      {panel === 'search' && <div className="focus-player__panel"><form onSubmit={search}><input value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} placeholder="Tên bài, nghệ sĩ hoặc link YouTube" aria-label="Tìm nhạc YouTube" /><button disabled={!query.trim() || searching} aria-label="Tìm kiếm nhạc"><Search /></button></form><button onClick={() => fileInput.current.click()}><Upload />Tải tệp nhạc</button><input ref={fileInput} hidden type="file" accept="audio/*" multiple onChange={upload} />{searching && <p role="status">Đang tìm trên YouTube…</p>}{results?.length === 0 && <p>Không tìm thấy bài hát.</p>}<div className="focus-player__list">{results?.map((track) => <div key={track.id}><span><strong>{track.title}</strong><small>{track.artist}</small></span><button onClick={() => select(track)} aria-label={`Phát ${track.title}`}><Play /></button><button onClick={() => add(track)} aria-label={`Thêm ${track.title} vào hàng đợi`}><Plus /></button></div>)}</div></div>}
      {panel === 'queue' && <div className="focus-player__panel"><div className="focus-player__queue-heading"><strong>Hàng đợi · {state.queue.length}</strong><button disabled={!state.queue.length} onClick={() => dispatch({ type: 'clear' })}>Xóa hết</button></div>{!state.track && state.queue.length > 0 && <button onClick={next}><Play />Phát hàng đợi</button>}<div className="focus-player__list">{state.queue.map((track, index) => <div key={`${track.id}-${index}`}><span><strong>{track.title}</strong><small>{track.artist}</small></span><button aria-label={`Xóa ${track.title}`} onClick={() => dispatch({ type: 'remove', index })}><Trash2 /></button></div>)}</div>{!state.queue.length && <p>Chưa có bài tiếp theo.</p>}</div>}
    </>}
    {notice && <p className="focus-player__notice" role="status">{notice}</p>}{error && <p className="focus-player__error" role="alert">{error}</p>}
  </section>, document.body);
}
