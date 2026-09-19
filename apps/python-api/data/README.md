# Local database

`studyhub.db` is the local development database. It is useful for running the project immediately, but database files are ignored by Git so production credentials/data are never committed accidentally.

To rebuild/seed the database:

```bash
PYTHONPATH=backend python -m app.db.seed
```
