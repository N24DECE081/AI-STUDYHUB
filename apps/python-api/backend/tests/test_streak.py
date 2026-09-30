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
            return update_streak(self.conn, 1, record=True)

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

    def test_gaps_always_start_new_chain(self):
        self.visit("2026-09-20T10:00:00+07:00")
        for day in (22, 24, 26, 28):
            result = self.visit(f"2026-09-{day}T10:00:00+07:00")
            self.assertEqual(result['current_streak'], 1)
            self.assertEqual(result['recovery_count'], 0)
        self.assertEqual(self.visit("2026-09-29T10:00:00+07:00")['current_streak'], 2)

    def test_read_does_not_create_activity_and_expired_streak_has_no_fire(self):
        self.assertEqual(update_streak(self.conn, 1)['current_streak'], 0)
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM user_activity_days').fetchone()[0], 0)
        self.visit('2026-09-20T10:00:00+07:00')
        with patch('app.security.service.vietnam_now', return_value=datetime.fromisoformat('2026-09-22T00:00:00+07:00')):
            result = update_streak(self.conn, 1)
        self.assertEqual(result['current_streak'], 0)
        self.assertEqual(result['fire_level'], 0)

    def test_yesterday_is_valid_until_end_of_today(self):
        self.visit('2026-09-20T10:00:00+07:00')
        with patch('app.security.service.vietnam_now', return_value=datetime.fromisoformat('2026-09-21T23:59:59+07:00')):
            self.assertEqual(update_streak(self.conn, 1)['current_streak'], 1)

    def test_legacy_counter_cannot_invent_consecutive_days(self):
        self.conn.execute("INSERT INTO user_streaks(user_id,current_streak,last_activity_date) VALUES(1,5,'2026-09-27')")
        result = self.visit('2026-09-28T10:00:00+07:00')
        self.assertEqual(result['current_streak'], 1)
        self.assertEqual(result['activity_dates'], ['2026-09-28'])

    def test_sort_duplicates_future_and_fire_levels(self):
        for day in ('2026-09-29', '2026-09-27', '2026-09-28', '2026-10-02'):
            self.conn.execute('INSERT INTO user_activity_days(user_id,activity_date) VALUES(1,?)', (day,))
        result = self.visit('2026-09-29T10:00:00+07:00')
        self.assertEqual(result['current_streak'], 3)
        self.assertEqual(result['fire_level'], 3)
        self.assertNotIn('2026-10-02', result['activity_dates'])

    def test_calendar_boundaries(self):
        for previous, current in [('2024-02-28', '2024-02-29'), ('2025-12-31', '2026-01-01')]:
            with self.subTest(previous=previous):
                self.conn.execute('DELETE FROM user_activity_days')
                self.conn.execute('DELETE FROM user_streaks')
                self.visit(previous + 'T12:00:00+07:00')
                self.assertEqual(self.visit(current + 'T12:00:00+07:00')['current_streak'], 2)

if __name__ == '__main__':
    unittest.main()
