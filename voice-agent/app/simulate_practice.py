"""Simulated patients for the demo: everyone without a real phone number.

Synthea patients have no phone numbers, and a Twilio trial account only reaches verified numbers.
A few demo patients get the team's real numbers; for everyone else, a "call" here resolves after a
few seconds into a realistic outcome through the same service functions a real call uses, so the
call list, the staff queue and the calendar all move. Nothing leaves the machine: simulated
patients' texts are logged, never sent (service.sms_for).

Outcomes are fixed per patient and attempt (a hash), so a demo replays the same way.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import messaging, service, slots
from app.config import get_settings
from app.models import Call, Lead, LeadStatus, utcnow

log = logging.getLogger("simulate")

SIM_PREFIX = "sim_"


class SimulatedVoice:
    def start_call(self, *, lead_id: int, first_name: str, phone: str, campaign, context: dict | None = None) -> dict:
        return {"conversation_id": f"{SIM_PREFIX}{lead_id}_{utcnow().timestamp():.0f}", "call_sid": None}


def _roll(lead: Lead, attempt: int, salt: str = "") -> int:
    key = f"{lead.patient_id or lead.id}:{attempt}:{salt}".encode()
    return int(hashlib.sha256(key).hexdigest(), 16) % 100


def outcome(lead: Lead, attempt: int) -> str:
    """booked | not_interested | follow_up | callback_later | voicemail | no_answer"""
    r = _roll(lead, attempt)
    if r < 28:
        return "booked"
    if r < 34:
        return "not_interested"
    if r < 38:
        return "follow_up"
    if r < 42:
        return "callback_later"
    if r < 74:
        return "voicemail"
    return "no_answer"


def resolve_due(s: Session) -> int:
    """Finish simulated calls whose few seconds are up."""
    cutoff = utcnow() - timedelta(seconds=get_settings().simulated_call_secs)
    due = s.scalars(
        select(Call).where(
            Call.ended_at.is_(None), Call.provider_conversation_id.like(f"{SIM_PREFIX}%"), Call.started_at <= cutoff
        )
    ).all()
    for call in due:
        _finish(s, call)
    return len(due)


def _finish(s: Session, call: Call) -> None:
    lead = call.lead
    result = outcome(lead, call.attempt_no)
    log.info("simulated call for lead %s attempt %s: %s", lead.id, call.attempt_no, result)
    if result in ("voicemail", "no_answer"):
        service.call_ended(s, call, transcript=[], summary=f"Simulated: {result.replace('_', ' ')}.",
                           duration_secs=25 if result == "voicemail" else 0, voicemail=result == "voicemail")
        # Some people who miss the call book from the text instead.
        if lead.status == LeadStatus.NO_ANSWER or lead.status == LeadStatus.NEEDS_HUMAN:
            if _roll(lead, call.attempt_no, "text") < 14:
                messaging.apply_reply(s, lead, str(1 + _roll(lead, call.attempt_no, "pick") % 3))
        return

    call.answered_at = call.connected_at = call.started_at + timedelta(seconds=4)
    said = [{"role": "agent", "message": f"Hi, this is Ava, an automated assistant calling from your doctor's office. "
                                          f"Just so you know, this call is recorded. Am I speaking with {lead.first_name}?"},
            {"role": "user", "message": "Yes, speaking."}]
    if lead.birth_date:
        service.tool_verify_identity(s, lead, lead.birth_date)
    if result == "booked":
        for q in service.campaign_for(lead).prescreen_questions:
            service.tool_record_answer(s, lead, q.id, "no" if q.role != "require_yes" else "yes")
        campaign = service.campaign_for(lead)
        found = slots.open_slots(s, campaign, n=3, practice_id=lead.practice_id)
        if not found:
            slots.seed_slots(s, campaign, practice_id=lead.practice_id)
            found = slots.open_slots(s, campaign, n=3, practice_id=lead.practice_id)
        if found:
            service.tool_book_visit(s, lead, found[_roll(lead, call.attempt_no, "slot") % len(found)].id)
        said.append({"role": "user", "message": "Sure, that time works for me."})
    elif result == "not_interested":
        service.tool_not_interested(s, lead, "not right now")
        said.append({"role": "user", "message": "Thanks, but I'm not interested right now."})
    elif result == "follow_up":
        q = next(iter(service.campaign_for(lead).prescreen_questions), None)
        if q:
            service.tool_record_answer(s, lead, q.id, "I'm not sure")
        if lead.status == LeadStatus.CALLING:
            service.tool_escalate(s, lead, "wants to talk it over with the doctor first")
        said.append({"role": "user", "message": "I'd like to talk to the doctor about it first."})
    elif result == "callback_later":
        service.tool_schedule_callback(s, lead, "after 5")
        said.append({"role": "user", "message": "Can you call me back after 5?"})
    service.call_ended(s, call, transcript=said, summary=f"Simulated: {result.replace('_', ' ')}.", duration_secs=95)
