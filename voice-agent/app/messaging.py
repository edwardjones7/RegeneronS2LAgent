"""Two-way texting after a booking: confirm, reschedule by reply, cancel, reminders, calendar file.

Patients reply to the confirmation text:
  C        confirm the visit
  R        get three new times, then reply 1, 2 or 3
  CANCEL   cancel the visit (the coordinator is told)
  anything else is forwarded to the coordinator.
STOP/START/HELP get Twilio's built-in reply. For practice outreach, STOP also stops all calls.
Practice outreach also accepts, before booking: 1/2/3 to book a time from the missed-call text,
a time preference ("after 5", "mornings") to move the next call, and "not interested".
"""

import hashlib
import hmac
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import service, slots
from app.config import get_settings
from app.models import Event, InboxMessage, Lead, LeadStatus, Slot, utcnow

REMINDER_WINDOW = timedelta(hours=24)


# ---------------------------------------------------------------- calendar links


def visit_token(lead_id: int) -> str:
    key = get_settings().tool_secret.encode()
    return f"{lead_id}-{hmac.new(key, f'ics:{lead_id}'.encode(), hashlib.sha256).hexdigest()[:16]}"


def lead_id_from_token(token: str) -> int | None:
    lead_id, _, _ = token.partition("-")
    return int(lead_id) if lead_id.isdigit() and hmac.compare_digest(token, visit_token(int(lead_id))) else None


def calendar_link(lead_id: int) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/visits/{visit_token(lead_id)}.ics"


def ics(lead: Lead, slot: Slot) -> str:
    campaign = service.campaign_for(lead)
    tz = ZoneInfo(campaign.timezone)
    start = slot.starts_at.replace(tzinfo=tz).astimezone(ZoneInfo("UTC"))
    end = start + timedelta(minutes=campaign.visit_length_minutes)
    fmt = "%Y%m%dT%H%M%SZ"
    esc = lambda t: t.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")  # noqa: E731
    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Call Me Maybe//Visit//EN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:visit-{lead.id}-{slot.id}@call-me-maybe",
        f"DTSTAMP:{utcnow().strftime(fmt)}",
        f"DTSTART:{start.strftime(fmt)}", f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{esc(f'Research study screening visit ({campaign.study_short_name})')}",
        f"LOCATION:{esc(campaign.clinic_address)}",
        f"DESCRIPTION:{esc(f'With {campaign.team_name}. Questions or to reschedule: {campaign.clinic_phone}')}",
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Screening visit", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", "",
    ])


# ---------------------------------------------------------------- inbound replies


def _latest_lead(s: Session, phone: str) -> Lead | None:
    from app import outreach

    return outreach.lead_for_caller(s, phone) or s.scalars(
        select(Lead).where(Lead.phone == phone).order_by(Lead.id.desc())
    ).first()


OFFER_EVENTS = ("reschedule_offered", "slots_offered")
OPT_OUT_WORDS = {"stop", "stopall", "unsubscribe", "cancelall", "end", "quit"}
TWILIO_WORDS = OPT_OUT_WORDS | {"start", "help", "unstop"}
NOT_INTERESTED = ("not interested", "no thanks", "no thank you", "not for me", "no longer interested")


def _pending_offer(s: Session, lead: Lead) -> list[int] | None:
    ev = s.scalars(
        select(Event)
        .where(Event.lead_id == lead.id, Event.type.not_in(["sms_received", "sms_sent", "sms_failed", "status", "retry_scheduled"]))
        .order_by(Event.id.desc())
    ).first()
    return ev.detail.get("slot_ids") if ev and ev.type in OFFER_EVENTS else None


def handle_inbound(s: Session, from_phone: str, body: str) -> str | None:
    """Apply a patient's text reply. Returns the reply to send back (or None)."""
    try:
        phone = service.normalize_phone(from_phone)
    except service.LeadError:
        return None
    lead = _latest_lead(s, phone)
    if lead is None:
        word = re.sub(r"[^a-z0-9]", "", (body or "").lower())
        if word not in TWILIO_WORDS:
            s.add(InboxMessage(channel="sms", from_phone=phone, text=(body or "")[:1000]))
            return "Thanks! We've passed your message to the office and someone will get back to you."
        return None
    return apply_reply(s, lead, body)


def apply_reply(s: Session, lead: Lead, body: str) -> str | None:
    text = (body or "").strip()
    word = re.sub(r"[^a-z0-9]", "", text.lower())
    service.log_event(s, lead, "sms_received", body=text[:300])
    campaign = service.campaign_for(lead)
    slot = service.booked_slot(s, lead)
    practice = service.is_practice(lead)
    who = "the office" if practice else "the research team"

    if word in TWILIO_WORDS:
        # Twilio sends the opt-out confirmation itself. For practice outreach, STOP also stops calls.
        if practice and word in OPT_OUT_WORDS:
            service.tool_opt_out(s, lead, "replied STOP")
        return None

    offer = _pending_offer(s, lead)
    if offer and word in {"1", "2", "3"} and int(word) <= len(offer):
        new = s.get(Slot, offer[int(word) - 1])
        if new is None or not slots.book(s, new.id, lead.id):
            return "Sorry, that time was just taken. Reply R for new times."
        if slot:
            slot.booked_lead_id = None
        s.refresh(new)
        lead.status, lead.status_reason = LeadStatus.BOOKED, f"visit {new.starts_at.isoformat()}"
        lead.next_attempt_at = None
        if slot:
            service.log_event(s, lead, "visit_rescheduled", starts_at=new.starts_at.isoformat(), via="sms")
            return f"Done! You're now booked for {slots.short(new.starts_at)}. Add to calendar: {calendar_link(lead.id)}"
        service.log_event(s, lead, "visit_booked", slot_id=new.id, starts_at=new.starts_at.isoformat(), via="sms")
        if practice:
            service.add_flag(lead, "booked_by_text", "booked by text: identity and phone questions to confirm at check-in")
        return (f"You're booked with {campaign.team_name} on {slots.short(new.starts_at)}, {campaign.clinic_address}. "
                f"Add to calendar: {calendar_link(lead.id)} Reply C to confirm or R to reschedule.")

    if slot and word in {"c", "confirm", "confirmed", "yes", "y"}:
        service.log_event(s, lead, "visit_confirmed", via="sms")
        return f"Thanks {lead.first_name}, you're confirmed for {slots.short(slot.starts_at)}. See you then!"

    if slot and word in {"r", "reschedule", "change"}:
        options = [o for o in slots.open_slots(s, campaign, n=4, practice_id=lead.practice_id) if o.id != slot.id][:3]
        if not options:
            return f"No open times right now. Please call {campaign.clinic_phone} to reschedule."
        service.log_event(s, lead, "reschedule_offered", slot_ids=[o.id for o in options])
        lines = "\n".join(f"{i}) {slots.short(o.starts_at)}" for i, o in enumerate(options, 1))
        return f"Here are the next open times:\n{lines}\nReply 1, 2 or 3."

    if slot and word in {"cancel", "cancelvisit"}:
        slot.booked_lead_id = None
        lead.status, lead.status_reason = LeadStatus.CLOSED, "visit cancelled by text"
        service.log_event(s, lead, "visit_cancelled", via="sms")
        service.alert_coordinator(s, lead, "needs_human", f"Cancelled their {slots.short(slot.starts_at)} visit by text.")
        return f"Your visit is cancelled. If you change your mind, call {campaign.clinic_phone}."

    if practice and not slot:
        from app import outreach

        if any(p in text.lower() for p in NOT_INTERESTED):
            service.tool_not_interested(s, lead, "replied by text")
            return f"No problem, thanks for letting us know. {campaign.team_name[0].upper() + campaign.team_name[1:]} is here if you change your mind."
        window = outreach.parse_call_window(text)
        if window:
            outreach.set_call_window(s, lead, window, text)
            return f"Got it! We'll give you a call {outreach.describe_window(window)}."

    service.add_flag(lead, "text_message", text[:200])
    service.alert_coordinator(s, lead, "needs_human", f'Texted: "{text[:160]}"')
    if practice and lead.status not in (LeadStatus.BOOKED, LeadStatus.CLOSED, LeadStatus.OPTED_OUT, LeadStatus.DROPPED):
        lead.next_attempt_at = None
        service.set_status(s, lead, LeadStatus.NEEDS_HUMAN, "texted back; a person should reply")
    return f"Thanks! We've passed your message to {who} and they'll get back to you."


# ---------------------------------------------------------------- reminders


def send_due_reminders(s: Session, now: datetime | None = None) -> int:
    """Text booked patients the day before (once per visit)."""
    sent = 0
    for slot, lead in s.execute(select(Slot, Lead).join(Lead, Lead.id == Slot.booked_lead_id)).all():
        campaign = service.campaign_for(lead)
        local_now = (now or datetime.now(ZoneInfo(campaign.timezone))).replace(tzinfo=None)
        if not (local_now < slot.starts_at <= local_now + REMINDER_WINDOW):
            continue
        reminded = s.scalars(select(Event).where(Event.lead_id == lead.id, Event.type == "reminder_sent")).all()
        if any(e.detail.get("slot_id") == slot.id for e in reminded):
            continue
        body = (f"Reminder: your screening visit with {campaign.team_name} is {slots.short(slot.starts_at)}, "
                f"{campaign.clinic_address}. Reply C to confirm or R to reschedule.")
        if service.send_sms_logged(s, lead, lead.phone, body, "patient"):
            service.log_event(s, lead, "reminder_sent", slot_id=slot.id)
            sent += 1
    return sent
