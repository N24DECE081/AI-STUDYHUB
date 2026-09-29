"""Real YouTube metadata; credentials stay on the server."""
import html
import json
import os
import re
from urllib.parse import urlencode, urlparse, parse_qs, quote
from urllib.request import Request, urlopen


def _extract_video_id(query):
    raw = str(query).strip()
    if not re.match(r"^https?://", raw, re.I):
        if any(h in raw.lower() for h in ["youtube.com", "youtu.be"]):
            raw = f"https://{raw}"
    try:
        url = urlparse(raw)
    except Exception:
        return None
    if not url.scheme or url.hostname not in {
        "youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"
    }:
        return None
    path = url.path.rstrip("/")
    if path == "/watch":
        vid = parse_qs(url.query).get("v", [""])[0]
    elif path.startswith(("/shorts", "/live", "/embed")):
        vid = path.split("/")[-1]
    elif url.hostname in ("youtu.be", "www.youtu.be"):
        vid = path.split("/")[-1]
    else:
        vid = parse_qs(url.query).get("v", [""])[0]
    if vid and re.fullmatch(r"[\w-]{11}", vid):
        return vid
    return None


def _scrape_search(query):
    try:
        req = Request(
            f"https://www.youtube.com/results?search_query={quote(query)}",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        )
        with urlopen(req, timeout=8) as response:
            html_text = response.read().decode("utf-8", errors="ignore")
        match = re.search(r"var ytInitialData = ({.*?});</script>", html_text)
        if not match:
            return []
        data = json.loads(match.group(1))
        contents = data.get("contents", {}).get("twoColumnSearchResultsRenderer", {}).get("primaryContents", {}).get("sectionListRenderer", {}).get("contents", [])
        results = []
        seen = set()
        for section in contents:
            items = section.get("itemSectionRenderer", {}).get("contents", [])
            for item in items:
                v = item.get("videoRenderer")
                if v and v.get("videoId"):
                    vid = v["videoId"]
                    if vid in seen:
                        continue
                    seen.add(vid)
                    title = v.get("title", {}).get("runs", [{}])[0].get("text", "Video")
                    author = v.get("ownerText", {}).get("runs", [{}])[0].get("text", "YouTube")
                    results.append({"id": vid, "videoId": vid, "title": html.unescape(title), "artist": html.unescape(author)})
                    if len(results) >= 8:
                        return results
        return results
    except Exception:
        return []


def search_music(query):
    query = str(query).strip()
    if not query or len(query) > 200:
        raise ValueError("Nhập tên bài hát hoặc link YouTube (tối đa 200 ký tự).")

    # 1. Direct YouTube link or video ID
    vid = _extract_video_id(query)
    if vid:
        try:
            endpoint = "https://www.youtube.com/oembed?" + urlencode({"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"})
            with urlopen(Request(endpoint, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}), timeout=8) as response:
                item = json.load(response)
            return [{"id": vid, "videoId": vid, "title": html.unescape(item.get("title", "YouTube Video")), "artist": html.unescape(item.get("author_name", "YouTube"))}]
        except Exception:
            return [{"id": vid, "videoId": vid, "title": "YouTube Video", "artist": "YouTube"}]

    # If the user explicitly tried to paste a link to YouTube but ID couldn't be extracted
    if any(h in query.lower() for h in ["youtube.com", "youtu.be"]):
        raise ValueError("Link YouTube không hợp lệ. Hãy kiểm tra lại đường dẫn.")

    # 2. Search by song / artist name
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if key:
        try:
            endpoint = "https://www.googleapis.com/youtube/v3/search?" + urlencode({
                "key": key, "part": "snippet", "type": "video", "videoEmbeddable": "true",
                "videoSyndicated": "true", "maxResults": 8, "q": query,
            })
            with urlopen(Request(endpoint, headers={"User-Agent": "StudyHub/1.0"}), timeout=8) as response:
                data = json.load(response)
            items = [{"id": item["id"]["videoId"], "videoId": item["id"]["videoId"],
                      "title": html.unescape(item["snippet"]["title"]), "artist": html.unescape(item["snippet"]["channelTitle"])}
                     for item in data.get("items", []) if "videoId" in item.get("id", {})]
            if items:
                return items
        except Exception:
            pass  # Fall back to public search

    # Fallback to public YouTube search scrape (no key required)
    fallback_items = _scrape_search(query)
    if fallback_items:
        return fallback_items

    return []
