"""Database-backed HTTP session management."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

SESSION_COOKIE = "studyhub_session"
SESSION_TTL_DAYS = 7


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(conn, user_id: int, ttl_days: int = SESSION_TTL_DAYS) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    now = _utc_now()
    expires = now + timedelta(days=ttl_days)
    conn.execute(
        "INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)",
        (token_hash(token), user_id, _stamp(now), _stamp(expires), _stamp(now)),
    )
    return token, _stamp(expires)


def get_user_id(conn, token: str | None) -> int | None:
    if not token:
        return None
    row = conn.execute(
        "SELECT user_id, expires_at FROM auth_sessions WHERE token_hash=?",
        (token_hash(token),),
    ).fetchone()
    if not row:
        return None
    try:
        expires = datetime.fromisoformat(row["expires_at"])
    except (TypeError, ValueError):
        return None
    if expires <= _utc_now():
        conn.execute("DELETE FROM auth_sessions WHERE token_hash=?", (token_hash(token),))
        conn.commit()
        return None
    conn.execute("UPDATE auth_sessions SET last_seen_at=? WHERE token_hash=?", (_stamp(_utc_now()), token_hash(token)))
    conn.commit()
    return int(row["user_id"])


def revoke_session(conn, token: str | None) -> None:
    if token:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash=?", (token_hash(token),))
        conn.commit()


def revoke_all_user_sessions(conn, user_id: int) -> None:
    conn.execute("DELETE FROM auth_sessions WHERE user_id=?", (user_id,))
    conn.commit()


def cleanup_expired(conn) -> int:
    cur = conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (_stamp(_utc_now()),))
    conn.commit()
    return cur.rowcount
