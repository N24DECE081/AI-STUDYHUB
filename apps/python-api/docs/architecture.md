# StudyHub Architecture

```text
Browser / Frontend
       │ REST/JSON + multipart upload
       ▼
Python HTTP Backend
       │
       ├── Authentication / Authorization
       ├── Subjects / Courses
       ├── Documents / Uploads
       ├── Progress
       ├── Subscription
       └── AI Tutor (Phase 7)
       │
       ├──────────────► SQLite (dev) / PostgreSQL (prod)
       ├──────────────► File storage
       └──────────────► RAG + LLM services (future)
```

Phase 1 deliberately stops at the data foundation. The existing frontend continues to use the current MVP endpoints while the database layer is upgraded underneath it.
