import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.db.database import Database
from app.db.seed import seed
from app.security.password import hash_password, verify_password, needs_rehash, normalize_email, validate_email, validate_password
from app.security.service import authenticate, register, current_user
from app.security.session import create_session, get_user_id, revoke_session


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(Path(self.tmp.name) / "studyhub.db")
        self.db.initialize()
        seed(self.db)

    def tearDown(self):
        self.tmp.cleanup()

    def test_password_hash_is_salted_and_verifiable(self):
        h1 = hash_password("StrongPass123!")
        h2 = hash_password("StrongPass123!")
        self.assertNotEqual(h1, h2)
        self.assertTrue(h1.startswith("pbkdf2_sha256$"))
        self.assertTrue(verify_password("StrongPass123!", h1))
        self.assertFalse(verify_password("WrongPass123!", h1))
        self.assertFalse(needs_rehash(h1))

    def test_validation_and_normalization(self):
        self.assertEqual(normalize_email("  STUDENT@Example.COM "), "student@example.com")
        self.assertTrue(validate_email("student@example.com"))
        self.assertFalse(validate_email("not-an-email"))
        self.assertIsNotNone(validate_password("short"))
        self.assertIsNone(validate_password("LongEnough123!"))

    def test_login_upgrades_legacy_sha256_password(self):
        import hashlib
        legacy = hashlib.sha256(b"LegacyPass123!").hexdigest()
        with self.db.connect() as c:
            uid = c.execute(
                "INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)",
                ("Legacy User", "legacy@example.com", legacy),
            ).lastrowid
            result, error = authenticate(c, "LEGACY@example.com", "LegacyPass123!")
            self.assertIsNone(error)
            user, token, _ = result
            self.assertEqual(user["id"], uid)
            stored = c.execute("SELECT password_hash FROM users WHERE id=?", (uid,)).fetchone()[0]
            self.assertTrue(stored.startswith("pbkdf2_sha256$"))
            self.assertTrue(verify_password("LegacyPass123!", stored))
            self.assertEqual(get_user_id(c, token), uid)
            revoke_session(c, token)
            self.assertIsNone(get_user_id(c, token))

    def test_register_auto_login_and_public_user(self):
        with self.db.connect() as c:
            result, error = register(c, "New Student", "NEW@EXAMPLE.COM", "NewPass123!")
            self.assertIsNone(error)
            user, token, _ = result
            self.assertEqual(user["email"], "new@example.com")
            self.assertNotIn("password", user)
            self.assertNotIn("password_hash", user)
            self.assertEqual(current_user(c, token)["id"], user["id"])

    def test_register_duplicate_and_blocked_login(self):
        with self.db.connect() as c:
            result, error = register(c, "Duplicate", "student@studyhub.local", "NewPass123!")
            self.assertIsNone(result)
            self.assertEqual(error, "Email đã tồn tại")
            c.execute("UPDATE users SET status='blocked' WHERE email='student@studyhub.local'")
            c.commit()
            result, error = authenticate(c, "student@studyhub.local", "Student123!")
            self.assertIsNone(result)
            self.assertEqual(error, "Tài khoản đang bị khóa")

    def test_session_is_database_backed(self):
        with self.db.connect() as c:
            user_id = c.execute("SELECT id FROM users LIMIT 1").fetchone()[0]
            token, _ = create_session(c, user_id)
            self.assertEqual(get_user_id(c, token), user_id)
            # Only a SHA-256 token hash is stored; raw session token is not.
            raw_count = c.execute("SELECT COUNT(*) FROM auth_sessions WHERE token_hash=?", (token,)).fetchone()[0]
            self.assertEqual(raw_count, 0)


if __name__ == "__main__":
    unittest.main()
