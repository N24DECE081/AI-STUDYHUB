# StudyHub Backend

## Phase 1

This folder contains the database foundation only. API modules will be added in later phases.

### Run database initialization + seed

From the project root:

```bash
PYTHONPATH=backend python -m app.db.seed
```

Windows PowerShell:

```powershell
$env:PYTHONPATH="backend"
python -m app.db.seed
```

### Run database tests

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -p "test_*.py" -v
```

The test suite covers schema creation, relationships, constraints, indexes, cascades/restrict rules, idempotent seed and migration from the original MVP schema.

## Authentication foundation

Phase 2 starts with authentication. The implementation is database-backed and uses PBKDF2 password hashing plus HttpOnly session cookies. See `docs/authentication.md` for the request flow and security model.
