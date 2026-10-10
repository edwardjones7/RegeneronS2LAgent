"""Dashboard login: one shared password -> signed session cookie. The read API accepts the
cookie or the X-API-Key header."""

import hashlib
import hmac
import time

from app.config import get_settings

COOKIE = "cmm_session"
SESSION_SECS = 12 * 3600


def _secret() -> bytes:
    s = get_settings()
    return hashlib.sha256(f"session:{s.read_api_key}:{s.tool_secret}".encode()).digest()


def dashboard_password() -> str:
    s = get_settings()
    return s.dashboard_password or s.read_api_key


def check_password(supplied: str) -> bool:
    return hmac.compare_digest(supplied.encode(), dashboard_password().encode())


def make_session(now: float | None = None) -> str:
    expires = int((now or time.time()) + SESSION_SECS)
    sig = hmac.new(_secret(), str(expires).encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def valid_session(token: str | None, now: float | None = None) -> bool:
    if not token or "." not in token:
        return False
    expires, sig = token.split(".", 1)
    good = hmac.new(_secret(), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and expires.isdigit() and int(expires) > (now or time.time())
