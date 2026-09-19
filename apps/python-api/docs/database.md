# StudyHub — Database Foundation (Phase 1)

## Goal

Phase 1 establishes a relational database that can support authentication, subjects, learning documents, courses, subscriptions, AI Tutor conversations, RAG document chunks and learning progress without coupling the frontend to SQLite internals.

## Storage strategy

- Development: SQLite (`data/studyhub.db`).
- Production target: PostgreSQL.
- The application accesses the DB through `backend/app/db/database.py`, keeping SQL/schema concerns isolated from future API services.
- SQLite is configured with WAL, foreign keys, busy timeout and `synchronous=NORMAL` for a responsive local development experience.

## Tables

| Table | Purpose |
|---|---|
| `users` | Accounts, roles and account status |
| `subjects` | Academic subjects |
| `documents` | Uploaded learning files and processing state |
| `courses` | Structured learning courses |
| `course_documents` | Many-to-many course/document relation with ordering |
| `course_enrollments` | Student enrollment and completion state |
| `plans` | Free/Standard/Premium feature limits |
| `subscriptions` | User subscription state |
| `chat_sessions` | AI Tutor conversations and context |
| `chat_messages` | Messages inside a Tutor session |
| `document_chunks` | Text chunks prepared for future RAG/embeddings |
| `user_progress` | Course/document learning progress |
| `schema_migrations` | Database schema version tracking |

## Key relationships

```text
USER ───────────────< DOCUMENT >──────────── SUBJECT
  │                      │
  │                      └──────────────< DOCUMENT_CHUNK
  │
  ├──────────────< COURSE_ENROLLMENT >──────── COURSE
  │                                              │
  │                                              └──< COURSE_DOCUMENT >── DOCUMENT
  │
  ├──────────────< SUBSCRIPTION >──────── PLAN
  │
  └──────────────< CHAT_SESSION >──────── SUBJECT / DOCUMENT
                         │
                         └──────────────< CHAT_MESSAGE

USER ───────────────< USER_PROGRESS >──────── COURSE or DOCUMENT
```

## Integrity rules

- Email and subject code are case-insensitive unique keys.
- Roles and statuses use `CHECK` constraints.
- Documents require a valid subject and uploader.
- Course/document links use a composite primary key.
- One active/pending subscription is allowed per user.
- A progress record targets exactly one course **or** one document.
- Progress is 0–100%; completed records must be 100%.
- Chat messages require a non-empty role/content.
- Document chunks are unique by `(document_id, chunk_index)`.
- Deleting a user cascades personal chat/enrollment/progress data, while owned content such as documents/courses protects the owner with `RESTRICT`.

## Index strategy

Indexes cover the main future API access paths:

- documents by subject/time and uploader/time
- document processing status
- courses by subject/status
- course document ordering
- enrollments by course/status
- subscriptions by user/status
- chat sessions by user/time
- chat messages by session/time
- document chunks by document/index
- progress by user/time

## Migration

The original MVP database used `users.password`, `subjects` without timestamps and `documents.file_name/file_path/uploader_id`. `Database.initialize()` detects that schema and migrates it into the Phase 1 schema while preserving existing user, subject and document records. A backup of the original project DB is kept as `data/studyhub.db.pre_phase1_backup` during this transition.

## Future AI/RAG path

`document_chunks` intentionally stores chunk text and a future `embedding_key`. Phase 1 does **not** call an LLM or vector database. Later phases can add a vector store without redesigning users/documents/chat relationships.
