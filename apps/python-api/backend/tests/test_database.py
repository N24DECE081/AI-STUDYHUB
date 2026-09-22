import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.db.database import Database
from app.db.seed import seed

EXPECTED_TABLES = {
    "schema_migrations", "auth_sessions",
    "users", "subjects", "documents", "courses", "course_documents",
    "course_enrollments", "plans", "subscriptions", "chat_sessions",
    "chat_messages", "document_chunks", "user_progress","subscription_changes",
    "tutor_conversations", "tutor_messages", "tutor_assessments",
    "tutor_roadmaps", "tutor_exercises", "tutor_submissions"
}


class DatabasePhase1Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "studyhub.db"
        self.database = Database(self.db_path)
        self.database.initialize()

    def tearDown(self):
        self.tmp.cleanup()

    def test_all_tables_and_foreign_keys_exist(self):
        tables = {
            r[0] for r in self.database.fetch_all(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ) if not r[0].startswith("sqlite_")
        }
        self.assertEqual(tables, EXPECTED_TABLES)
        self.assertEqual(self.database.fetch_one("PRAGMA foreign_keys")[0], 1)

    def test_core_crud_and_relationships(self):
        with self.database.connect() as c:
            user_id = c.execute(
                "INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)",
                ("Test Student", "test@example.com", "hash"),
            ).lastrowid
            subject_id = c.execute(
                "INSERT INTO subjects(code,name) VALUES(?,?)", ("DBTEST", "Database Test")
            ).lastrowid
            document_id = c.execute(
                """INSERT INTO documents(
                    subject_id,uploaded_by,title,original_filename,storage_filename,
                    file_type,mime_type,file_size,storage_path
                ) VALUES(?,?,?,?,?,?,?,?,?)""",
                (subject_id, user_id, "Test PDF", "a.pdf", "abc.pdf", "pdf",
                 "application/pdf", 1234, "uploads/abc.pdf"),
            ).lastrowid
            course_id = c.execute(
                "INSERT INTO courses(subject_id,created_by,title) VALUES(?,?,?)",
                (subject_id, user_id, "Database Course"),
            ).lastrowid
            c.execute(
                "INSERT INTO course_documents(course_id,document_id,sort_order) VALUES(?,?,?)",
                (course_id, document_id, 1),
            )
            c.execute(
                "INSERT INTO course_enrollments(user_id,course_id) VALUES(?,?)",
                (user_id, course_id),
            )
            c.commit()

        row = self.database.fetch_one(
            "SELECT d.title,s.code,u.email FROM documents d JOIN subjects s ON s.id=d.subject_id JOIN users u ON u.id=d.uploaded_by WHERE d.id=?",
            (document_id,),
        )
        self.assertEqual(tuple(row), ("Test PDF", "DBTEST", "test@example.com"))
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM course_documents")[0], 1)

    def test_unique_and_check_constraints(self):
        with self.database.connect() as c:
            c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("One User", "one@example.com", "x"))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("Two User", "ONE@example.com", "x"))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)", ("Bad Role", "bad@example.com", "x", "owner"))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO subjects(code,name) VALUES(?,?)", ("X", ""))
            c.commit()

    def test_cascade_and_restrict_behaviour(self):
        with self.database.connect() as c:
            uid = c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("Cascade User", "cascade@example.com", "x")).lastrowid
            sid = c.execute("INSERT INTO subjects(code,name) VALUES(?,?)", ("CAS", "Cascade Subject")).lastrowid
            course = c.execute("INSERT INTO courses(subject_id,created_by,title) VALUES(?,?,?)", (sid, uid, "Cascade Course")).lastrowid
            session = c.execute("INSERT INTO chat_sessions(user_id,subject_id,title) VALUES(?,?,?)", (uid, sid, "Test Chat")).lastrowid
            c.execute("INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)", (session, "user", "Hello"))
            c.execute("INSERT INTO course_enrollments(user_id,course_id) VALUES(?,?)", (uid, course))
            c.commit()
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("DELETE FROM subjects WHERE id=?", (sid,))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("DELETE FROM users WHERE id=?", (uid,))

            cascade_uid = c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("Chat Only", "chatonly@example.com", "x")).lastrowid
            cascade_course = c.execute("INSERT INTO courses(subject_id,created_by,title) VALUES(?,?,?)", (sid, uid, "Chat Course")).lastrowid
            cascade_session = c.execute("INSERT INTO chat_sessions(user_id,title) VALUES(?,?)", (cascade_uid, "Cascade Chat")).lastrowid
            c.execute("INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)", (cascade_session, "user", "Hello"))
            c.execute("INSERT INTO course_enrollments(user_id,course_id) VALUES(?,?)", (cascade_uid, cascade_course))
            c.commit()
            c.execute("DELETE FROM users WHERE id=?", (cascade_uid,))
            c.commit()

        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM chat_sessions WHERE id=?", (session,))[0], 1)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM chat_messages WHERE session_id=?", (session,))[0], 1)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM course_enrollments WHERE user_id=?", (uid,))[0], 1)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM chat_sessions WHERE id=?", (cascade_session,))[0], 0)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM chat_messages WHERE session_id=?", (cascade_session,))[0], 0)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM course_enrollments WHERE user_id=?", (cascade_uid,))[0], 0)

    def test_partial_unique_business_rules(self):
        with self.database.connect() as c:
            uid = c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("Plan User", "plan@example.com", "x")).lastrowid
            plan = c.execute("INSERT INTO plans(name,price_monthly,price_yearly) VALUES(?,?,?)", ("Test Plan", 100, 1000)).lastrowid
            c.execute("INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)", (uid, plan, "active"))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)", (uid, plan, "pending"))
            c.execute("UPDATE subscriptions SET status='cancelled' WHERE user_id=?", (uid,))
            c.execute("INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)", (uid, plan, "active"))
            c.commit()

    def test_progress_rules(self):
        with self.database.connect() as c:
            uid = c.execute("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)", ("Progress User", "progress@example.com", "x")).lastrowid
            sid = c.execute("INSERT INTO subjects(code,name) VALUES(?,?)", ("PRG", "Progress")).lastrowid
            course = c.execute("INSERT INTO courses(subject_id,created_by,title) VALUES(?,?,?)", (sid, uid, "Progress Course")).lastrowid
            c.execute("INSERT INTO user_progress(user_id,course_id,progress_percent,completed) VALUES(?,?,?,?)", (uid, course, 100, 1))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("INSERT INTO user_progress(user_id,course_id,progress_percent) VALUES(?,?,?)", (uid, course, 101))
            c.commit()

    def test_seed_is_idempotent(self):
        seed(self.database)
        seed(self.database)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM users")[0], 3)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM subjects")[0], 4)
        self.assertEqual(self.database.fetch_one("SELECT COUNT(*) FROM plans")[0], 3)

    def test_expected_indexes_and_triggers(self):
        names = {
            r[0] for r in self.database.fetch_all(
                "SELECT name FROM sqlite_master WHERE type='index'"
            )
        }
        for required in {
            "ux_user_progress_course", "ux_user_progress_document",
            "ux_active_subscription_per_user", "ix_documents_subject_created",
            "ix_chat_messages_session_created", "ix_chunks_document_index",
        }:
            self.assertIn(required, names)
        triggers = {
            r[0] for r in self.database.fetch_all(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            )
        }
        self.assertTrue({"trg_users_updated_at", "trg_documents_updated_at", "trg_chat_sessions_updated_at"}.issubset(triggers))


if __name__ == "__main__":
    unittest.main()
