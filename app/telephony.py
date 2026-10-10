"""Read-only Twilio call status, used to time "opt-in → phone ringing → answered"."""

import httpx

from app.config import get_settings


def call_status(call_sid: str) -> dict | None:
    """Twilio call resource ({status, start_time, duration, ...}) or None if unavailable."""
    s = get_settings()
    if s.mock_mode or not (s.twilio_account_sid and s.twilio_auth_token and call_sid):
        return None
    r = httpx.get(
        f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Calls/{call_sid}.json",
        auth=(s.twilio_account_sid, s.twilio_auth_token),
        timeout=5,
    )
    return r.json() if r.status_code == 200 else None
