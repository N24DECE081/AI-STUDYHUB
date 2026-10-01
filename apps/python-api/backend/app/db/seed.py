"""Idempotent platform seed. User learning data is never seeded."""
from __future__ import annotations

from .database import Database, DEFAULT_DB_PATH
from ..security.password import hash_password


def seed(database: Database | None = None, *, include_demo_users: bool = True) -> None:
    database = database or Database(DEFAULT_DB_PATH)
    database.initialize()
    with database.connect() as conn:
        # Development-only accounts support local authentication tests; they own no learning data.
        users = [
            ("StudyHub Admin", "admin@studyhub.local", hash_password("Admin123!"), "admin"),
            ("StudyHub Teacher", "teacher@studyhub.local", hash_password("Teacher123!"), "teacher"),
            ("StudyHub Student", "student@studyhub.local", hash_password("Student123!"), "student"),
        ] if include_demo_users else []
        insert_user = "INSERT IGNORE INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)" if getattr(database, "dialect", "sqlite") == "mysql" else "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING"
        for row in users:
            conn.execute(insert_user, row)
        plans = [
            ("Free", 0, 0, "Core StudyHub learning features", 10, 100),
            ("Standard", 199000, 1990000, "AI Tutor and advanced learning tools", None, 2048),
            ("Premium", 299000, 2990000, "Deep personalization and advanced AI Tutor", None, 10240),
        ]
        insert_plan = "INSERT IGNORE INTO plans(name,price_monthly,price_yearly,description,ai_daily_limit,storage_limit) VALUES(?,?,?,?,?,?)" if getattr(database, "dialect", "sqlite") == "mysql" else "INSERT INTO plans(name,price_monthly,price_yearly,description,ai_daily_limit,storage_limit) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING"
        for row in plans:
            conn.execute(insert_plan, row)
        # Remove learning fixtures left by older versions without touching user uploads.
        fixture_names = ("security-fundamentals.txt", "database-sql-review.txt", "discrete-counting.txt", "security-fundamentals.pdf", "database-sql-review.pdf", "discrete-counting.pdf")
        marks = ",".join("?" for _ in fixture_names)
        conn.execute(f"DELETE FROM documents WHERE storage_filename IN ({marks})", fixture_names)
        conn.commit()


if __name__ == "__main__":
    seed()
