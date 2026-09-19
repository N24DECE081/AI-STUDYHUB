#!/usr/bin/env python3
"""One-command verification for the StudyHub authentication foundation."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(label, cmd, env=None):
    print(f"\n=== {label} ===")
    print("$", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT, env=env)
    if result.returncode:
        print(f"{label}: FAIL")
        raise SystemExit(result.returncode)
    print(f"{label}: PASS")

run("PYTHON COMPILE", [sys.executable, "-m", "py_compile", "server.py", "run.py", *map(str, (ROOT/"backend/app/security").glob("*.py")), *map(str, (ROOT/"backend/app/db").glob("*.py"))])
run("JAVASCRIPT SYNTAX", ["node", "--check", "web/app.js"])
run("BACKEND AUTH + DATABASE TESTS", [sys.executable, "-m", "unittest", "discover", "-s", "backend/tests", "-p", "test_*.py"], env={**__import__('os').environ, "PYTHONPATH": "backend"})
run("HTTP API INTEGRATION TESTS", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], env={**__import__('os').environ, "PYTHONPATH": "backend"})
print("\nALL PHASE 2 AUTH CHECKS: PASS")
