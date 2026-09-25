
CREATE TABLE IF NOT EXISTS schema_migrations (
    version         INTEGER PRIMARY KEY,
    description     TEXT NOT NULL,
    applied_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name       TEXT NOT NULL CHECK(length(trim(full_name)) >= 2),
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'student'
                    CHECK(role IN ('student', 'teacher', 'admin')),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active', 'blocked')),
    avatar_url      TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash      TEXT NOT NULL UNIQUE,
    user_id         INTEGER NOT NULL,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_expires
    ON auth_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires
    ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    provider            TEXT NOT NULL CHECK(provider IN ('google', 'facebook')),
    provider_user_id    TEXT NOT NULL,
    provider_email      TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_oauth_accounts_user
    ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS study_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    session_key      TEXT NOT NULL UNIQUE,
    started_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at         TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active', 'completed')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK((status = 'active' AND ended_at IS NULL) OR
          (status = 'completed' AND ended_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_study_sessions_user_started
    ON study_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_study_sessions_user_status
    ON study_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS external_knowledge_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key   TEXT NOT NULL UNIQUE,
    keywords    TEXT NOT NULL,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    provider    TEXT,
    hit_count   INTEGER NOT NULL DEFAULT 0 CHECK(hit_count >= 0),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_external_cache_updated
    ON external_knowledge_cache(updated_at DESC);

CREATE TABLE IF NOT EXISTS user_streaks (
    user_id             INTEGER PRIMARY KEY,
    current_streak      INTEGER NOT NULL DEFAULT 0 CHECK(current_streak >= 0),
    last_activity_date  TEXT,
    recovery_count      INTEGER NOT NULL DEFAULT 0 CHECK(recovery_count >= 0),
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS subjects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name            TEXT NOT NULL,
    description     TEXT,
    icon             TEXT,
    color            TEXT,
    created_by      INTEGER,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK(length(trim(code)) >= 2),
    CHECK(length(trim(name)) >= 2)
);

CREATE TABLE IF NOT EXISTS documents (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id           INTEGER NOT NULL,
    uploaded_by          INTEGER NOT NULL,
    title                TEXT NOT NULL,
    description          TEXT,
    original_filename    TEXT NOT NULL,
    storage_filename     TEXT NOT NULL UNIQUE,
    file_type            TEXT NOT NULL,
    mime_type            TEXT NOT NULL,
    file_size            INTEGER NOT NULL CHECK(file_size >= 0),
    storage_path         TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending', 'processing', 'ready', 'failed')),
    visibility           TEXT NOT NULL DEFAULT 'public'
                         CHECK(visibility IN ('public', 'private')),
    downloads            INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0),
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK(length(trim(title)) >= 2),
    CHECK(length(trim(original_filename)) >= 1),
    CHECK(length(trim(storage_filename)) >= 1),
    CHECK(length(trim(storage_path)) >= 1)
);

CREATE TABLE IF NOT EXISTS courses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id      INTEGER NOT NULL,
    created_by      INTEGER NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    thumbnail       TEXT,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft', 'published', 'archived')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK(length(trim(title)) >= 2)
);

CREATE TABLE IF NOT EXISTS course_documents (
    course_id       INTEGER NOT NULL,
    document_id     INTEGER NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
    added_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(course_id, document_id),
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS course_enrollments (
    user_id         INTEGER NOT NULL,
    course_id       INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active', 'completed', 'dropped')),
    enrolled_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TEXT,
    PRIMARY KEY(user_id, course_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK(completed_at IS NULL OR status = 'completed')
);

CREATE TABLE IF NOT EXISTS plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    price_monthly   INTEGER NOT NULL DEFAULT 0 CHECK(price_monthly >= 0),
    price_yearly    INTEGER NOT NULL DEFAULT 0 CHECK(price_yearly >= 0),
    description     TEXT,
    ai_daily_limit  INTEGER CHECK(ai_daily_limit IS NULL OR ai_daily_limit >= 0),
    storage_limit   INTEGER NOT NULL DEFAULT 0 CHECK(storage_limit >= 0),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active', 'inactive')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    plan_id         INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('pending', 'active', 'expired', 'cancelled')),
    started_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK(expires_at IS NULL OR expires_at >= started_at)
);

CREATE TABLE IF NOT EXISTS subscription_changes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    target_plan_id  INTEGER NOT NULL,
    billing_cycle   TEXT NOT NULL DEFAULT 'month'
                    CHECK(billing_cycle IN ('month', 'year')),
    status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK(status IN ('scheduled', 'applied', 'cancelled')),
    effective_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(target_plan_id) REFERENCES plans(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    subject_id      INTEGER,
    document_id     INTEGER,
    title           TEXT NOT NULL DEFAULT 'AI Tutor',
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
    content         TEXT NOT NULL CHECK(length(trim(content)) > 0),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL,
    chunk_index     INTEGER NOT NULL CHECK(chunk_index >= 0),
    content         TEXT NOT NULL CHECK(length(trim(content)) > 0),
    page_number     INTEGER CHECK(page_number IS NULL OR page_number > 0),
    token_count     INTEGER CHECK(token_count IS NULL OR token_count >= 0),
    embedding_key   TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index),
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS user_progress (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    course_id       INTEGER,
    document_id     INTEGER,
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
    last_position   INTEGER NOT NULL DEFAULT 0 CHECK(last_position >= 0),
    completed       INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK((course_id IS NOT NULL AND document_id IS NULL) OR (course_id IS NULL AND document_id IS NOT NULL)),
    CHECK((completed = 1 AND progress_percent = 100) OR completed = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_progress_course
    ON user_progress(user_id, course_id) WHERE course_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_progress_document
    ON user_progress(user_id, document_id) WHERE document_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_active_subscription_per_user
    ON subscriptions(user_id) WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS ix_documents_subject_created
    ON documents(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_documents_uploader_created
    ON documents(uploaded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_documents_status
    ON documents(status);
CREATE INDEX IF NOT EXISTS ix_courses_subject_status
    ON courses(subject_id, status);
CREATE INDEX IF NOT EXISTS ix_course_documents_order
    ON course_documents(course_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_enrollments_course_status
    ON course_enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS ix_subscriptions_user_status
    ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS ix_subscription_changes_user_status
    ON subscription_changes(user_id, status);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_updated
    ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_chat_messages_session_created
    ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS ix_chunks_document_index
    ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS ix_progress_user_updated
    ON user_progress(user_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_subjects_updated_at
AFTER UPDATE ON subjects FOR EACH ROW
BEGIN
    UPDATE subjects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE ON documents FOR EACH ROW
BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_courses_updated_at
AFTER UPDATE ON courses FOR EACH ROW
BEGIN
    UPDATE courses SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_plans_updated_at
AFTER UPDATE ON plans FOR EACH ROW
BEGIN
    UPDATE plans SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_subscriptions_updated_at
AFTER UPDATE ON subscriptions FOR EACH ROW
BEGIN
    UPDATE subscriptions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_chat_sessions_updated_at
AFTER UPDATE ON chat_sessions FOR EACH ROW
BEGIN
    UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tutor_conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    client_key      TEXT,
    title           TEXT NOT NULL,
    mode            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tutor_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content         TEXT NOT NULL CHECK(length(trim(content)) > 0),
    mode            TEXT,
    payload         TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES tutor_conversations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tutor_assessments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    subject         TEXT NOT NULL,
    goal            TEXT NOT NULL,
    current_level   TEXT NOT NULL CHECK(current_level IN ('beginner', 'intermediate', 'advanced')),
    target_level    TEXT NOT NULL CHECK(target_level IN ('beginner', 'intermediate', 'advanced')),
    study_time      INTEGER NOT NULL CHECK(study_time > 0),
    pace            TEXT NOT NULL CHECK(pace IN ('slow', 'steady', 'fast')),
    strengths       TEXT,
    weaknesses      TEXT,
    answers         TEXT,
    score_percent   INTEGER NOT NULL DEFAULT 0 CHECK(score_percent BETWEEN 0 AND 100),
    status          TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tutor_roadmaps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    assessment_id   INTEGER,
    subject         TEXT NOT NULL,
    goal            TEXT NOT NULL,
    difficulty      TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
    title           TEXT NOT NULL,
    summary         TEXT,
    payload         TEXT NOT NULL,
    adaptation_note TEXT,
    version         INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(assessment_id) REFERENCES tutor_assessments(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tutor_exercises (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    roadmap_id      INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    module_key      TEXT NOT NULL,
    lesson_key      TEXT NOT NULL,
    topic           TEXT NOT NULL,
    exercise_type   TEXT NOT NULL
                    CHECK(exercise_type IN ('multiple_choice', 'short_answer', 'essay', 'code', 'math')),
    difficulty      TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
    prompt          TEXT NOT NULL,
    options         TEXT,
    answer_index    INTEGER,
    expected_answer TEXT,
    rubric          TEXT,
    max_score       REAL NOT NULL DEFAULT 10 CHECK(max_score > 0),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(roadmap_id) REFERENCES tutor_roadmaps(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tutor_submissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id     INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    answer          TEXT NOT NULL,
    answer_type     TEXT NOT NULL CHECK(answer_type IN ('text', 'choice', 'code', 'math')),
    score           REAL NOT NULL CHECK(score >= 0),
    max_score       REAL NOT NULL CHECK(max_score > 0),
    percentage      INTEGER NOT NULL CHECK(percentage BETWEEN 0 AND 100),
    grade           TEXT NOT NULL,
    is_correct      INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
    feedback        TEXT NOT NULL,
    strengths       TEXT,
    weaknesses      TEXT,
    missing_points  TEXT,
    suggested_answer TEXT,
    recommended_review TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exercise_id) REFERENCES tutor_exercises(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK(score <= max_score)
);

CREATE INDEX IF NOT EXISTS ix_tutor_conversations_user_updated
    ON tutor_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_tutor_conversations_client
    ON tutor_conversations(user_id, client_key);
CREATE INDEX IF NOT EXISTS ix_tutor_messages_conversation
    ON tutor_messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS ix_tutor_assessments_user
    ON tutor_assessments(user_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_tutor_roadmaps_user
    ON tutor_roadmaps(user_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_tutor_exercises_roadmap
    ON tutor_exercises(roadmap_id, id);
CREATE INDEX IF NOT EXISTS ix_tutor_submissions_exercise
    ON tutor_submissions(exercise_id, user_id);

INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(1,'StudyHub Phase 1 relational database foundation');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(2,'Persistent secure authentication sessions');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(3,'AI Tutor learning journey: conversations, assessments, roadmaps, exercises, grading');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(4,'Real-time study sessions and document progress reporting');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(5,'Keyword document retrieval with persistent external knowledge cache');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(6,'Required first and last name profile completion after authentication');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(7,'Google and Facebook OAuth account links');
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES(8,'User-owned learning-library subjects');
