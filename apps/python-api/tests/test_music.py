import unittest
from backend.app.music import _extract_video_id, search_music


class TestMusic(unittest.TestCase):
    def test_extract_video_id_various_formats(self):
        self.assertEqual(_extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(_extract_video_id("www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(_extract_video_id("youtube.com/watch?v=dQw4w9WgXcQ&list=123"), "dQw4w9WgXcQ")
        self.assertEqual(_extract_video_id("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(_extract_video_id("https://youtu.be/dQw4w9WgXcQ/"), "dQw4w9WgXcQ")
        self.assertEqual(_extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertIsNone(_extract_video_id("Stay Justin Bieber"))

    def test_search_music_empty_query(self):
        with self.assertRaises(ValueError):
            search_music("")


if __name__ == "__main__":
    unittest.main()
