import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.db.database import Database


class LegacyMigrationTests(unittest.TestCase):
    def test_original_mvp_database_is_migrated_without_data_loss(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "legacy.db"
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE subjects(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,description TEXT);
                CREATE TABLE documents(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT,file_name TEXT NOT NULL,file_path TEXT NOT NULL,downloads INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,subject_id INTEGER NOT NULL,uploader_id INTEGER NOT NULL);
                INSERT INTO users VALUES(1,'Legacy User','legacy@example.com','hash','teacher','2026-01-01 00:00:00');
                INSERT INTO subjects VALUES(1,'DB','Database','Legacy subject');
                INSERT INTO documents VALUES(1,'Legacy Doc','Old description','legacy.pdf','',4,'2026-01-02 00:00:00',1,1);
            """)
            conn.commit(); conn.close()

            db = Database(path)
            db.initialize()

            user = db.fetch_one("SELECT full_name,email,password_hash,role FROM users WHERE id=1")
            doc = db.fetch_one("SELECT title,original_filename,downloads,subject_id,uploaded_by FROM documents WHERE id=1")
            self.assertEqual(tuple(user), ('Legacy User','legacy@example.com','hash','teacher'))
            self.assertEqual(tuple(doc), ('Legacy Doc','legacy.pdf',4,1,1))
            self.assertIsNone(db.fetch_one("SELECT name FROM sqlite_master WHERE name='legacy_users'"))


if __name__ == '__main__':
    unittest.main()
