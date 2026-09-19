"""Idempotent development seed for StudyHub Phase 1."""
from __future__ import annotations

from .database import APP_ROOT, Database, DEFAULT_DB_PATH
from ..security.password import hash_password


def seed(database: Database | None = None) -> None:
    database = database or Database(DEFAULT_DB_PATH)
    database.initialize()
    with database.connect() as conn:
        insert_user = (
            "INSERT IGNORE INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)"
            if getattr(database, "dialect", "sqlite") == "mysql"
            else "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING"
        )
        users = [
            ("StudyHub Admin", "admin@studyhub.local", hash_password("Admin123!"), "admin"),
            ("Nguyen Thanh Mai", "teacher@studyhub.local", hash_password("Teacher123!"), "teacher"),
            ("StudyHub Student", "student@studyhub.local", hash_password("Student123!"), "student"),
        ]
        for row in users:
            conn.execute(insert_user, row)
        subjects = [
            ("ATTT", "Information Security", "Security fundamentals, cryptography and secure systems."),
            ("CSDL", "Database Systems", "Relational databases, SQL and database design."),
            ("RR", "Discrete Mathematics", "Logic, counting, probability and graph concepts."),
            ("LT", "Programming", "Programming fundamentals and practical software development."),
        ]
        insert_subject = (
            "INSERT IGNORE INTO subjects(code,name,description) VALUES(?,?,?)"
            if getattr(database, "dialect", "sqlite") == "mysql"
            else "INSERT INTO subjects(code,name,description) VALUES(?,?,?) ON CONFLICT(code) DO NOTHING"
        )
        for row in subjects:
            conn.execute(insert_subject, row)
        plans = [
            ("Free", 0, 0, "Core StudyHub learning features", 10, 100),
            ("Standard", 49000, 470000, "AI Tutor and advanced learning tools", 100, 2048),
            ("Premium", 99000, 950000, "Deep personalization and advanced AI Tutor", None, 10240),
        ]
        insert_plan = (
            "INSERT IGNORE INTO plans(name,price_monthly,price_yearly,description,ai_daily_limit,storage_limit) VALUES(?,?,?,?,?,?)"
            if getattr(database, "dialect", "sqlite") == "mysql"
            else "INSERT INTO plans(name,price_monthly,price_yearly,description,ai_daily_limit,storage_limit) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING"
        )
        for row in plans:
            conn.execute(insert_plan, row)

        teacher = conn.execute(
            "SELECT id FROM users WHERE email=?", ("teacher@studyhub.local",)
        ).fetchone()
        teacher_id = teacher["id"] if isinstance(teacher, dict) else (teacher[0] if teacher else None)
        demo_documents = [
            (
                "Information Security Fundamentals",
                "A compact learning guide for core information security concepts.",
                "security-fundamentals.txt",
                "ATTT",
                "Information Security Fundamentals\n\nSecurity fundamentals, cryptography and secure systems.\n\nThis demo document is stored locally and can be opened directly from StudyHub.",
            ),
            (
                "Database Systems - SQL Review",
                "SQL patterns, joins, grouping and query practice notes.",
                "database-sql-review.txt",
                "CSDL",
                "Database Systems - SQL Review\n\nSELECT, JOIN, GROUP BY and query practice notes.\n\nThis demo document is stored locally and can be opened directly from StudyHub.",
            ),
            (
                "Discrete Mathematics - Counting",
                "Counting principles and worked examples for exam preparation.",
                "discrete-counting.txt",
                "RR",
                "Discrete Mathematics - Counting\n\nCounting principles and worked examples for exam preparation.\n\nThis demo document is stored locally and can be opened directly from StudyHub.",
            ),
        ]
        if teacher_id:
            upload_root = APP_ROOT / "uploads"
            upload_root.mkdir(parents=True, exist_ok=True)
            for title, description, filename, code, content in demo_documents:
                subject = conn.execute("SELECT id FROM subjects WHERE code=?", (code,)).fetchone()
                if not subject:
                    continue
                subject_id = subject["id"] if isinstance(subject, dict) else subject[0]
                target = upload_root / filename
                if not target.exists():
                    target.write_text(content, encoding="utf-8")
                existing = conn.execute(
                    "SELECT id FROM documents WHERE title=?", (title,)
                ).fetchone()
                if not existing:
                    existing = conn.execute(
                        "SELECT id FROM documents WHERE subject_id=? AND original_filename=?",
                        (subject_id, filename.replace(".txt", ".pdf")),
                    ).fetchone()
                if not existing:
                    existing = conn.execute(
                        "SELECT id FROM documents WHERE storage_filename=?", (filename,)
                    ).fetchone()
                existing_id = existing["id"] if isinstance(existing, dict) else (existing[0] if existing else None)
                values = (filename, filename, filename.rsplit('.', 1)[-1], "text/plain", target.stat().st_size, f"uploads/{filename}")
                if existing_id:
                    conn.execute(
                        "DELETE FROM documents WHERE storage_filename=? AND id<>?",
                        (filename, existing_id),
                    )
                    conn.execute(
                        """UPDATE documents SET original_filename=?,storage_filename=?,file_type=?,
                           mime_type=?,file_size=?,storage_path=?,status='ready' WHERE id=?""",
                        (*values, existing_id),
                    )
                else:
                    conn.execute(
                        """INSERT INTO documents(title,description,original_filename,storage_filename,
                           file_type,mime_type,file_size,storage_path,status,subject_id,uploaded_by)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (title, description, *values, "ready", subject_id, teacher_id),
                    )
            for old_name, new_name in (
                ("security-fundamentals.pdf", "security-fundamentals.txt"),
                ("database-sql-review.pdf", "database-sql-review.txt"),
                ("discrete-counting.pdf", "discrete-counting.txt"),
            ):
                conn.execute(
                    "UPDATE documents SET original_filename=?,storage_filename=?,file_type='txt',"
                    "mime_type='text/plain',file_size=?,storage_path=?,status='ready' "
                    "WHERE original_filename=?",
                    (new_name, new_name, (upload_root / new_name).stat().st_size,
                     f"uploads/{new_name}", old_name),
                )
        conn.commit()


if __name__ == "__main__":
    seed()
    print("StudyHub Phase 1 seed complete.")
