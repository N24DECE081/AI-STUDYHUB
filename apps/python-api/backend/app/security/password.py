"""Authentication primitives for StudyHub.

Uses PBKDF2-HMAC-SHA256 with a per-password random salt.  Legacy SHA-256
passwords from the original MVP are accepted once and transparently upgraded
on successful login.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from typing import Optional

PBKDF2_ITERATIONS = 310_000
SALT_BYTES = 16
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
LEGACY_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> bool:
    return len(email) <= 254 and bool(EMAIL_RE.fullmatch(email))


def validate_password(password: str) -> Optional[str]:
    if not isinstance(password, str):
        return "Mật khẩu không hợp lệ"
    if len(password) < 8:
        return "Mật khẩu phải có ít nhất 8 ký tự"
    if len(password) > 128:
        return "Mật khẩu không được vượt quá 128 ký tự"
    return None


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(derived).decode("ascii").rstrip("="),
    )


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_password(password: str, stored_hash: str) -> bool:
    if not isinstance(password, str) or not isinstance(stored_hash, str):
        return False
    if stored_hash.startswith("pbkdf2_sha256$"):
        try:
            prefix, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
            if prefix != "pbkdf2_sha256":
                return False
            iterations = int(iterations)
            if iterations < 100_000 or iterations > 2_000_000:
                return False
            salt = _b64decode(salt_b64)
            expected = _b64decode(digest_b64)
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False
    # Compatibility with the Phase 1/MVP database. Successful verification
    # triggers an upgrade to PBKDF2 in the login service.
    if LEGACY_SHA256_RE.fullmatch(stored_hash):
        return hmac.compare_digest(hashlib.sha256(password.encode("utf-8")).hexdigest(), stored_hash)
    return False


def needs_rehash(stored_hash: str) -> bool:
    return bool(LEGACY_SHA256_RE.fullmatch(stored_hash or ""))
