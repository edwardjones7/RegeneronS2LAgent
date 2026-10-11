"""Mock coordinator calendar. Slots are stored in the campaign's local time."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.campaigns import Campaign
from app.models import Slot

SLOT_TIMES = [time(9, 30), time(11, 0), time(14, 0), time(16, 30)]


def _at_practice(practice_id: str | None):
    """Slots belong to one practice in practice outreach; opt-in campaigns have practice_id NULL."""
    return Slot.practice_id.is_(None) if practice_id is None else Slot.practice_id == practice_id


def seed_slots(
    session: Session, campaign: Campaign, start: date | None = None, days: int = 5, practice_id: str | None = None
) -> int:
    """Create slots for the next `days` business days if the campaign (at this practice) has none open."""
    now_local = datetime.now(ZoneInfo(campaign.timezone)).replace(tzinfo=None)
    existing = session.scalars(
        select(Slot).where(
            Slot.campaign_id == campaign.id, _at_practice(practice_id),
            Slot.starts_at > now_local, Slot.booked_lead_id.is_(None),
        )
    ).first()
    if existing:
        return 0
    d = start or (now_local.date() + timedelta(days=1))
    made = 0
    while made < days * len(SLOT_TIMES):
        if d.weekday() < 5:
            for t in SLOT_TIMES:
                session.add(Slot(campaign_id=campaign.id, practice_id=practice_id, starts_at=datetime.combine(d, t)))
                made += 1
        d += timedelta(days=1)
    session.flush()
    return made


def open_slots(
    session: Session, campaign: Campaign, n: int = 3, after: datetime | None = None, practice_id: str | None = None
) -> list[Slot]:
    after = after or datetime.now(ZoneInfo(campaign.timezone)).replace(tzinfo=None) + timedelta(hours=12)
    return list(
        session.scalars(
            select(Slot)
            .where(Slot.campaign_id == campaign.id, _at_practice(practice_id), Slot.booked_lead_id.is_(None), Slot.starts_at > after)
            .order_by(Slot.starts_at)
            .limit(n)
        )
    )


def book(session: Session, slot_id: int, lead_id: int) -> bool:
    """Atomically claim a slot. False if it was already taken."""
    result = session.execute(
        update(Slot).where(Slot.id == slot_id, Slot.booked_lead_id.is_(None)).values(booked_lead_id=lead_id)
    )
    return result.rowcount == 1


def spoken(dt: datetime) -> str:
    """'Thursday, October 16th at 10 AM' — easy for the voice agent to read out."""
    day = dt.day
    suffix = "th" if 11 <= day <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    hour = dt.strftime("%I").lstrip("0")
    minutes = "" if dt.minute == 0 else f":{dt.minute:02d}"
    return f"{dt:%A}, {dt:%B} {day}{suffix} at {hour}{minutes} {dt:%p}"


def short(dt: datetime) -> str:
    """'Thu Oct 16, 10:00 AM' for texts."""
    return f"{dt:%a %b} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0')}"
