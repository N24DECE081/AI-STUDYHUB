# StudyHub Web — Frontend-first MVP

StudyHub là web app học tập dành cho sinh viên, tập trung vào **học liệu → khám phá môn học → tiến độ học tập**, với kiến trúc Python + SQLite đơn giản, dễ đưa lên GitHub và mở rộng thành AI Tutor sau này.

## Frontend hiện tại

Giao diện đã được redesign theo hướng **learning platform hiện đại**, tham khảo các pattern UX của Astra AI: hero tập trung vào mục tiêu học, progress visualization, learning workflow, thư viện học liệu, dashboard tiến độ và trải nghiệm mobile. Không sao chép asset/nhận diện của Astra.

### Màu chủ đạo

- **Red:** `#E43B3B` — CTA, progress, điểm nhấn.
- **Navy:** `#071A2E` — brand, navigation, nền sâu.
- **Blue:** `#0E4F86` / `#1F76B9` — subject, document và data accents.
- **White / Soft gray:** nền card, form và vùng nội dung.

### Màn hình

- `Trang chủ`: hero, search, learning workflow, subjects, CTA.
- `Kho học liệu`: search realtime, filter theo môn, grid/list view, document detail.
- `Tiến độ`: learning stats, roadmap tuần, focus card.
- `Auth`: login/register modal.
- `Upload`: Mọi user đã đăng nhập có modal upload kéo-thả file.
- Mobile navigation: menu gọn, responsive ở màn hình nhỏ.

### Tương tác chính

- Navigation theo hash: `#home`, `#library`, `#dashboard`.
- Active navigation state.
- Search tài liệu realtime.
- Filter môn học.
- Grid/List view.
- Document detail modal.
- Login/Register.
- Authenticated-user Upload; Teacher/Admin vẫn là role có quyền tạo course.
- Drag & drop upload.
- Toast feedback.
- Responsive mobile navigation.

## Backend

- Python Standard Library HTTP server.
- MySQL through `mysql-connector-python` when `MYSQL_DATABASE` is configured.
- SQLite automatic fallback for local development without MySQL.
- Session cookie.
- Role: `student`, `teacher`, `admin`.
- API:
  - `GET /api/me`
  - `GET /api/subjects`
  - `GET /api/documents`
  - `GET /api/documents/:id`
  - `POST /api/login`
  - `POST /api/register`
  - `POST /api/logout`
  - `POST /api/upload`
  - `GET /download/:id`

## Chạy local

```bash
python -m pip install -r requirements.txt
python server.py
```

Mở:

```text
http://127.0.0.1:5000
```

### Chạy với MySQL

Tạo database và user MySQL, sau đó cấu hình biến môi trường trước khi chạy:

PowerShell:

```powershell
$env:STUDYHUB_DB_MODE="mysql"
$env:MYSQL_HOST="127.0.0.1"
$env:MYSQL_PORT="3306"
$env:MYSQL_USER="studyhub"
$env:MYSQL_PASSWORD="your-password"
$env:MYSQL_DATABASE="studyhub"
python server.py
```

Lần khởi động đầu tiên sẽ tự tạo các bảng, index và dữ liệu demo trong MySQL. Nếu chưa cấu hình `MYSQL_DATABASE`, ứng dụng dùng SQLite local để web vẫn chạy được.

## Demo account

```text
Student
student@studyhub.local
Student123!

Teacher
teacher@studyhub.local
Teacher123!

Admin
admin@studyhub.local
Admin123!
```

## Test

```bash
python -m unittest discover -s tests -v
```

Smoke tests hiện tại: **3/3 PASS**.

Đã kiểm tra thêm flow thực tế:

1. Home trả HTTP 200.
2. Subjects API trả dữ liệu.
3. Documents API trả dữ liệu.
4. User login thành công.
5. User upload file thành công (`201`).
6. Tài liệu upload xuất hiện trong search API.

## Cấu trúc

```text
studyhub_web/
├── server.py
├── run.py
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/
│   └── test_server.py
├── scripts/
│   └── seed.py
├── data/
├── uploads/
├── docs/
│   ├── ui-preview.png
│   └── frontend-final.png
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Định hướng GitHub tiếp theo

### Phase 1 — Web core

- Hoàn thiện document management.
- User profile.
- Subject pages.
- Teacher/Admin management.
- Pagination.
- File validation.

### Phase 2 — AI Tutor

- Document parsing/chunking.
- Embedding + vector search.
- RAG.
- Chat interface.
- Citation về tài liệu nguồn.

### Phase 3 — Learning tools

- Quiz generator.
- Flashcards.
- Study roadmap.
- Knowledge-gap tracking.
- Progress analytics.

### Phase 4 — Production

- PostgreSQL.
- Object storage.
- Proper authentication.
- Rate limiting.
- Logging/monitoring.
- CI/CD.
- Deployment.

## Ghi chú thiết kế

UI ưu tiên thao tác nhanh, khoảng trắng lớn, typography rõ, card có hierarchy, CTA nổi bật và responsive. Astra AI được dùng làm nguồn tham khảo UX cho flow học tập; StudyHub giữ brand, màu sắc, nội dung và kiến trúc riêng.

## Verification

Development verification performed before packaging:

- `python3 -m py_compile server.py run.py tests/test_server.py` — PASS
- `python3 -m unittest discover -s tests -p 'test_*.py' -v` — 3/3 PASS
- Started with `python3 run.py` — PASS
- `GET /` — HTTP 200
- `GET /api/subjects` — HTTP 200, 4 subjects
- `GET /api/documents` — HTTP 200, 3 documents
- Teacher login — HTTP 200
- Authenticated `/api/me` — role `teacher`
- Logout — HTTP 200

Browser screenshot automation could not be executed in this build environment because the Playwright Chromium executable is not installed. The source remains browser-ready and the included frontend preview is retained.

## Frontend visual direction

The frontend is intentionally designed around a premium dark learning-product aesthetic inspired by the interaction patterns visible on Astra AI: centered hero typography, pill navigation, strong primary CTA, proof/rating row, product-preview dashboard, floating learning cards, clear workflow sections, and responsive mobile navigation. It uses StudyHub's own identity and a red + blue/navy + white palette rather than copying Astra branding or assets.

### Local development

```bash
python run.py
```

Open `http://127.0.0.1:5000`. Save changes in `web/index.html`, `web/styles.css`, or `web/app.js`, then refresh the browser.

### Verification

```bash
python -m py_compile server.py run.py tests/test_server.py
node --check web/app.js
python -m unittest discover -s tests -p "test_*.py" -v
```

The smoke suite verifies HTML, CSS/JS static delivery, API routes, document/subject data, 404 handling for missing static assets, and login response password redaction.

## Study plans / pricing UI

The homepage now includes a dedicated **Gói học** section placed after the featured subjects and before the final CTA. It follows the StudyHub dark premium visual system (red / navy / white) and is inspired by the provided Astra reference without copying its branding or assets.

Plans:
- Miễn phí — 0đ/tháng
- Tiêu chuẩn — 49.000đ/tháng (featured)
- Cao cấp — 99.000đ/tháng

The billing toggle supports monthly/yearly display and the plan buttons currently provide a frontend selection flow. Payment processing is intentionally reserved for the backend/payment phase.

## Backend Phase 1 — Database Foundation

The project now includes a normalized relational schema under `backend/app/db/`.

### Database

- SQLite for local development.
- PostgreSQL-compatible relational design for later deployment.
- WAL + foreign keys + busy timeout enabled for SQLite.
- Legacy MVP database migration preserves existing users, subjects and documents.
- Schema version is tracked in `schema_migrations`.

### Phase 1 verification

```bash
python -m py_compile server.py run.py
PYTHONPATH=backend python -m unittest discover -s backend/tests -p "test_*.py" -v
PYTHONPATH=backend python -m unittest discover -s tests -p "test_*.py" -v
```

Phase 1 is complete only when database tests and existing web smoke/integration tests pass.

## Phase 2 — Authentication foundation

Canonical endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Run all tests from the project root:

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
$env:PYTHONPATH="backend"; python -m unittest discover -s backend/tests -p "test_*.py" -v
```

## Current consolidated state

This package contains the StudyHub frontend plus the completed Phase 1 database foundation
and Phase 2 authentication/login foundation in one project.

### Frontend
- `web/index.html`
- `web/styles.css`
- `web/app.js`
- Astra-inspired dark/premium learning UI
- red + navy + white visual system
- pricing / learning plans section
- responsive navigation and screens
- login/register UI connected to the backend auth API

### Backend
- `server.py` / `run.py`
- `backend/app/db/` — database connection, schema, seed
- `backend/app/security/` — password hashing, sessions, auth service
- SQLite database foundation
- HTTP API foundation
- authentication and authorization foundation

### Tests
Run:

```powershell
python -m unittest discover -s backend/tests -p "test_*.py" -v
python -m unittest discover -s tests -p "test_*.py" -v
```

Start the application:

```powershell
python run.py
```

Open:

`http://127.0.0.1:5000`

Do not open `web/index.html` directly when testing backend integration.
