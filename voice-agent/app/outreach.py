"""Practice outreach: a doctor accepts a trial, and Ava calls their pre-screened patients.

The sequence for each patient (design: docs/superpowers/specs/2026-10-11-outbound-caller-design.md):
  call -> no answer: voicemail (if a machine picks up) + a text offering times -> retry the next day
  at a different time of day -> after 3 tries, the staff queue. Booking anywhere (call, text reply,
  callback) stops everything; so does STOP or "not interested".
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ehr, prescreen, slots
from app.campaigns import Campaign, get_campaign
from app.config import get_settings
from app.models import Call, Lead, LeadStatus, PracticeProfile, TrialAcceptance, utcnow

log = logging.getLogger("outreach")

CALL_START, CALL_END = time(9, 0), time(20, 0)
WINDOWS = {  # patient preference -> local time range for the next call
    "morning": (time(9, 30), time(12, 0)),
    "afternoon": (time(12, 0), time(17, 0)),
    "evening": (time(17, 0), time(20, 0)),
}


class OutreachError(ValueError):
    pass


# ---------------------------------------------------------------- practices


def campaign_id_for(nct_id: str) -> str:
    return f"practice-{nct_id.lower()}"


def profile(s: Session, practice_id: str) -> PracticeProfile:
    """The practice's profile, created with demo defaults on first use."""
    p = s.get(PracticeProfile, practice_id)
    if p is None:
        settings = get_settings()
        staff = next((c.coordinator_phone for c in _opt_in_campaigns() if c.coordinator_phone), "")
        name = ehr.practice_name(practice_id)
        p = PracticeProfile(
            practice_id=practice_id,
            name=name,
            address=f"{name} office, New Jersey (demo address)",
            callback_phone=settings.twilio_from_number or staff,
            staff_phone=staff,
        )
        s.add(p)
        s.flush()
    return p


def _opt_in_campaigns() -> list[Campaign]:
    from app.campaigns import all_campaigns

    return [c for c in all_campaigns().values() if c.mode == "opt_in"]


def doctor_display(p: PracticeProfile) -> str:
    return f"Dr. {p.doctor_name}" if p.doctor_name else "your doctor"


def office_display(p: PracticeProfile) -> str:
    return f"Dr. {p.doctor_name}'s office" if p.doctor_name else f"your doctor's office at {p.name}"


def clean_doctor_name(raw: str) -> str:
    return re.sub(r"^\s*(dr\.?|doctor)\s+", "", raw.strip(), flags=re.I).strip()


# ---------------------------------------------------------------- accepting a trial


def personal_touch(patient: dict, p: PracticeProfile, today: date | None = None) -> str:
    """One pre-written line from the chart: when they were last in. Never a diagnosis or result."""
    today = today or date.today()
    dates = [o["date"] for o in patient.get("observations", {}).values() if o.get("date")]
    if not dates:
        return ""
    last = date.fromisoformat(max(dates))
    who = doctor_display(p) if p.doctor_name else "the doctor"
    if (today - last).days > 548:
        return f"It's been a little while since you were last in to see {who}, so it's nice to catch up."
    when = last.strftime("%B") if last.year == today.year else last.strftime("%B of %Y")
    return f"Last time you were in to see {who} was back in {when}."


def _fake_phone(patient_id: str) -> str:
    # Area code 555 isn't assigned anywhere, so these can never reach a real line.
    n = int(hashlib.sha256(patient_id.encode()).hexdigest(), 16) % 10_000_000
    return f"+1555{n:07d}"


def ensure_campaign(s: Session, nct_id: str) -> Campaign | None:
    """The trial's practice call script: an existing campaign, else one built from its public
    registry row (campaigns.from_trial, templated, no LLM) and stored. None when neither exists."""
    campaign = get_campaign(campaign_id_for(nct_id))
    if campaign is not None:
        return campaign
    row = ehr.trial(nct_id)
    if row is None:
        return None
    from app import campaigns

    log.info("built a call script for %s from the trial registry", nct_id)
    return campaigns.save_campaign(s, campaigns.from_trial(row), note="built from the trial registry")


def accept_trial(s: Session, practice_id: str, nct_id: str, doctor_name: str) -> TrialAcceptance:
    """The doctor said yes. Build the call list; calls start on the next worker tick."""
    # Something to screen against: the engine's stored results for this practice, or a protocol.
    if prescreen.protocol(nct_id) is None and not ehr.prescreen_results(practice_id, nct_id):
        raise OutreachError(f"no pre-screen results for {nct_id} at this practice")
    campaign = ensure_campaign(s, nct_id)
    if campaign is None:
        raise OutreachError(f"no call script for {nct_id}")
    existing = s.scalars(
        select(TrialAcceptance).where(TrialAcceptance.practice_id == practice_id, TrialAcceptance.nct_id == nct_id)
    ).first()
    if existing:
        return existing

    prof = profile(s, practice_id)
    if doctor_name.strip():
        prof.doctor_name = clean_doctor_name(doctor_name)
    results = prescreen.screen_practice(practice_id, nct_id)
    # Best matches first when the engine ranked them; otherwise alphabetical.
    candidates = sorted((r for r in results if r.bucket == "candidate"), key=lambda r: (-(r.score or 0), r.patient["name"]))
    review = [r for r in results if r.bucket == "chart_review"]

    acc = TrialAcceptance(
        practice_id=practice_id, nct_id=nct_id, campaign_id=campaign.id,
        accepted_by=doctor_display(prof), candidates=len(candidates), chart_review=len(review),
    )
    s.add(acc)
    s.flush()
    slots.seed_slots(s, campaign.for_practice(prof), practice_id=practice_id)

    real_phones = get_settings().demo_phone_list
    now = utcnow()
    for i, r in enumerate(candidates + review):
        pt = r.patient
        real = i < len(real_phones) and r.bucket == "candidate"
        first, _, last = pt["name"].partition(" ")
        lead = Lead(
            campaign_id=campaign.id, first_name=first, last_name=last,
            phone=real_phones[i] if real else _fake_phone(pt["id"]),
            timezone=prof.timezone, source="practice", consent_given=True,
            consent_text=f"Existing patient of {prof.name}; trial accepted by {acc.accepted_by}.",
            practice_id=practice_id, patient_id=pt["id"], acceptance_id=acc.id,
            birth_date=pt["birthDate"], personal_touch=personal_touch(pt, prof),
            simulated=not real, created_at=now,
        )
        s.add(lead)
        s.flush()
        from app import service

        service.log_event(s, lead, "lead_received", source="practice", trial=nct_id, accepted_by=acc.accepted_by)
        if r.bucket == "candidate":
            lead.next_attempt_at = now
            service.set_status(s, lead, LeadStatus.QUEUED, "pre-screen candidate; trial accepted")
        else:
            service.add_flag(lead, "chart_review", "; ".join(r.review_reasons) or "needs a chart check")
            service.set_status(s, lead, LeadStatus.CHART_REVIEW, "needs a chart check before anyone calls")
    log.info("accepted %s for %s: %s candidates, %s chart review", nct_id, practice_id, len(candidates), len(review))
    return acc


def clear_chart_review(s: Session, lead: Lead) -> None:
    from app import service

    if lead.status != LeadStatus.CHART_REVIEW:
        raise OutreachError("not waiting on chart review")
    lead.next_attempt_at = utcnow()
    service.log_event(s, lead, "chart_review_cleared")
    service.set_status(s, lead, LeadStatus.QUEUED, "cleared by office staff")


def drop(s: Session, lead: Lead, reason: str = "") -> None:
    from app import service

    lead.next_attempt_at = None
    service.set_status(s, lead, LeadStatus.DROPPED, reason or "dropped by office staff")


# ---------------------------------------------------------------- timing


def fast_forward() -> int:
    return get_settings().demo_day_seconds


def _local(now: datetime, tz: str) -> datetime:
    aware = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now
    return aware.astimezone(ZoneInfo(tz))


def _to_utc_naive(local: datetime) -> datetime:
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def window_range(window: str | None) -> tuple[time, time]:
    if not window:
        return CALL_START, CALL_END
    if window in WINDOWS:
        return WINDOWS[window]
    if m := re.fullmatch(r"after (\d{1,2}):(\d{2})", window):
        start = time(min(int(m.group(1)), 19), int(m.group(2)))
        return max(start, CALL_START), CALL_END
    return CALL_START, CALL_END


def next_attempt(lead: Lead, now: datetime, last_call_local: datetime | None = None) -> datetime:
    """The next day, at a different time of day than the last try, inside calling hours and the
    patient's preferred window. Returns naive UTC. Fast-forward: a 'day' is demo_day_seconds."""
    if fast_forward():
        return now + timedelta(seconds=fast_forward())
    tz = lead.timezone or "America/New_York"
    local_now = _local(now, tz)
    start, end = window_range(lead.call_window)
    # Shift ~4 hours from the last try so people with a fixed routine get a different slot.
    last_hour = (last_call_local or local_now).hour
    hour = last_hour + 4
    if hour >= end.hour or hour < start.hour:
        hour = start.hour + (1 if start.hour == CALL_START.hour else 0)
    day = local_now.date() + timedelta(days=1)
    if day.weekday() == 6 and not get_settings().call_sundays:  # Sunday: no calls unless allowed
        day += timedelta(days=1)
    target = datetime.combine(day, time(hour, 0 if hour > start.hour else start.minute), tzinfo=ZoneInfo(tz))
    return _to_utc_naive(target)


def in_calling_hours(lead: Lead, now: datetime) -> bool:
    if fast_forward():
        return True
    local = _local(now, lead.timezone or "America/New_York")
    start, end = window_range(lead.call_window)
    return (local.weekday() != 6 or get_settings().call_sundays) and start <= local.time() < end


def next_calling_time(lead: Lead, now: datetime) -> datetime:
    """Earliest moment >= now inside calling hours and the patient's window (naive UTC)."""
    if fast_forward():
        return now
    tz = ZoneInfo(lead.timezone or "America/New_York")
    local = _local(now, lead.timezone or "America/New_York")
    start, end = window_range(lead.call_window)
    for add in range(8):
        day = local.date() + timedelta(days=add)
        if day.weekday() == 6 and not get_settings().call_sundays:
            continue
        open_at = datetime.combine(day, start, tzinfo=tz)
        close_at = datetime.combine(day, end, tzinfo=tz)
        if local < close_at:
            return _to_utc_naive(max(local, open_at))
    return _to_utc_naive(local + timedelta(days=1))


# ---------------------------------------------------------------- after a missed attempt


def after_missed_attempt(s: Session, lead: Lead, reason: str) -> None:
    """Voicemail was (or wasn't) left. Text them to call back, then retry tomorrow or hand to staff.

    Booking happens on the phone: when they call back, Ava answers, checks who it is and books."""
    from app import service

    p = profile(s, lead.practice_id)
    if service.send_sms_logged(s, lead, lead.phone, missed_call_text(lead, p), "patient"):
        service.log_event(s, lead, "callback_requested", via="sms")

    if lead.attempts >= get_settings().max_attempts:
        lead.next_attempt_at = None
        service.add_flag(lead, "staff_queue", f"no answer after {lead.attempts} tries")
        service.set_status(s, lead, LeadStatus.NEEDS_HUMAN, f"no answer after {lead.attempts} tries")
        return
    last = lead.calls[-1].started_at if lead.calls else None
    lead.next_attempt_at = next_attempt(lead, utcnow(), _local(last, lead.timezone or "America/New_York") if last else None)
    service.set_status(s, lead, LeadStatus.NO_ANSWER, reason)
    service.log_event(s, lead, "retry_scheduled", at=lead.next_attempt_at.isoformat() + "Z")


def missed_call_text(lead: Lead, p: PracticeProfile) -> str:
    # No study name, condition or test in a text: lock screens are public.
    number = spoken_phone(p.callback_phone) if p.callback_phone else "this number"
    return (
        f"Hi {lead.first_name}, this is Ava from {office_display(p)}. Sorry we missed you! {doctor_display(p)} wanted to "
        f"tell you about a research study you might be interested in. If you are, give us a call back at {number}. "
        f"Reply STOP to opt out."
    )


# ---------------------------------------------------------------- identity + preferences


_MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}
_MONTHS.update({m[:3]: i for m, i in list(_MONTHS.items())})
_ORDINALS = {w: i for i, w in enumerate(
    "zeroth first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth "
    "fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split())}
_ORDINALS.update({"thirtieth": 30})


def parse_date_of_birth(text: str) -> date | None:
    """'1961-11-29', '11/29/1961', 'November 29th, 1961', 'november twenty ninth nineteen sixty one'."""
    from app.screening import words_to_digits

    t = (text or "").lower().strip()
    if m := re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", t):
        return _date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if m := re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", t):
        return _date(_year(int(m.group(3))), int(m.group(1)), int(m.group(2)))
    t = re.sub(r"twenty[- ](first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)", lambda m: str(20 + _ORDINALS[m.group(1)]), t)
    t = re.sub(r"thirty[- ]first", "31", t)
    t = re.sub(r"\b(" + "|".join(_ORDINALS) + r")\b", lambda m: str(_ORDINALS[m.group(1)]), t)
    # "nineteen sixty one" -> 1961; "two thousand three" -> 2003
    t = re.sub(r"\bnineteen\b", "19@", t)
    t = re.sub(r"\btwo thousand( and)?\b", "20@", t)
    t = words_to_digits(t)
    t = re.sub(r"(19|20)@\s*(\d{1,2})\b", lambda m: m.group(1) + m.group(2).zfill(2), t)
    t = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", t)
    month = next((n for name, n in _MONTHS.items() if re.search(rf"\b{name}\b", t)), None)
    nums = [int(n) for n in re.findall(r"\d+", t)]
    year = next((n for n in nums if n >= 1900), None)
    day_ = next((n for n in nums if 1 <= n <= 31 and n != year), None)
    if month and year and day_:
        return _date(year, month, day_)
    return None


def _year(y: int) -> int:
    return y if y >= 100 else (1900 + y if y > date.today().year % 100 else 2000 + y)


def _date(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def parse_call_window(text: str) -> str | None:
    """'after 5', 'after 5:30pm', 'mornings', 'tomorrow afternoon', 'in the evening' -> a window."""
    t = (text or "").lower()
    if m := re.search(r"after (\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?", t):
        h, mins, ampm = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "")
        if ampm.startswith("p") and h < 12 or (not ampm and 1 <= h <= 7):
            h += 12
        return f"after {h}:{mins:02d}"
    for w in ("morning", "afternoon", "evening"):
        if w in t:
            return w
    if "night" in t or "after work" in t:
        return "evening"
    if "lunch" in t or "noon" in t:
        return "afternoon"
    return None


def describe_window(window: str) -> str:
    if window.startswith("after "):
        h, m = map(int, window[6:].split(":"))
        return f"after {time(h, m).strftime('%-I:%M %p').replace(':00', '')}"
    return f"in the {window}"


def set_call_window(s: Session, lead: Lead, window: str, raw: str) -> None:
    from app import service

    lead.call_window = window
    service.log_event(s, lead, "call_window_set", window=window, said=raw[:200])
    if lead.status in (LeadStatus.NO_ANSWER, LeadStatus.QUEUED, LeadStatus.NEEDS_HUMAN, LeadStatus.CALLING):
        # From a call or a text: the next try waits for their window (at least an hour from now).
        lead.next_attempt_at = next_calling_time(lead, utcnow() + timedelta(seconds=fast_forward() or 3600))
        service.set_status(s, lead, LeadStatus.NO_ANSWER, f"call back {describe_window(window)}")


# ---------------------------------------------------------------- inbound


def lead_for_caller(s: Session, phone: str) -> Lead | None:
    """The practice lead an inbound caller is most likely about: an open one first, else the latest."""
    leads = list(s.scalars(select(Lead).where(Lead.phone == phone, Lead.practice_id.is_not(None)).order_by(Lead.id.desc())))
    open_ = [x for x in leads if x.status not in (LeadStatus.OPTED_OUT, LeadStatus.DROPPED, LeadStatus.CLOSED)]
    return (open_ or leads or [None])[0]


def start_inbound_call(s: Session, lead: Lead, call_sid: str | None) -> Call:
    from app import service

    call = Call(lead_id=lead.id, attempt_no=lead.attempts, direction="inbound", provider_call_sid=call_sid,
                connected_at=utcnow(), answered_at=utcnow())
    s.add(call)
    s.flush()
    service.log_event(s, lead, "inbound_call", call_id=call.id)
    if lead.status in (LeadStatus.NO_ANSWER, LeadStatus.QUEUED, LeadStatus.NEEDS_HUMAN):
        lead.next_attempt_at = None
        service.set_status(s, lead, LeadStatus.CALLING, "patient called back")
    return call


def dynamic_variables(s: Session, lead: Lead) -> dict[str, str]:
    p = profile(s, lead.practice_id)
    return {
        "first_name": lead.first_name,
        "lead_id": str(lead.id),
        "office_name": office_display(p),
        "doctor_name": doctor_display(p),
        "callback_number": spoken_phone(p.callback_phone),
        # Every dynamic variable a tool references must be sent on every call, or ElevenLabs
        # ends the call. caller_id is only meaningful on inbound calls (take_message).
        "caller_id": "",
    }


def spoken_phone(e164: str) -> str:
    d = re.sub(r"\D", "", e164 or "")[-10:]
    return f"{d[:3]}-{d[3:6]}-{d[6:]}" if len(d) == 10 else e164
