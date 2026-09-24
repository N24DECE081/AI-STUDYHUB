import unittest
from datetime import date, datetime, timezone
import re
import os
from unittest.mock import patch

from app.db.mysql import MySQLCursor, MySQLDatabase, SCHEMA_PATH
from server import H, subscription_effective_at


class MySQLSchemaCompatibilityTests(unittest.TestCase):
    def test_mysql_schema_keeps_business_constraints_without_sqlite_partial_indexes(self):
        statements = MySQLDatabase._mysql_statements()
        schema = "\n".join(statements)

        self.assertIn("INT AUTO_INCREMENT PRIMARY KEY", schema)
        self.assertIn("active_user_id BIGINT GENERATED ALWAYS AS", schema)
        self.assertIn("CREATE UNIQUE INDEX ux_active_subscription_per_user ON subscriptions(active_user_id)", schema)
        self.assertIn("CREATE UNIQUE INDEX ux_user_progress_course ON user_progress(user_id, course_id)", schema)
        self.assertIn("CREATE UNIQUE INDEX ux_user_progress_document ON user_progress(user_id, document_id)", schema)
        self.assertNotIn("AUTOINCREMENT", schema)
        self.assertNotIn("INSERT OR IGNORE", schema)
        self.assertNotIn("COLLATE NOCASE", schema)
        self.assertNotIn("CREATE TRIGGER", schema)
        self.assertNotRegex(schema, r"WHERE\s+(?:course_id|document_id)\s+IS\s+NOT\s+NULL")
        self.assertNotIn("\\nCREATE TABLE", schema)
        self.assertNotRegex(schema, r"\b\w+ LONGTEXT[^\n]*DEFAULT CURRENT_TIMESTAMP")

        sqlite_schema = SCHEMA_PATH.read_text(encoding="utf-8")
        sqlite_tables = set(re.findall(r"CREATE TABLE IF NOT EXISTS\s+(\w+)", sqlite_schema, re.IGNORECASE))
        mysql_tables = set(re.findall(r"CREATE TABLE IF NOT EXISTS\s+(\w+)", schema, re.IGNORECASE))
        sqlite_foreign_keys = len(re.findall(r"\bFOREIGN KEY\s*\(", sqlite_schema, re.IGNORECASE))
        mysql_foreign_keys = len(re.findall(r"\bFOREIGN KEY\s*\(", schema, re.IGNORECASE))
        sqlite_indexes = set(re.findall(r"CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+(\w+)", sqlite_schema, re.IGNORECASE))
        mysql_indexes = set(re.findall(r"CREATE (?:UNIQUE )?INDEX\s+(\w+)", schema, re.IGNORECASE))
        self.assertEqual(mysql_tables, sqlite_tables)
        self.assertEqual(mysql_foreign_keys, sqlite_foreign_keys)
        self.assertEqual(mysql_indexes, sqlite_indexes)

    def test_mysql_datetime_rows_serialize_like_sqlite_text_timestamps(self):
        class CursorStub:
            def fetchone(self):
                return {
                    "created_at": datetime(2026, 9, 24, 12, 30, 0),
                    "activity_date": date(2026, 9, 24),
                }

            def fetchall(self):
                return [self.fetchone()]

        cursor = MySQLCursor(CursorStub())
        self.assertEqual(cursor.fetchone(), {
            "created_at": "2026-09-24 12:30:00",
            "activity_date": "2026-09-24",
        })
        self.assertEqual(cursor.fetchall()[0]["created_at"], "2026-09-24 12:30:00")


class SubscriptionDateTests(unittest.TestCase):
    def test_effective_date_uses_calendar_month_and_clamps_month_end(self):
        start = datetime(2024, 1, 31, 23, 45, 0, tzinfo=timezone.utc)
        self.assertEqual(subscription_effective_at("month", start), "2024-02-29 23:45:00")

    def test_yearly_effective_date_clamps_leap_day(self):
        start = datetime(2024, 2, 29, 12, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(subscription_effective_at("year", start), "2025-02-28 12:00:00")

    def test_rejects_unknown_billing_cycle(self):
        with self.assertRaises(ValueError):
            subscription_effective_at("week", datetime(2026, 1, 1, tzinfo=timezone.utc))


class CorsConfigurationTests(unittest.TestCase):
    def test_environment_config_is_an_exact_origin_allowlist(self):
        handler = H.__new__(H)
        handler.headers = {"Origin": "https://studyhub.example"}
        with patch.dict(os.environ, {"STUDYHUB_CORS_ORIGINS": "https://studyhub.example, https://admin.studyhub.example"}):
            self.assertEqual(handler.cors_origin(), "https://studyhub.example")
            handler.headers = {"Origin": "https://studyhub.example.evil.test"}
            self.assertIsNone(handler.cors_origin())
            handler.headers = {"Origin": "http://localhost:5174"}
            self.assertIsNone(handler.cors_origin())


if __name__ == "__main__":
    unittest.main()
