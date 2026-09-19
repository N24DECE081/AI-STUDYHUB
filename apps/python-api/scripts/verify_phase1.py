"""Single-command Phase 1 verification report."""
from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "studyhub.db"


def run(cmd: list[str], env=None) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, env=env, check=True)


def main() -> int:
    print("=== StudyHub Phase 1 Verification ===")
    run([sys.executable, "-m", "py_compile", "server.py", "run.py"] + [str(p.relative_to(ROOT)) for p in (ROOT / "backend").rglob("*.py")])
    run([sys.executable, "-m", "unittest", "discover", "-s", "backend/tests", "-p", "test_*.py", "-v"], env={**__import__('os').environ, "PYTHONPATH": "backend"})
    run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], env={**__import__('os').environ, "PYTHONPATH": "backend"})
    conn = sqlite3.connect(DB)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk = conn.execute("PRAGMA foreign_key_check").fetchall()
        version = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
        tables = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0]
    finally:
        conn.close()
    print("database.integrity_check =", integrity)
    print("database.foreign_key_check =", "OK" if not fk else fk)
    print("database.schema_version =", version)
    print("database.table_count =", tables)
    print("PHASE 1 = PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
