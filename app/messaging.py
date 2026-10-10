"""Two-way texting after a booking: confirm, reschedule by reply, cancel, reminders, calendar file.

Patients reply to the confirmation text:
  C        confirm the visit
  R        get three new times, then reply 1, 2 or 3
  CANCEL   cancel the visit (the coordinator is told)
  anything else is forwarded to the coordinator.
STOP/START/HELP are handled by Twilio's built-in opt-out and never reach us as commands.
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
from app.models import Event, Lead, LeadStatus, Slot, utcnow

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
    return s.scalars(select(Lead).where(Lead.phone == phone).order_by(Lead.id.desc())).first()


def _pending_offer(s: Session, lead: Lead) -> list[int] | None:
    ev = s.scalars(
        select(Event)
        .where(Event.lead_id == lead.id, Event.type.not_in(["sms_received", "sms_sent", "sms_failed"]))
        .order_by(Event.id.desc())
    ).first()
    return ev.detail.get("slot_ids") if ev and ev.type == "reschedule_offered" else None


def handle_inbound(s: Session, from_phone: str, body: str) -> str | None:
    """Apply a patient's text reply. Returns the reply to send back (or None)."""
    try:
        phone = service.normalize_phone(from_phone)
    except service.LeadError:
        return None
    lead = _latest_lead(s, phone)
    text = (body or "").strip()
    word = re.sub(r"[^a-z0-9]", "", text.lower())
    if lead is None:
        return None
    service.log_event(s, lead, "sms_received", body=text[:300])
    campaign = service.campaign_for(lead)
    slot = service.booked_slot(s, lead)

    if word in {"stop", "start", "help", "unstop", "stopall", "unsubscribe", "cancelall", "end", "quit"}:
        return None  # Twilio's opt-out handling owns these

    offer = _pending_offer(s, lead)
    if offer and word in {"1", "2", "3"} and int(word) <= len(offer):
        new = s.get(Slot, offer[int(word) - 1])
        if new is None or not slots.book(s, new.id, lead.id):
            return "Sorry, that time was just taken. Reply R for new times."
        if slot:
            slot.booked_lead_id = None
        s.refresh(new)
        lead.status, lead.status_reason = LeadStatus.BOOKED, f"visit {new.starts_at.isoformat()}"
        service.log_event(s, lead, "visit_rescheduled", starts_at=new.starts_at.isoformat(), via="sms")
        return f"Done! You're now booked for {slots.short(new.starts_at)}. Add to calendar: {calendar_link(lead.id)}"

    if slot and word in {"c", "confirm", "confirmed", "yes", "y"}:
        service.log_event(s, lead, "visit_confirmed", via="sms")
        return f"Thanks {lead.first_name}, you're confirmed for {slots.short(slot.starts_at)}. See you then!"

    if slot and word in {"r", "reschedule", "change"}:
        options = [o for o in slots.open_slots(s, campaign, n=4) if o.id != slot.id][:3]
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

    service.add_flag(lead, "text_message", text[:200])
    service.alert_coordinator(s, lead, "needs_human", f'Texted: "{text[:160]}"')
    return "Thanks! We've passed your message to the research team and they'll get back to you."


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
