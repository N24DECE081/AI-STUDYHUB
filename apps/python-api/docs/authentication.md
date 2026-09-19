# StudyHub Authentication

## Flow

1. Frontend sends `POST /api/auth/login` with `{email,password}`.
2. Backend normalizes the email and validates input.
3. Password is verified with PBKDF2-HMAC-SHA256 and a unique salt.
4. Legacy SHA-256 hashes from the MVP are accepted once and upgraded to PBKDF2 after a successful login.
5. A random session token is generated and only its SHA-256 hash is stored in `auth_sessions`.
6. The raw token is returned only as an HttpOnly, SameSite=Lax cookie.
7. `GET /api/auth/me` resolves the session and returns a public user object without password data.
8. `POST /api/auth/logout` revokes the current session in the database.

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

The older `/api/register`, `/api/login`, `/api/logout`, and `/api/me` routes remain as compatibility aliases during migration.

## Session model

Sessions are database-backed instead of an in-memory dictionary. This means restarting the Python process does not silently log every user out. Sessions expire after 7 days and are deleted when expired or explicitly revoked.

## Security decisions

- Passwords are never stored in plaintext.
- Password hashes use PBKDF2-HMAC-SHA256 with 310,000 iterations and random 16-byte salts.
- Session tokens are never stored in plaintext in the database.
- Authentication cookies are `HttpOnly` and `SameSite=Lax`.
- Blocked users cannot authenticate.
- API responses expose a safe public-user object only.
- Email is normalized to lowercase.
- Password length is limited to 8–128 characters.

## Frontend integration

The frontend calls the canonical `/api/auth/*` routes. Because the frontend and backend are served from the same origin, the browser automatically sends the HttpOnly session cookie with same-origin requests.
