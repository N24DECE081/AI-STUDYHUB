"""Authentication service: registration, login and safe user serialization."""
from __future__ import annotations

from .password import hash_password, verify_password, needs_rehash, normalize_email, validate_email, validate_password
from .session import create_session, revoke_session, get_user_id


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "name": row["full_name"],
        "full_name": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"],
        "avatar_url": row["avatar_url"],
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
    token, expires_at = create_session(conn, row["id"])
    conn.commit()
    fresh = conn.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
    return (public_user(fresh), token, expires_at), None


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
    token, expires_at = create_session(conn, user_id)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return (public_user(row), token, expires_at), None


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
