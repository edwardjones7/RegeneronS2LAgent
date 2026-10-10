"""ElevenLabs post-call webhooks: transcript + summary after a call, or a failed dial."""

import hashlib
import hmac
import json
import logging
import time
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app import service
from app.config import get_settings
from app.db import session_scope
from app.models import Call, utcnow
from app.voice import VoiceError, get_voice

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


NOT_CONNECTED = {"busy", "no_answer", "failed"}


def poll_open_calls(min_age_secs: int = 45) -> int:
    """Fallback when the post-call webhook isn't set up: ask ElevenLabs about calls we never heard back on."""
    try:
        voice = get_voice()
    except VoiceError:
        return 0  # real calls not set up yet
    if not hasattr(voice, "fetch_conversation"):
        return 0
    cutoff = utcnow() - timedelta(seconds=min_age_secs)
    with session_scope() as s:
        open_ids = list(
            s.scalars(
                select(Call.provider_conversation_id).where(
                    Call.ended_at.is_(None), Call.provider_conversation_id.is_not(None), Call.started_at < cutoff
                )
            )
        )
    settled = 0
    for conv_id in open_ids:
        try:
            conv = voice.fetch_conversation(conv_id)
        except Exception:  # noqa: BLE001
            log.exception("couldn't fetch conversation %s", conv_id)
            continue
        if conv.get("status") not in ("done", "failed"):
            continue
        result = ((conv.get("metadata") or {}).get("phone_call") or {}).get("call_result")
        if result in NOT_CONNECTED:
            handle_event({"type": "call_initiation_failure", "data": {"conversation_id": conv_id, "failure_reason": result}})
        else:
            handle_event({"type": "post_call_transcription", "data": conv})
        settled += 1
    return settled


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
