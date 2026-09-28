export function parseFocusMediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const host = url.hostname.toLowerCase();
    let videoId;
    if (["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com"].includes(host)) {
      videoId = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})$/)?.[1];
    } else if (host === "youtu.be" || host === "www.youtu.be") {
      videoId = url.pathname.match(/^\/([\w-]{11})$/)?.[1];
    }
    if (videoId && /^[\w-]{11}$/.test(videoId)) {
      return { provider: "YouTube", src: `https://www.youtube.com/embed/${videoId}?playsinline=1` };
    }

    if (host === "open.spotify.com" || host === "www.open.spotify.com") {
      const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/);
      if (match) return { provider: "Spotify", src: `https://open.spotify.com/embed/${match[1]}/${match[2]}` };
    }
  } catch { /* Invalid URL. */ }
  return null;
}
