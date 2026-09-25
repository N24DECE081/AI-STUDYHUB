"""SQLite database foundation and legacy migration for StudyHub."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterable, Optional
from contextlib import contextmanager

APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = APP_ROOT / "data" / "studyhub.db"
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class SQLiteConnection:
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def __getattr__(self, name):
        return getattr(self.connection, name)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if exc_type:
                self.connection.rollback()
            else:
                self.connection.commit()
        finally:
            self.connection.close()


class Database:
    def __init__(self, path: str | os.PathLike[str] = DEFAULT_DB_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self):
        conn = self.open_connection()
        try:
            yield conn
        finally:
            conn.close()

    def open_connection(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA synchronous = NORMAL")
        return SQLiteConnection(conn)

    @staticmethod
    def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}

    def _needs_legacy_migration(self, conn: sqlite3.Connection) -> bool:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        return "users" in tables and "password" in self._columns(conn, "users")

    def _create_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    def _repair_legacy_foreign_keys(self, conn: sqlite3.Connection) -> None:
        """Rebuild tables left pointing at temporary legacy tables by migration."""
        stale = conn.execute(
            "SELECT name, sql FROM sqlite_master "
            "WHERE type='table' AND sql LIKE '%legacy_%'"
        ).fetchall()
        if not stale:
            return

        conn.execute("PRAGMA foreign_keys = OFF")
        for table, create_sql in stale:
            if not create_sql:
                continue
            repaired = f"__repair_{table}"
            fixed_sql = create_sql.replace('"legacy_users"', "users")
            fixed_sql = fixed_sql.replace('"legacy_subjects"', "subjects")
            fixed_sql = fixed_sql.replace('"legacy_documents"', "documents")
            fixed_sql = fixed_sql.replace("legacy_users", "users")
            fixed_sql = fixed_sql.replace("legacy_subjects", "subjects")
            fixed_sql = fixed_sql.replace("legacy_documents", "documents")
            fixed_sql = fixed_sql.replace(f"CREATE TABLE {table}", f"CREATE TABLE {repaired}", 1)
            conn.execute(fixed_sql)
            columns = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
            names = ",".join(columns)
            conn.execute(f"INSERT INTO {repaired} ({names}) SELECT {names} FROM {table}")
            conn.execute(f"DROP TABLE {table}")
            conn.execute(f"ALTER TABLE {repaired} RENAME TO {table}")
        conn.execute("PRAGMA foreign_keys = ON")

    def _migrate_legacy(self, conn: sqlite3.Connection) -> None:
        """Migrate the original MVP schema while preserving users, subjects and documents."""
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN")
        try:
            conn.execute("ALTER TABLE users RENAME TO legacy_users")
            conn.execute("ALTER TABLE subjects RENAME TO legacy_subjects")
            conn.execute("ALTER TABLE documents RENAME TO legacy_documents")
            self._create_schema(conn)

            conn.execute(
                """INSERT INTO users(id,full_name,email,password_hash,role,created_at)
                   SELECT id,name,email,password,role,created_at FROM legacy_users"""
            )
            conn.execute(
                """INSERT INTO subjects(id,code,name,description,created_at)
                   SELECT id,code,name,description,CURRENT_TIMESTAMP FROM legacy_subjects"""
            )
            for row in conn.execute("SELECT * FROM legacy_documents"):
                filename = row[3] or "document"
                path = row[4] or filename
                ext = Path(filename).suffix.lower().lstrip(".") or "unknown"
                mime = {
                    ".pdf": "application/pdf",
                    ".txt": "text/plain",
                    ".md": "text/markdown",
                    ".mdf": "text/markdown",
                    ".doc": "application/msword",
                    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ".ppt": "application/vnd.ms-powerpoint",
                    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                }.get(Path(filename).suffix.lower(), "application/octet-stream")
                actual = Path(path)
                if not actual.is_absolute():
                    actual = APP_ROOT / "uploads" / actual.name
                size = actual.stat().st_size if actual.exists() else 0
                conn.execute(
                    """INSERT INTO documents(
                        id,title,description,original_filename,storage_filename,
                        file_type,mime_type,file_size,storage_path,status,
                        visibility,downloads,created_at,subject_id,uploaded_by
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        row[0], row[1], row[2], filename, actual.name,
                        ext, mime, size, str(actual.relative_to(APP_ROOT)) if actual.is_relative_to(APP_ROOT) else path,
                        "ready" if actual.exists() else "failed", "public", row[5] or 0,
                        row[6], row[7], row[8],
                    ),
                )
            conn.execute("DROP TABLE legacy_documents")
            conn.execute("DROP TABLE legacy_subjects")
            conn.execute("DROP TABLE legacy_users")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute("PRAGMA foreign_keys = ON")

    def _ensure_columns(self, conn: sqlite3.Connection) -> None:
        """Thêm cột mới cho database đã tồn tại trước đó.

        schema.sql chỉ dùng CREATE TABLE IF NOT EXISTS nên bảng cũ không tự có cột mới;
        không có bước này thì người đã chạy StudyHub từ trước sẽ lỗi "no such column".
        """
        additions = {
            'tutor_messages': {'payload': 'TEXT'},
            'users': {'first_name': 'TEXT', 'last_name': 'TEXT'},
            'subjects': {'created_by': 'INTEGER REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE'},
        }
        for table, columns in additions.items():
            existing = {row[1] for row in conn.execute(f'PRAGMA table_info({table})')}
            if not existing:
                continue
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {ddl}')

    def initialize(self) -> None:
        with self.connect() as conn:
            if self._needs_legacy_migration(conn):
                self._migrate_legacy(conn)
            else:
                self._repair_legacy_foreign_keys(conn)
                self._create_schema(conn)
            self._ensure_columns(conn)
            conn.commit()

    def execute(self, sql: str, params: Iterable = ()) -> int:
        with self.connect() as conn:
            cur = conn.execute(sql, tuple(params))
            conn.commit()
            return cur.lastrowid

    def fetch_one(self, sql: str, params: Iterable = ()) -> Optional[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(sql, tuple(params)).fetchone()

    def fetch_all(self, sql: str, params: Iterable = ()) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(sql, tuple(params)).fetchall()

    def transaction(self) -> sqlite3.Connection:
        return self.connect()


def get_database(path: str | os.PathLike[str] = DEFAULT_DB_PATH) -> Database:
    database = Database(path)
    database.initialize()
    return database
