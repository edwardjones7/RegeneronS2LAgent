"""Business logic shared by the HTTP routes, the background worker and mock mode."""

import logging
import re
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, object_session

from app import hours, slots, sms
from app.campaigns import Campaign, get_campaign
from app.config import get_settings
from app.db import session_scope
from app.models import FINAL_STATUSES, Answer, Call, Event, InboxMessage, Lead, LeadStatus, Slot, Suppression, utcnow
from app.screening import AnswerRecord, Decision, decide, score_answer
from app.voice import get_voice

log = logging.getLogger("service")


class LeadError(ValueError):
    pass


# ---------------------------------------------------------------- helpers


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if raw.strip().startswith("+") and 8 <= len(digits) <= 15:
        return "+" + digits
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    raise LeadError(f"can't read phone number {raw!r}")


def log_event(s: Session, lead: Lead, type_: str, **detail) -> Event:
    ev = Event(lead_id=lead.id, type=type_, detail=detail)
    s.add(ev)
    s.flush()
    return ev


def is_suppressed(s: Session, phone: str) -> bool:
    return s.get(Suppression, phone) is not None


def set_status(s: Session, lead: Lead, status: LeadStatus, reason: str = "") -> None:
    """Change status, respecting precedence: emergency > opted_out > everything else."""
    current = LeadStatus(lead.status)
    if current == LeadStatus.EMERGENCY and status != LeadStatus.EMERGENCY:
        return
    if current == LeadStatus.OPTED_OUT and status not in (LeadStatus.EMERGENCY, LeadStatus.OPTED_OUT):
        return
    if current == LeadStatus.BOOKED and status in (LeadStatus.NEEDS_HUMAN, LeadStatus.NO_ANSWER, LeadStatus.CLOSED):
        return
    lead.status = status
    lead.status_reason = reason
    log_event(s, lead, "status", status=str(status), reason=reason)


def add_flag(lead: Lead, kind: str, detail: str) -> None:
    if any(f["type"] == kind and f["detail"] == detail for f in lead.flags):
        return
    lead.flags = [*lead.flags, {"type": kind, "detail": detail, "at": utcnow().isoformat()}]


def record_link(lead: Lead) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/dashboard/leads/{lead.id}"


def campaign_for(lead: Lead) -> Campaign:
    c = get_campaign(lead.campaign_id)
    if c is None:
        raise LeadError(f"unknown campaign {lead.campaign_id}")
    if lead.practice_id:
        from app import outreach

        s = object_session(lead)
        if s is not None:
            return c.for_practice(outreach.profile(s, lead.practice_id))
    return c


def is_practice(lead: Lead) -> bool:
    return bool(lead.practice_id)


def sms_for(lead: Lead):
    """Simulated demo patients never get real texts (and neither does staff about them)."""
    return sms.MockSms() if lead.simulated else sms.get_sms()


def answer_records(lead: Lead) -> list[AnswerRecord]:
    return [AnswerRecord(a.question_id, a.raw_text, a.normalized_value, a.verdict) for a in lead.answers]


def current_decision(lead: Lead) -> Decision:
    return decide(answer_records(lead), campaign_for(lead))


def seconds_to_first_call(lead: Lead) -> int | None:
    if not lead.calls:
        return None
    return max(0, int((lead.calls[0].started_at - lead.created_at).total_seconds()))


def booked_slot(s: Session, lead: Lead) -> Slot | None:
    return s.scalars(select(Slot).where(Slot.booked_lead_id == lead.id)).first()


# ---------------------------------------------------------------- intake + dialing


def create_lead(
    s: Session,
    *,
    campaign_id: str,
    first_name: str,
    phone: str,
    consent_given: bool,
    consent_text: str = "",
    last_name: str = "",
    source: str = "web_form",
    timezone: str | None = None,
    now: datetime | None = None,
) -> tuple[Lead, bool]:
    """Store a lead. Returns (lead, should_dial_now)."""
    now = now or utcnow()
    campaign = get_campaign(campaign_id)
    if campaign is None:
        raise LeadError(f"unknown campaign {campaign_id!r}")
    if not consent_given:
        raise LeadError("no consent to be contacted; not storing or calling")
    lead = Lead(
        campaign_id=campaign_id,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        phone=normalize_phone(phone),
        consent_given=True,
        consent_text=consent_text,
        consent_at=now,
        source=source,
        timezone=timezone,
        created_at=now,
    )
    s.add(lead)
    s.flush()
    log_event(s, lead, "lead_received", source=source, consent_text=consent_text)

    if is_suppressed(s, lead.phone):
        set_status(s, lead, LeadStatus.OPTED_OUT, "number is on the do-not-call list")
        return lead, False
    if not hours.can_call_now(lead.timezone, campaign, now):
        lead.next_attempt_at = hours.clamp_to_window(lead.timezone, campaign, now)
        set_status(s, lead, LeadStatus.QUEUED, "outside calling hours")
        return lead, False
    return lead, True


def dial(lead_id: int) -> None:
    """Place a call now. Safe to call from a background task or the worker."""
    voice = get_voice()
    with session_scope() as s:
        lead = s.get(Lead, lead_id)
        if lead is None:
            return
        campaign = campaign_for(lead)
        now = utcnow()
        if is_suppressed(s, lead.phone):
            set_status(s, lead, LeadStatus.OPTED_OUT, "number is on the do-not-call list")
            return
        if LeadStatus(lead.status) in FINAL_STATUSES or lead.status == LeadStatus.CALLING:
            return
        if is_practice(lead):
            from app import outreach

            if not outreach.in_calling_hours(lead, now):
                lead.next_attempt_at = outreach.next_calling_time(lead, now)
                set_status(s, lead, LeadStatus.QUEUED, "outside calling hours")
                return
        elif not hours.can_call_now(lead.timezone, campaign, now):
            lead.next_attempt_at = hours.clamp_to_window(lead.timezone, campaign, now)
            set_status(s, lead, LeadStatus.QUEUED, "outside calling hours")
            return
        lead.attempts += 1
        lead.next_attempt_at = None
        call = Call(lead_id=lead.id, attempt_no=lead.attempts, started_at=now)
        s.add(call)
        set_status(s, lead, LeadStatus.CALLING)
        s.flush()
        call_id, first_name, phone = call.id, lead.first_name, lead.phone
        context = None
        if is_practice(lead):
            from app import outreach

            context = outreach.dynamic_variables(s, lead)
        if lead.simulated:
            from app.simulate_practice import SimulatedVoice

            voice = SimulatedVoice()

    # Network call outside the transaction.
    try:
        result = voice.start_call(lead_id=lead_id, first_name=first_name, phone=phone, campaign=campaign, context=context)
    except Exception as exc:  # noqa: BLE001
        log.exception("start_call failed for lead %s", lead_id)
        with session_scope() as s:
            lead = s.get(Lead, lead_id)
            log_event(s, lead, "call_failed_to_start", error=str(exc)[:500])
            _no_answer(s, lead, reason="call could not be started")
        return

    with session_scope() as s:
        call = s.get(Call, call_id)
        call.provider_conversation_id = result.get("conversation_id")
        call.provider_call_sid = result.get("call_sid")
        log_event(s, call.lead, "call_started", attempt=call.attempt_no, conversation_id=call.provider_conversation_id)


def _no_answer(s: Session, lead: Lead, reason: str) -> None:
    if is_practice(lead):
        from app import outreach

        outreach.after_missed_attempt(s, lead, reason)
        return
    campaign = campaign_for(lead)
    if lead.attempts >= get_settings().max_attempts:
        set_status(s, lead, LeadStatus.CLOSED, f"no answer after {lead.attempts} attempts")
        return
    lead.next_attempt_at = hours.retry_at(lead.attempts, lead.timezone, campaign, utcnow())
    set_status(s, lead, LeadStatus.NO_ANSWER, reason)
    log_event(s, lead, "retry_scheduled", at=lead.next_attempt_at.isoformat() + "Z")


def due_leads(s: Session, now: datetime | None = None) -> list[int]:
    """Leads due a call, at most `batch_size` calls in progress at once."""
    now = now or utcnow()
    in_progress = s.scalar(select(func.count()).select_from(Lead).where(Lead.status == LeadStatus.CALLING)) or 0
    room = max(0, get_settings().batch_size - in_progress)
    if not room:
        return []
    return list(
        s.scalars(
            select(Lead.id)
            .where(
                Lead.status.in_([LeadStatus.QUEUED, LeadStatus.NO_ANSWER]),
                Lead.next_attempt_at.is_not(None),
                Lead.next_attempt_at <= now,
            )
            .order_by(Lead.next_attempt_at, Lead.id)
            .limit(room)
        )
    )


# ---------------------------------------------------------------- agent tools


def _question_line(q) -> str:
    return f'(question_id: "{q.id}") "{q.ask}"'


def tool_record_answer(s: Session, lead: Lead, question_id: str, answer: str) -> str:
    campaign = campaign_for(lead)
    before = current_decision(lead)
    q = campaign.question(question_id)
    if q is None:
        nxt = before.next_question
        hint = f" The current question is {_question_line(nxt)}" if nxt else ""
        return f"Error: unknown question_id {question_id!r}.{hint}"
    rec = score_answer(q, answer)
    s.add(Answer(lead_id=lead.id, question_id=q.id, raw_text=rec.raw_text, normalized_value=rec.normalized_value, verdict=rec.verdict))
    s.flush()
    s.refresh(lead)
    if is_practice(lead):
        return _practice_answer(s, lead, q, answer, rec.verdict)
    d = current_decision(lead)
    log_event(s, lead, "answer", question_id=q.id, answer=answer, verdict=rec.verdict, state=d.state)

    if d.state == "in_progress":
        nxt = d.next_question
        if nxt.id == q.id:
            return f"Recorded, but the answer wasn't clear. Gently ask again: {_question_line(nxt)}"
        return f"Recorded. Ask next: {_question_line(nxt)}"
    if d.state == "fit":
        for f in d.flags:
            add_flag(lead, "screening", f)
        log_event(s, lead, "screening_complete", result="fit", bmi=d.bmi, flags=d.flags)
        if is_practice(lead):
            return "Thanks, that's all the questions. Call get_open_slots now and offer two or three times for a screening visit."
        return "Screening complete: LOOKS LIKE A FIT. Call get_open_slots now and offer two or three times."
    if d.state == "not_a_fit" and is_practice(lead):
        set_status(s, lead, LeadStatus.NOT_A_FIT, d.reason)
        log_event(s, lead, "screening_complete", result="not_a_fit", reason=d.reason)
        return ("Done: THE OFFICE WILL FOLLOW UP. Don't offer times. Thank them warmly, say someone from the office "
                "will be in touch, and end the call. Never say why or mention eligibility.")
    if d.state == "not_a_fit":
        set_status(s, lead, LeadStatus.NOT_A_FIT, d.reason)
        log_event(s, lead, "screening_complete", result="not_a_fit", reason=d.reason, bmi=d.bmi)
        return "Screening complete: NOT A FIT. Thank them warmly, say the team will keep their information on file, then end the call."
    # needs_review
    add_flag(lead, "needs_review", d.reason)
    set_status(s, lead, LeadStatus.NEEDS_HUMAN, d.reason)
    log_event(s, lead, "screening_complete", result="needs_review", reason=d.reason)
    alert_coordinator(s, lead, "needs_human", f"Screening needs review: {d.reason}.")
    if is_practice(lead):
        return "Done: THE OFFICE WILL FOLLOW UP. Thank them, say someone from the office will call to go over a couple of things, and end the call."
    return "Screening complete: NEEDS REVIEW. Thank them and say someone from the research team will call back to go over a couple of things, then end the call."


def tool_get_open_slots(s: Session, lead: Lead) -> str:
    if is_practice(lead) and not lead.identity_verified:
        return "Not yet: confirm their date of birth with verify_identity first."
    if is_practice(lead) and (nxt := practice_next_question(lead)):
        return f"Not yet: ask this first: {_question_line(nxt)}"
    d = current_decision(lead)
    if not is_practice(lead) and not d.may_offer_slots:
        nxt = d.next_question
        if nxt:
            return f"Not yet: the screening isn't finished. Ask next: {_question_line(nxt)}"
        return "Not available: do not offer a visit. Follow the instructions from the last record_answer result."
    existing = booked_slot(s, lead)
    if existing:
        return f"Already booked for {slots.spoken(existing.starts_at)} (slot_id {existing.id}). Just confirm it."
    campaign = campaign_for(lead)
    found = slots.open_slots(s, campaign, n=3, practice_id=lead.practice_id)
    if not found:
        slots.seed_slots(s, campaign, practice_id=lead.practice_id)
        found = slots.open_slots(s, campaign, n=3, practice_id=lead.practice_id)
    if not found:
        return "No open times right now. Say the research team will call to schedule, then call escalate_to_human with reason 'no open slots'."
    options = "; ".join(f"slot_id {sl.id}: {slots.spoken(sl.starts_at)}" for sl in found)
    return f"Open times (offer these, in plain words): {options}."


def tool_book_visit(s: Session, lead: Lead, slot_id: int) -> str:
    campaign = campaign_for(lead)
    existing = booked_slot(s, lead)
    if existing:
        return f"Already booked: {slots.spoken(existing.starts_at)}. Confirm that time with them."
    if is_practice(lead) and not lead.identity_verified:
        return "Can't book yet: confirm their date of birth with verify_identity first."
    if is_practice(lead) and (nxt := practice_next_question(lead)):
        return f"Can't book yet: ask this first: {_question_line(nxt)}"
    d = current_decision(lead)
    if not is_practice(lead) and not d.may_offer_slots:
        return "Can't book: the screening doesn't show a fit. Follow the last record_answer instructions."
    slot = s.get(Slot, int(slot_id))
    if slot is None or slot.campaign_id != campaign.id or slot.practice_id != lead.practice_id:
        return "That slot_id doesn't exist. Call get_open_slots again and offer those times."
    if not slots.book(s, slot.id, lead.id):
        return "That time was just taken. Call get_open_slots again and offer the new times."
    s.refresh(slot)
    set_status(s, lead, LeadStatus.BOOKED, f"visit {slot.starts_at.isoformat()}")
    log_event(s, lead, "visit_booked", slot_id=slot.id, starts_at=slot.starts_at.isoformat())

    lead.next_attempt_at = None
    when = slots.short(slot.starts_at)
    client = sms_for(lead)
    for to, body, kind in (
        (lead.phone, sms.patient_confirmation(lead.first_name, when, campaign, calendar_link(lead.id)), "patient"),
        (
            campaign.coordinator_phone,
            sms.coordinator_booked(
                lead.first_name, lead.last_name, when, campaign,
                *((len({a.question_id for a in lead.answers}), len(campaign.prescreen_questions)) if is_practice(lead) else (d.answered, d.total)),
                d.flags + [f["detail"] for f in lead.flags if f["type"] in ("escalation", "screening_note")],
                None if is_practice(lead) else seconds_to_first_call(lead), record_link(lead),
            ),
            "coordinator",
        ),
    ):
        try:
            sid = client.send(to, body)
            log_event(s, lead, "sms_sent", to=kind, sid=sid, body=body)
        except Exception as exc:  # noqa: BLE001
            log.exception("sms to %s failed", kind)
            log_event(s, lead, "sms_failed", to=kind, error=str(exc)[:300])
    who = "the office" if is_practice(lead) else "the research team"
    return (
        f"Booked for {slots.spoken(slot.starts_at)}. Read the time back, tell them a text confirmation is on its way, "
        f"and that {who} will check whether the study is a good fit at the visit."
    )


def tool_opt_out(s: Session, lead: Lead, reason: str = "") -> str:
    if not is_suppressed(s, lead.phone):
        s.add(Suppression(phone=lead.phone, reason=reason or "asked not to be called"))
    lead.next_attempt_at = None
    set_status(s, lead, LeadStatus.OPTED_OUT, reason or "asked not to be called")
    return "Done: they won't be called again. Apologize for the bother, confirm that, and end the call politely."


def tool_not_interested(s: Session, lead: Lead, reason: str = "") -> str:
    lead.next_attempt_at = None
    set_status(s, lead, LeadStatus.CLOSED, f"not interested{': ' + reason if reason else ''}")
    return "Noted. Thank them for their time, say they can reach out any time, and end the call politely."


def tool_escalate(s: Session, lead: Lead, reason: str) -> str:
    add_flag(lead, "escalation", reason)
    set_status(s, lead, LeadStatus.NEEDS_HUMAN, reason)
    alert_coordinator(s, lead, "needs_human", f"Reason: {reason.rstrip('.?! ')}.")
    return "Noted: the research team has been alerted. Follow the safety rule that applies."


def tool_flag_emergency(s: Session, lead: Lead, what_they_said: str) -> str:
    add_flag(lead, "emergency", what_they_said)
    set_status(s, lead, LeadStatus.EMERGENCY, what_they_said)
    alert_coordinator(s, lead, "emergency", f'They said: "{what_they_said}". Agent told them to call 911.')
    return "Flagged. Make sure you've told them to hang up and call 911 now, then end the call."


def send_sms_logged(s: Session, lead: Lead, to: str, body: str, kind: str) -> bool:
    """Send a text and record it on the lead's timeline either way."""
    try:
        sid = sms_for(lead).send(to, body)
        log_event(s, lead, "sms_sent", to=kind, sid=sid, body=body)
        return True
    except Exception as exc:  # noqa: BLE001
        log.exception("sms to %s failed", kind)
        log_event(s, lead, "sms_failed", to=kind, error=str(exc)[:300])
        return False


def calendar_link(lead_id: int) -> str:
    from app.messaging import calendar_link as link

    return link(lead_id)


def alert_coordinator(s: Session, lead: Lead, kind: str, detail: str) -> None:
    campaign = campaign_for(lead)
    body = sms.coordinator_alert(kind, lead.first_name, lead.last_name, lead.phone, detail, record_link(lead))
    try:
        sid = sms_for(lead).send(campaign.coordinator_phone, body)
        log_event(s, lead, "sms_sent", to="coordinator", sid=sid, body=body)
    except Exception as exc:  # noqa: BLE001
        log.exception("coordinator alert failed")
        log_event(s, lead, "sms_failed", to="coordinator", error=str(exc)[:300])


# ---------------------------------------------------------------- practice outreach tools

MAX_DOB_TRIES = 2


def tool_verify_identity(s: Session, lead: Lead, date_of_birth: str) -> str:
    """Check the date of birth on our server. Only after this does Ava learn anything about the study."""
    from app import outreach

    if not is_practice(lead):
        return "Not needed on this call."
    if lead.identity_verified:
        return "Already VERIFIED. " + _study_briefing(s, lead)
    said = outreach.parse_date_of_birth(date_of_birth)
    if said is None:
        return "Couldn't understand that date. Ask again, kindly: month, day and year."
    tries = s.scalar(
        select(func.count()).select_from(Event).where(Event.lead_id == lead.id, Event.type == "identity_check_failed")
    ) or 0
    if lead.birth_date and said.isoformat() == lead.birth_date:
        lead.identity_verified = True
        log_event(s, lead, "identity_verified")
        return "VERIFIED. " + _study_briefing(s, lead)
    log_event(s, lead, "identity_check_failed")
    if tries + 1 >= MAX_DOB_TRIES:
        add_flag(lead, "identity", "date of birth didn't match")
        set_status(s, lead, LeadStatus.NEEDS_HUMAN, "couldn't confirm identity")
        lead.next_attempt_at = None
        return ("NOT VERIFIED. Don't share anything about why you called. Say kindly that you'll have someone from "
                "the office give them a call, and end the call. Never reveal the date on file.")
    return "That doesn't match our records. Ask them, kindly, to say their date of birth once more. Never reveal the date on file."


def _study_briefing(s: Session, lead: Lead) -> str:
    campaign = campaign_for(lead)
    facts = "\n".join(f"- {f.fact}" for f in campaign.approved_facts)
    q = practice_next_question(lead)
    if q:
        nxt = f"When they're interested, ask: {_question_line(q)}"
    else:
        nxt = "When they're interested, call get_open_slots and offer two or three times for a screening visit."
    touch = f"Personal line (say it naturally): {lead.personal_touch}\n" if lead.personal_touch else ""
    return (
        f"{touch}Study one-liner: {campaign.one_liner}\n"
        f"APPROVED FACTS (the only study information you may share; ClinicalTrials.gov {campaign.nct_id}):\n{facts}\n"
        f"{nxt}"
    )


def practice_next_question(lead: Lead):
    """Practice calls ask each question once (a second time only if the answer was unclear).
    Answers never block booking: the in-person screening visit decides eligibility."""
    tries: dict[str, list[str]] = {}
    for a in lead.answers:
        tries.setdefault(a.question_id, []).append(a.verdict)
    for q in campaign_for(lead).prescreen_questions:
        verdicts = tries.get(q.id, [])
        if not verdicts or (verdicts[-1] == "unsure" and len(verdicts) < 2):
            return q
    return None


def _practice_answer(s: Session, lead: Lead, q, answer: str, verdict: str) -> str:
    asked_before = sum(1 for a in lead.answers if a.question_id == q.id) - 1
    log_event(s, lead, "answer", question_id=q.id, answer=answer, verdict=verdict)
    if verdict == "unsure" and asked_before == 0:
        return f"Recorded, but the answer wasn't clear. Gently ask again, for a yes or no: {_question_line(q)}"
    if verdict in ("disqualify", "unsure"):
        # A note for staff to go over at the screening visit, never a reason to stop the call.
        add_flag(lead, "screening_note", f"{q.id.replace('_', ' ')}: {answer[:160]}")
    nxt = practice_next_question(lead)
    if nxt:
        return f"Recorded. Ask next: {_question_line(nxt)}"
    log_event(s, lead, "screening_complete", result="booking", notes=[f["detail"] for f in lead.flags if f["type"] == "screening_note"])
    return ("Thanks, that's all the questions. Don't comment on their answers or on eligibility. Call get_open_slots now, "
            "offer two or three times for the screening visit at the office, and book the one they pick with book_visit.")


def tool_schedule_callback(s: Session, lead: Lead, when: str) -> str:
    from app import outreach

    window = outreach.parse_call_window(when)
    if window is None:
        add_flag(lead, "callback", when[:120])
        set_status(s, lead, LeadStatus.NEEDS_HUMAN, f"callback requested: {when[:120]}")
        lead.next_attempt_at = None
        return "Noted: someone from the office will call them back then. Thank them and end the call."
    outreach.set_call_window(s, lead, window, when)
    return f"Done: the next call will be {outreach.describe_window(window)}. Confirm that, thank them, and end the call."


def take_message(s: Session, name: str, callback_number: str, message: str, from_phone: str = "") -> str:
    s.add(InboxMessage(channel="call", from_phone=from_phone or callback_number, name=name[:200], text=message[:1000]))
    return "Message taken: someone from the office will call them back. Thank them and end the call."


# ---------------------------------------------------------------- after the call


def find_call(s: Session, conversation_id: str | None, lead_id: int | None = None) -> Call | None:
    if conversation_id:
        call = s.scalars(select(Call).where(Call.provider_conversation_id == conversation_id)).first()
        if call:
            return call
    if lead_id:
        return s.scalars(select(Call).where(Call.lead_id == lead_id).order_by(Call.id.desc())).first()
    return None


def call_ended(
    s: Session,
    call: Call,
    *,
    transcript: list[dict],
    summary: str = "",
    duration_secs: int | None = None,
    recording_url: str | None = None,
    voicemail: bool = False,
) -> None:
    """Store what happened and settle a lead the tools didn't already settle."""
    lead = call.lead
    if call.ended_at is not None:
        return  # duplicate webhook delivery
    call.ended_at = utcnow()
    call.transcript = transcript
    call.summary = summary
    call.duration_secs = duration_secs
    call.recording_url = recording_url
    user_spoke = any(t.get("role") == "user" and (t.get("message") or "").strip() for t in transcript)
    if user_spoke:
        call.connected_at = call.started_at
    log_event(s, lead, "call_ended", duration_secs=duration_secs, voicemail=voicemail, user_spoke=user_spoke)

    if lead.status == LeadStatus.CALLING:
        if voicemail or not user_spoke:
            _no_answer(s, lead, reason="voicemail left" if voicemail else "no answer")
        elif is_practice(lead) and not lead.identity_verified:
            # Hung up before we knew who we were talking to: same as a missed call (text + retry).
            _no_answer(s, lead, reason="hung up before identity was confirmed")
        else:
            add_flag(lead, "incomplete", "call ended before screening finished")
            set_status(s, lead, LeadStatus.NEEDS_HUMAN, "call ended before screening finished")
    call.outcome = lead.status


STALE_CALL_MINUTES = 30


def settle_stale_calls(s: Session, now: datetime | None = None) -> int:
    """Calls we never heard back about. Hand them to a person rather than redialing blindly."""
    cutoff = (now or utcnow()) - timedelta(minutes=STALE_CALL_MINUTES)
    stale = s.scalars(select(Call).where(Call.ended_at.is_(None), Call.started_at < cutoff)).all()
    for call in stale:
        call.ended_at = utcnow()
        call.outcome = "unknown"
        log_event(s, call.lead, "call_result_missing", minutes=STALE_CALL_MINUTES)
        if call.lead.status == LeadStatus.CALLING:
            add_flag(call.lead, "incomplete", "no call result received")
            set_status(s, call.lead, LeadStatus.NEEDS_HUMAN, "no call result received")
    return len(stale)


def call_failed(s: Session, call: Call, reason: str) -> None:
    if call.ended_at is not None:
        return
    call.ended_at = utcnow()
    call.outcome = "no_answer"
    log_event(s, call.lead, "call_not_connected", reason=reason)
    if call.lead.status == LeadStatus.CALLING:
        _no_answer(s, call.lead, reason=reason)
