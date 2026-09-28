import { searchFocusMusic } from '../api.js';

export const searchTracks = searchFocusMusic;

let youtubeAPI;
export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeAPI) youtubeAPI = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => { youtubeAPI = null; reject(new Error('Không tải được YouTube. Hãy thử lại.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { window.clearTimeout(timeout); youtubeAPI = null; reject(new Error('Không kết nối được YouTube.')); };
    document.head.append(script);
  });
  return youtubeAPI;
}
