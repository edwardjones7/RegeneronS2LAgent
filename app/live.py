"""Live call state for the dashboard's call view, built on request (works on serverless too).

For each active call we look up the phone leg on Twilio (to time "phone ringing" and
"answered") and the conversation so far on ElevenLabs (live transcript). Results are cached
briefly so several dashboard tabs don't multiply API calls.
"""

import logging
import threading
import time
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import service, telephony
from app.models import Call, Lead, LeadStatus, utcnow
from app.voice import VoiceError, get_voice

log = logging.getLogger("live")

LIVE_WINDOW = timedelta(minutes=30)
RECENTLY_ENDED = timedelta(seconds=25)
CACHE_SECS = 1.2
_cache: dict[int, tuple[float, dict]] = {}
_lock = threading.Lock()

PHASES = {"queued": "dialing", "initiated": "dialing", "ringing": "ringing", "in-progress": "in_progress"}


def _secs(a, b):
    return round((a - b).total_seconds(), 1) if a and b else None


def _remote_state(call: Call) -> dict:
    """Twilio leg + ElevenLabs transcript, cached per call."""
    now = time.monotonic()
    with _lock:
        hit = _cache.get(call.id)
        if hit and now - hit[0] < CACHE_SECS:
            return hit[1]
    state: dict = {"twilio": None, "transcript": None, "conv_status": None}
    try:
        if call.provider_call_sid:
            state["twilio"] = telephony.call_status(call.provider_call_sid)
    except Exception:  # noqa: BLE001
        log.debug("twilio status failed", exc_info=True)
    try:
        voice = get_voice()
        if call.provider_conversation_id and hasattr(voice, "fetch_conversation"):
            conv = voice.fetch_conversation(call.provider_conversation_id)
            state["conv_status"] = conv.get("status")
            state["transcript"] = [
                {"role": t.get("role"), "message": t.get("message"), "time_in_call_secs": t.get("time_in_call_secs"),
                 "tool_calls": [tc.get("tool_name") for tc in (t.get("tool_calls") or []) if isinstance(tc, dict)]}
                for t in conv.get("transcript") or []
            ]
    except (VoiceError, Exception):  # noqa: BLE001
        log.debug("conversation fetch failed", exc_info=True)
    with _lock:
        _cache[call.id] = (now, state)
    return state


def live_calls(s: Session, campaign_id: str | None = None) -> list[dict]:
    now = utcnow()
    q = (
        select(Call)
        .join(Lead, Lead.id == Call.lead_id)
        .where(Call.started_at > now - LIVE_WINDOW)
        .where((Call.ended_at.is_(None)) | (Call.ended_at > now - RECENTLY_ENDED))
        .order_by(Call.started_at.desc())
    )
    if campaign_id:
        q = q.where(Lead.campaign_id == campaign_id)
    out = []
    for call in s.scalars(q).all():
        lead = call.lead
        ended = call.ended_at is not None
        remote = {} if ended else _remote_state(call)
        tw = remote.get("twilio") or {}
        tw_status = tw.get("status")
        phase = "ended" if ended else PHASES.get(tw_status or "", "dialing")
        if not ended and not tw_status and remote.get("conv_status") in ("in-progress", "processing"):
            phase = "in_progress"  # text-mode test conversations have no phone leg
        if not ended and tw_status in ("completed", "busy", "no-answer", "failed", "canceled"):
            phase = "ending"
        # Record first-seen timestamps (accurate to the dashboard's ~1.5s polling).
        if tw_status:
            call.telephony_status = tw_status
        if phase in ("ringing", "in_progress") and not call.ringing_at:
            call.ringing_at = now
            service.log_event(s, lead, "phone_ringing", seconds_from_opt_in=_secs(now, lead.created_at))
        if phase == "in_progress" and not call.answered_at:
            call.answered_at = now
            if not call.ringing_at:
                call.ringing_at = now
            service.log_event(s, lead, "call_answered", seconds_from_opt_in=_secs(now, lead.created_at))

        decision = service.current_decision(lead)
        nxt = decision.next_question
        transcript = remote.get("transcript") if remote.get("transcript") is not None else (call.transcript or [])
        out.append({
            "call_id": call.id,
            "lead_id": lead.id,
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "phone": lead.phone,
            "source": lead.source,
            "status": lead.status,
            "phase": phase,
            "telephony_status": tw_status,
            "opt_in_at": lead.created_at.isoformat() + "Z",
            "placed_at": call.started_at.isoformat() + "Z",
            "ringing_at": call.ringing_at.isoformat() + "Z" if call.ringing_at else None,
            "answered_at": call.answered_at.isoformat() + "Z" if call.answered_at else None,
            "ended_at": call.ended_at.isoformat() + "Z" if call.ended_at else None,
            "seconds_to_place": _secs(call.started_at, lead.created_at),
            "seconds_to_ring": _secs(call.ringing_at, lead.created_at),
            "seconds_to_answer": _secs(call.answered_at, lead.created_at),
            "answered": len({a.question_id for a in lead.answers}),
            "total": decision.total or len(service.campaign_for(lead).prescreen_questions),
            "current_question": {"id": nxt.id, "ask": nxt.ask} if nxt and lead.status == LeadStatus.CALLING else None,
            "screening_state": decision.state,
            "transcript": transcript[-12:],
        })
    return out
