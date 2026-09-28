"""Authentication service: registration, login and safe user serialization."""
from __future__ import annotations

from datetime import date, datetime, timedelta
import secrets

from .password import hash_password, verify_password, needs_rehash, normalize_email, validate_email, validate_password
from .session import create_session, revoke_session, get_user_id
from ..timezone import vietnam_now


def update_streak(conn, user_id: int) -> dict:
    today = vietnam_now().date()
    insert_day = ("INSERT IGNORE" if getattr(conn, "dialect", "sqlite") == "mysql" else "INSERT OR IGNORE") + " INTO user_activity_days(user_id,activity_date) VALUES(?,?)"
    conn.execute(
        insert_day,
        (user_id, today.isoformat()),
    )
    row = conn.execute("SELECT * FROM user_streaks WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        conn.execute(
            "INSERT INTO user_streaks(user_id,current_streak,last_activity_date) VALUES(?,?,?)",
            (user_id, 1, today.isoformat()),
        )
    else:
        last_date = date.fromisoformat(str(row["last_activity_date"])) if row["last_activity_date"] else None
        if last_date:
            conn.execute(
                insert_day,
                (user_id, last_date.isoformat()),
            )
        gap = (today - last_date).days if last_date else 1
        streak = row["current_streak"]
        recoveries = row["recovery_count"]
        if gap <= 0:
            pass
        elif gap == 1:
            streak += 1
        elif recoveries < 3:
            streak += 1
            recoveries += 1
        else:
            streak = 1
        conn.execute(
            "UPDATE user_streaks SET current_streak=?,last_activity_date=?,recovery_count=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
            (streak, today.isoformat(), recoveries, user_id),
        )
    current = conn.execute("SELECT * FROM user_streaks WHERE user_id=?", (user_id,)).fetchone()
    result = dict(current)
    result["today"] = today.isoformat()
    result["timezone"] = "GMT+7"
    result["activity_dates"] = [str(day["activity_date"]) for day in conn.execute(
        "SELECT activity_date FROM user_activity_days WHERE user_id=? AND activity_date>=? ORDER BY activity_date",
        (user_id, (today - timedelta(days=6)).isoformat()),
    ).fetchall()]
    return result


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "name": row["full_name"],
        "full_name": row["full_name"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "email": row["email"],
        "phone": row["phone"],
        "profile_completed": bool(row["profile_completed"]),
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
    streak = update_streak(conn, row["id"])
    token, expires_at = create_session(conn, row["id"])
    conn.commit()
    fresh = conn.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
    user = public_user(fresh)
    user["streak"] = streak
    return (user, token, expires_at), None


def _valid_name(value: str, label: str):
    value = value.strip()
    if not 1 <= len(value) <= 60:
        return None, f"{label} phải từ 1 đến 60 ký tự"
    return value, None


def register(conn, name: str, email: str, password: str, first_name: str = "", last_name: str = ""):
    name = name.strip()
    first_name = first_name.strip()
    last_name = last_name.strip()
    if first_name or last_name:
        first_name, error = _valid_name(first_name, "First name")
        if error:
            return None, error
        last_name, error = _valid_name(last_name, "Last name")
        if error:
            return None, error
        name = f"{last_name} {first_name}"
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
            """INSERT INTO users(full_name,first_name,last_name,email,password_hash,role,status,profile_completed)
               VALUES(?,?,?,?,?,?,?,?)""",
            (name, first_name or None, last_name or None, email, hash_password(password), "student", "active", 1),
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


def complete_profile(conn, user_id: int, first_name: str, last_name: str):
    first_name, error = _valid_name(first_name, "First name")
    if error:
        return None, error
    last_name, error = _valid_name(last_name, "Last name")
    if error:
        return None, error
    conn.execute(
        """UPDATE users
           SET first_name=?, last_name=?, full_name=?, profile_completed=1
           WHERE id=?""",
        (first_name, last_name, f"{last_name} {first_name}", user_id),
    )
    streak = update_streak(conn, user_id)
    conn.commit()
    user = public_user(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    user["streak"] = streak
    return user, None


def _reset_user(conn, identifier: str):
    identifier = str(identifier or "").strip()
    if not identifier:
        return None
    email = normalize_email(identifier) if "@" in identifier else ""
    phone = "".join(char for char in identifier if char.isdigit() or char == "+")
    return conn.execute(
        "SELECT * FROM users WHERE email=? OR phone=? LIMIT 1",
        (email, phone),
    ).fetchone()


def _local_stamp(value: datetime | None = None) -> str:
    value = value or vietnam_now().replace(tzinfo=None)
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _expired(value: str) -> bool:
    try:
        return datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S") <= vietnam_now().replace(tzinfo=None)
    except ValueError:
        return True


def start_password_reset(conn, identifier: str):
    user = _reset_user(conn, identifier)
    if not user:
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn.execute("DELETE FROM password_reset_otps WHERE user_id=? AND used_at IS NULL", (user["id"],))
    conn.execute(
        "INSERT INTO password_reset_otps(user_id,code_hash,expires_at) VALUES(?,?,?)",
        (user["id"], hash_password(code), _local_stamp(vietnam_now().replace(tzinfo=None) + timedelta(minutes=10))),
    )
    conn.commit()
    return {"email": user["email"], "code": code}


def verify_password_reset(conn, identifier: str, code: str):
    user = _reset_user(conn, identifier)
    if not user or not isinstance(code, str) or not code.isdigit() or len(code) != 6:
        return None, "Mã OTP không hợp lệ"
    row = conn.execute(
        """SELECT * FROM password_reset_otps
           WHERE user_id=? AND used_at IS NULL ORDER BY id DESC LIMIT 1""",
        (user["id"],),
    ).fetchone()
    if not row or _expired(row["expires_at"]):
        return None, "Mã OTP đã hết hạn"
    if row["attempts"] >= 5:
        return None, "Mã OTP đã vượt quá số lần thử"
    if not verify_password(code, row["code_hash"]):
        conn.execute("UPDATE password_reset_otps SET attempts=attempts+1 WHERE id=?", (row["id"],))
        conn.commit()
        return None, "Mã OTP không đúng"
    token = secrets.token_urlsafe(32)
    from .session import token_hash
    conn.execute(
        "UPDATE password_reset_otps SET verified_at=?, reset_token_hash=? WHERE id=?",
        (_local_stamp(), token_hash(token), row["id"]),
    )
    conn.commit()
    return token, None


def reset_password(conn, reset_token: str, password: str):
    from .session import token_hash
    row = conn.execute(
        """SELECT * FROM password_reset_otps
           WHERE reset_token_hash=? AND verified_at IS NOT NULL AND used_at IS NULL
           ORDER BY id DESC LIMIT 1""",
        (token_hash(str(reset_token or "")),),
    ).fetchone()
    if not row or _expired(row["expires_at"]):
        return "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
    error = validate_password(password)
    if error:
        return error
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(password), row["user_id"]))
    conn.execute("DELETE FROM auth_sessions WHERE user_id=?", (row["user_id"],))
    conn.execute("UPDATE password_reset_otps SET used_at=? WHERE id=?", (_local_stamp(), row["id"]))
    conn.commit()
    return None


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
