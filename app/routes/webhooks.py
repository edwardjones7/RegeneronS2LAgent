"""ElevenLabs post-call webhooks: transcript + summary after a call, or a failed dial."""

import hashlib
import hmac
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from app import service
from app.config import get_settings
from app.db import session_scope

router = APIRouter(prefix="/webhooks")
log = logging.getLogger("webhooks")

TOLERANCE_SECS = 30 * 60


def verify_signature(raw_body: bytes, header: str, secret: str, now: float | None = None) -> None:
    """ElevenLabs-Signature: t=<unix>,v0=<hex HMAC-SHA256 of "t.body">."""
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        ts, sig = parts["t"], parts["v0"]
    except (ValueError, KeyError) as exc:
        raise HTTPException(401, "malformed signature") from exc
    if int(ts) < (now or time.time()) - TOLERANCE_SECS:
        raise HTTPException(401, "stale signature")
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, sig):
        raise HTTPException(401, "bad signature")


def _lead_id_from(data: dict) -> int | None:
    dv = (data.get("conversation_initiation_client_data") or {}).get("dynamic_variables") or {}
    try:
        return int(dv.get("lead_id"))
    except (TypeError, ValueError):
        return None


@router.post("/elevenlabs")
async def elevenlabs(request: Request):
    raw = await request.body()
    secret = get_settings().elevenlabs_webhook_secret
    if not secret:
        raise HTTPException(503, "webhook secret not configured")
    verify_signature(raw, request.headers.get("elevenlabs-signature", ""), secret)
    payload = json.loads(raw)
    handle_event(payload)
    return {"ok": True}


def handle_event(payload: dict) -> str:
    """Apply one webhook event. Shared by the HTTP route and mock mode. Returns what it did."""
    kind = payload.get("type")
    data = payload.get("data") or {}
    with session_scope() as s:
        call = service.find_call(s, data.get("conversation_id"), _lead_id_from(data))
        if call is None:
            log.warning("webhook %s for unknown conversation %s", kind, data.get("conversation_id"))
            return "unknown_call"
        if kind == "post_call_transcription":
            meta = data.get("metadata") or {}
            phone = meta.get("phone_call") or {}
            transcript = [
                {
                    "role": t.get("role"),
                    "message": t.get("message"),
                    "time_in_call_secs": t.get("time_in_call_secs"),
                    "tool_calls": [tc.get("tool_name") for tc in (t.get("tool_calls") or []) if isinstance(tc, dict)],
                }
                for t in data.get("transcript") or []
            ]
            conv_id = data.get("conversation_id")
            service.call_ended(
                s,
                call,
                transcript=transcript,
                summary=(data.get("analysis") or {}).get("transcript_summary") or "",
                duration_secs=meta.get("call_duration_secs"),
                recording_url=f"/leads/{call.lead_id}/calls/{call.id}/recording" if data.get("has_audio", True) and conv_id else None,
                voicemail=phone.get("call_result") == "voicemail",
            )
            return "call_ended"
        if kind == "call_initiation_failure":
            service.call_failed(s, call, data.get("failure_reason") or "unknown")
            return "call_failed"
        return "ignored"
