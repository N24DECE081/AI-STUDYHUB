"""MySQL database adapter for StudyHub.

The HTTP layer uses SQLite-style question-mark parameters. This adapter
translates them for mysql-connector and returns dictionary rows so the
existing service and API code can share the same query contracts.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime
from contextlib import contextmanager
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def _normalize_row(row):
    if row is None:
        return None
    return {
        key: value.strftime("%Y-%m-%d %H:%M:%S") if isinstance(value, datetime)
        else value.strftime("%Y-%m-%d") if isinstance(value, date)
        else value
        for key, value in row.items()
    }


class MySQLCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def __getattr__(self, name):
        return getattr(self.cursor, name)

    def fetchone(self):
        return _normalize_row(self.cursor.fetchone())

    def fetchall(self):
        return [_normalize_row(row) for row in self.cursor.fetchall()]


class MySQLConnection:
    dialect = "mysql"

    def __init__(self, connection):
        self.connection = connection

    @staticmethod
    def _sql(sql: str) -> str:
        return sql.replace("?", "%s")

    def execute(self, sql: str, params=()):
        cursor = self.connection.cursor(dictionary=True)
        cursor.execute(self._sql(sql), tuple(params))
        return MySQLCursor(cursor)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()


class MySQLDatabase:
    dialect = "mysql"

    def __init__(self):
        self.host = os.environ.get("MYSQL_HOST", "127.0.0.1")
        self.port = int(os.environ.get("MYSQL_PORT", "3306"))
        self.user = os.environ.get("MYSQL_USER", "root")
        self.password = os.environ.get("MYSQL_PASSWORD", "")
        self.name = os.environ.get("MYSQL_DATABASE", "studyhub")
        if not re.fullmatch(r"[A-Za-z0-9_]+", self.name):
            raise ValueError("MYSQL_DATABASE must contain only letters, numbers, and underscores")

    def _connect(self, with_database=True):
        try:
            import mysql.connector
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "MySQL mode requires mysql-connector-python. Run: "
                "python -m pip install -r requirements.txt"
            ) from exc
        config = {
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "password": self.password,
        }
        if with_database:
            config["database"] = self.name
        return mysql.connector.connect(**config)

    @contextmanager
    def connect(self):
        connection = self.open_connection()
        try:
            yield connection
        finally:
            connection.close()

    def open_connection(self):
        return MySQLConnection(self._connect())

    @staticmethod
    def _mysql_statements():
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        schema = schema.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "INT AUTO_INCREMENT PRIMARY KEY")
        # The database default is utf8mb4_general_ci, matching SQLite's
        # case-insensitive uniqueness without placing a COLLATE clause after
        # SQLite's column-level UNIQUE syntax.
        schema = schema.replace("COLLATE NOCASE", "")
        schema = re.sub(r"\bTEXT\b", "LONGTEXT", schema)
        # MySQL cannot index LONGTEXT or use CURRENT_TIMESTAMP defaults on it.
        indexed_varchars = {
            "email": "VARCHAR(320)", "code": "VARCHAR(32)", "name": "VARCHAR(100)",
            "storage_filename": "VARCHAR(255)", "token_hash": "VARCHAR(64)",
            "original_filename": "VARCHAR(255)", "file_type": "VARCHAR(32)",
            "mime_type": "VARCHAR(127)", "role": "VARCHAR(20)", "status": "VARCHAR(20)",
            "visibility": "VARCHAR(20)", "billing_cycle": "VARCHAR(10)",
            "session_key": "VARCHAR(64)",
            "cache_key": "VARCHAR(64)",
        }
        for column, mysql_type in indexed_varchars.items():
            schema = re.sub(rf"(\b{column}\s+)LONGTEXT\b", rf"\g<1>{mysql_type}", schema)
        schema = re.sub(
            r"\b(created_at|updated_at|last_seen_at|applied_at|started_at|ended_at|expires_at|last_login_at|effective_at|enrolled_at|completed_at)\s+LONGTEXT\b",
            lambda match: f"{match.group(1)} DATETIME",
            schema,
        )
        schema = re.sub(
            r"\bupdated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            schema,
        )
        schema = re.sub(
            r"(CREATE TABLE IF NOT EXISTS subscriptions\s*\(.*?)(\n\);)",
            lambda match: f"{match.group(1)},\n    active_user_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('pending','active') THEN user_id ELSE NULL END) STORED{match.group(2)}",
            schema,
            flags=re.IGNORECASE | re.DOTALL,
        )
        schema = schema.replace("INSERT OR IGNORE", "INSERT IGNORE")
        schema = schema.replace("CREATE INDEX IF NOT EXISTS", "CREATE INDEX")
        schema = schema.replace("CREATE UNIQUE INDEX IF NOT EXISTS", "CREATE UNIQUE INDEX")
        schema = re.sub(
            r"CREATE UNIQUE INDEX ux_user_progress_(course|document)\s+ON user_progress\((user_id,\s*(course_id|document_id))\)\s+WHERE\s+(?:course_id|document_id)\s+IS\s+NOT\s+NULL;",
            r"CREATE UNIQUE INDEX ux_user_progress_\1 ON user_progress(\2);",
            schema,
            flags=re.IGNORECASE,
        )
        schema = re.sub(
            r"CREATE UNIQUE INDEX ux_active_subscription_per_user.*?;",
            "CREATE UNIQUE INDEX ux_active_subscription_per_user ON subscriptions(active_user_id);",
            schema,
            flags=re.IGNORECASE | re.DOTALL,
        )
        schema = re.sub(
            r"CREATE TRIGGER IF NOT EXISTS .*?END;",
            "",
            schema,
            flags=re.IGNORECASE | re.DOTALL,
        )
        return [statement.strip() for statement in schema.split(";") if statement.strip()]

    def initialize(self):
        connection = MySQLConnection(self._connect(with_database=False))
        try:
            connection.execute(
                f"CREATE DATABASE IF NOT EXISTS `{self.name}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
            )
            connection.commit()
        finally:
            connection.close()

        with self.connect() as connection:
            for statement in self._mysql_statements():
                try:
                    connection.execute(statement)
                except Exception as exc:
                    # CREATE INDEX is not portable across MySQL versions when
                    # IF NOT EXISTS is used; duplicate indexes are harmless.
                    if "1061" not in str(exc) and "duplicate key name" not in str(exc).lower():
                        raise
            connection.commit()

    def execute(self, sql: str, params=()):
        with self.connect() as connection:
            cursor = connection.execute(sql, params)
            connection.commit()
            return cursor.lastrowid

    def fetch_one(self, sql: str, params=()):
        with self.connect() as connection:
            return connection.execute(sql, params).fetchone()

    def fetch_all(self, sql: str, params=()):
        with self.connect() as connection:
            return connection.execute(sql, params).fetchall()


def get_mysql_database() -> MySQLDatabase:
    return MySQLDatabase()
