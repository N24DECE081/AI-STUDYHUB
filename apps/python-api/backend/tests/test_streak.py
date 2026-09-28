import sqlite3
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from app.security.service import update_streak
from app.timezone import VIETNAM_TZ, vietnam_now


class StreakTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript((Path(__file__).parents[1] / "app/db/schema.sql").read_text(encoding="utf-8"))
        self.conn.execute("INSERT INTO users(id,full_name,email,password_hash) VALUES(1,'Test','test@example.com','hash')")
        self.addCleanup(self.conn.close)

    def visit(self, stamp):
        now = datetime.fromisoformat(stamp).astimezone(VIETNAM_TZ)
        with patch("app.security.service.vietnam_now", return_value=now):
            return update_streak(self.conn, 1)

    def test_gmt7_midnight_and_repeated_visits(self):
        self.assertEqual(vietnam_now().utcoffset().total_seconds(), 7 * 3600)
        first = self.visit("2026-09-27T16:59:59+00:00")
        self.assertEqual(first["today"], "2026-09-27")
        self.assertEqual(self.visit("2026-09-27T16:59:59+00:00")["current_streak"], 1)
        second = self.visit("2026-09-27T17:00:00+00:00")
        self.assertEqual(second["today"], "2026-09-28")
        self.assertEqual(second["current_streak"], 2)
        self.assertEqual(second["activity_dates"], ["2026-09-27", "2026-09-28"])
        self.assertEqual(self.visit("2026-09-28T10:00:00+07:00")["current_streak"], 2)

    def test_three_recoveries_then_restart_at_one(self):
        self.visit("2026-09-20T10:00:00+07:00")
        for count, day in enumerate((22, 24, 26), 1):
            result = self.visit(f"2026-09-{day}T10:00:00+07:00")
            self.assertEqual(result["current_streak"], count + 1)
            self.assertEqual(result["recovery_count"], count)
            self.assertNotIn(f"2026-09-{day - 1}", result["activity_dates"])
            self.assertEqual(self.visit(f"2026-09-{day}T11:00:00+07:00")["recovery_count"], count)
        result = self.visit("2026-09-28T10:00:00+07:00")
        self.assertEqual(result["current_streak"], 1)
        self.assertEqual(result["recovery_count"], 3)
        self.assertEqual(self.visit("2026-09-29T10:00:00+07:00")["current_streak"], 2)

    def test_existing_last_day_is_preserved_without_inventing_history(self):
        self.conn.execute("INSERT INTO user_streaks(user_id,current_streak,last_activity_date) VALUES(1,5,'2026-09-27')")
        result = self.visit("2026-09-28T10:00:00+07:00")
        self.assertEqual(result["current_streak"], 6)
        self.assertEqual(result["activity_dates"], ["2026-09-27", "2026-09-28"])


if __name__ == "__main__":
    unittest.main()
