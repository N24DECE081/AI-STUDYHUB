"""Real YouTube metadata; credentials stay on the server."""
import html
import json
import os
import re
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen


def search_music(query):
    query = str(query).strip()
    if not query or len(query) > 200:
        raise ValueError("Nhập tên bài hát hoặc link YouTube (tối đa 200 ký tự).")
    url = urlparse(query)
    if url.scheme:
        if url.scheme != "https" or url.hostname not in {"youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}:
            raise ValueError("Hãy dùng link HTTPS của YouTube.")
        video_id = parse_qs(url.query).get("v", [""])[0] if url.path == "/watch" else url.path.rstrip("/").split("/")[-1]
        if not re.fullmatch(r"[\w-]{11}", video_id):
            raise ValueError("Link YouTube không hợp lệ.")
        endpoint = "https://www.youtube.com/oembed?" + urlencode({"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"})
        with urlopen(Request(endpoint, headers={"User-Agent": "StudyHub/1.0"}), timeout=10) as response:
            item = json.load(response)
        return [{"id": video_id, "videoId": video_id, "title": item["title"], "artist": item["author_name"]}]
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        raise ValueError("Tìm theo tên chưa được cấu hình. Bạn có thể dán link YouTube hoặc tải tệp nhạc.")
    endpoint = "https://www.googleapis.com/youtube/v3/search?" + urlencode({
        "key": key, "part": "snippet", "type": "video", "videoEmbeddable": "true",
        "videoSyndicated": "true", "maxResults": 8, "q": query,
    })
    with urlopen(endpoint, timeout=10) as response:
        data = json.load(response)
    return [{"id": item["id"]["videoId"], "videoId": item["id"]["videoId"],
             "title": html.unescape(item["snippet"]["title"]), "artist": html.unescape(item["snippet"]["channelTitle"])}
            for item in data.get("items", [])]
