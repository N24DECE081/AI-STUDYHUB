import { useEffect, useRef, useState } from 'react';
import { getFlashcardPronunciation } from '../../api';

export default function Pronunciation({ card }) {
  const [data, setData] = useState({ pronunciation: card.pronunciation || '', audioUrl: card.audioUrl || '' });
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const audio = useRef(null);
  const mounted = useRef(false);
  const playbackTimer = useRef(null);
  const stopAudio = () => {
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    window.speechSynthesis?.cancel();
    clearTimeout(playbackTimer.current);
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    getFlashcardPronunciation(card.front, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData({ pronunciation: card.pronunciation || result.pronunciation, audioUrl: card.audioUrl || result.audioUrl });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { mounted.current = false; clearTimeout(timer); controller.abort(); stopAudio(); };
  }, [card.front, card.pronunciation, card.audioUrl]);
  const fail = () => {
    stopAudio();
    if (mounted.current) { setState('idle'); setError('Không phát được âm thanh. Bạn vẫn có thể ôn thẻ và xem IPA.'); }
  };
  const play = async () => {
    setError('');
    if (state === 'playing') {
      if (audio.current) audio.current.pause(); else window.speechSynthesis?.pause();
      setState('paused'); return;
    }
    if (state === 'paused') {
      if (!audio.current) { window.speechSynthesis?.resume(); setState('playing'); return; }
      setState('loading'); playbackTimer.current = setTimeout(fail, 8000);
      try { await audio.current.play(); clearTimeout(playbackTimer.current); if (mounted.current && audio.current) setState('playing'); }
      catch { fail(); }
      return;
    }
    setState('loading');
    if (data.audioUrl) {
      const player = new Audio(data.audioUrl);
      player.onended = () => { if (mounted.current) setState('idle'); };
      player.onerror = fail;
      audio.current = player;
      playbackTimer.current = setTimeout(fail, 8000);
      try {
        await player.play();
        if (mounted.current && audio.current === player) { clearTimeout(playbackTimer.current); setState('playing'); }
        else player.pause();
      } catch { if (audio.current === player) fail(); }
    } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(card.front); speech.lang = 'en-US';
      speech.onstart = () => { clearTimeout(playbackTimer.current); if (mounted.current) setState('playing'); };
      speech.onend = () => { clearTimeout(playbackTimer.current); if (mounted.current) setState('idle'); };
      speech.onerror = () => { clearTimeout(playbackTimer.current); if (mounted.current) { setState('idle'); setError('Thiết bị chưa hỗ trợ giọng tiếng Anh.'); } };
      playbackTimer.current = setTimeout(fail, 8000);
      window.speechSynthesis.speak(speech);
    } else { setState('idle'); setError('Thiết bị chưa hỗ trợ âm thanh.'); }
  };
  return <div className="flashcard-pronunciation">
    {data.pronunciation && <p aria-label="Phiên âm IPA">{data.pronunciation}</p>}
    <button type="button" onClick={play} disabled={state === 'loading'}>{state === 'loading' ? 'Đang tải âm thanh…' : state === 'playing' ? '⏸ Tạm dừng' : state === 'paused' ? '▶ Tiếp tục' : '🔊 Phát âm tiếng Anh'}</button>
    {!data.audioUrl && <small>Giọng đọc của thiết bị</small>}{error && <p role="status">{error}</p>}
  </div>;
}
