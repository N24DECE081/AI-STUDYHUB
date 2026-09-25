"""Authentication service: registration, login and safe user serialization."""
from __future__ import annotations

from datetime import date

from .password import hash_password, verify_password, needs_rehash, normalize_email, validate_email, validate_password
from .session import create_session, revoke_session, get_user_id


def update_streak(conn, user_id: int) -> dict:
    today = date.today()
    row = conn.execute("SELECT * FROM user_streaks WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        conn.execute(
            "INSERT INTO user_streaks(user_id,current_streak,last_activity_date) VALUES(?,?,?)",
            (user_id, 1, today.isoformat()),
        )
    else:
        last_date = date.fromisoformat(row["last_activity_date"]) if row["last_activity_date"] else None
        gap = (today - last_date).days if last_date else 1
        streak = row["current_streak"]
        recoveries = row["recovery_count"]
        if gap == 0:
            pass
        elif gap == 1:
            streak += 1
        elif recoveries < 3:
            streak += 1
            recoveries += 1
        else:
            streak = 0
            recoveries += 1
        conn.execute(
            "UPDATE user_streaks SET current_streak=?,last_activity_date=?,recovery_count=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
            (streak, today.isoformat(), recoveries, user_id),
        )
    current = conn.execute("SELECT * FROM user_streaks WHERE user_id=?", (user_id,)).fetchone()
    return dict(current)


def public_user(row) -> dict:
    keys = set(row.keys())
    first_name = (row["first_name"] or "").strip() if "first_name" in keys else ""
    last_name = (row["last_name"] or "").strip() if "last_name" in keys else ""
    return {
        "id": row["id"],
        "name": row["full_name"],
        "full_name": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"],
        "avatar_url": row["avatar_url"],
        "first_name": first_name,
        "last_name": last_name,
        "profile_complete": bool(first_name and last_name),
    }


def authenticate(conn, email: str, password: str):
    email = normalize_email(email)
    row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None, "Email hoặc mật khẩu chưa đúng"
    if row["status"] != "active":
        return None, "Tài khoản đang bị khóa"
    if needs_rehash(row["password_hash"]):
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(password), row["id"]))
    conn.execute("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?", (row["id"],))
    streak = update_streak(conn, row["id"])
    token, expires_at = create_session(conn, row["id"])
    conn.commit()
    fresh = conn.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
    user = public_user(fresh)
    user["streak"] = streak
    return (user, token, expires_at), None


def register(conn, name: str, email: str, password: str):
    name = name.strip()
    email = normalize_email(email)
    if len(name) < 2 or len(name) > 120:
        return None, "Họ và tên phải từ 2 đến 120 ký tự"
    if not validate_email(email):
        return None, "Email không hợp lệ"
    pw_error = validate_password(password)
    if pw_error:
        return None, pw_error
    try:
        cur = conn.execute(
            "INSERT INTO users(full_name,email,password_hash,role,status) VALUES(?,?,?,?,?)",
            (name, email, hash_password(password), "student", "active"),
        )
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            return None, "Email đã tồn tại"
        raise
    user_id = cur.lastrowid
    streak = update_streak(conn, user_id)
    token, expires_at = create_session(conn, user_id)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    user = public_user(row)
    user["streak"] = streak
    return (user, token, expires_at), None


def current_user(conn, token: str | None):
    uid = get_user_id(conn, token)
    if uid is None:
        return None
    row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row or row["status"] != "active":
        if row:
            conn.execute("DELETE FROM auth_sessions WHERE user_id=?", (uid,))
            conn.commit()
        return None
    return public_user(row)
