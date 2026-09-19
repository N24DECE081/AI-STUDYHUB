"""Select the configured StudyHub database backend."""
from __future__ import annotations

import os

from .database import Database, DEFAULT_DB_PATH
from .mysql import MySQLDatabase


def mysql_requested() -> bool:
    mode = os.environ.get("STUDYHUB_DB_MODE", "auto").lower()
    return mode == "mysql" or (mode == "auto" and bool(os.environ.get("MYSQL_DATABASE")))


def get_runtime_database():
    if mysql_requested():
        return MySQLDatabase()
    return Database(os.environ.get("STUDYHUB_DB_PATH", str(DEFAULT_DB_PATH)))
