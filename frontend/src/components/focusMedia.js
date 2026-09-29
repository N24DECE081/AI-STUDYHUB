export function parseFocusMediaUrl(value) {
  try {
    let raw = String(value || "").trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const host = url.hostname.toLowerCase();
    let videoId;
    if (["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com"].includes(host)) {
      const path = url.pathname.replace(/\/+$/, "");
      videoId = path === "/watch" ? url.searchParams.get("v") : path.match(/^\/(?:shorts|live|embed)\/([\w-]{11})$/)?.[1];
    } else if (host === "youtu.be" || host === "www.youtu.be") {
      const path = url.pathname.replace(/\/+$/, "");
      videoId = path.match(/^\/([\w-]{11})$/)?.[1];
    }
    if (videoId && /^[\w-]{11}$/.test(videoId)) {
      return { provider: "YouTube", src: `https://www.youtube.com/embed/${videoId}?playsinline=1`, videoId };
    }

    if (host === "open.spotify.com" || host === "www.open.spotify.com") {
      const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/);
      if (match) return { provider: "Spotify", src: `https://open.spotify.com/embed/${match[1]}/${match[2]}` };
    }
  } catch { /* Invalid URL. */ }
  return null;
}
