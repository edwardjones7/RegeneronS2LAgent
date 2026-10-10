"""Calling-hours and retry timing. All checks happen in the lead's local time."""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.campaigns import Campaign


def _hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def lead_zone(lead_tz: str | None, campaign: Campaign) -> ZoneInfo:
    try:
        return ZoneInfo(lead_tz) if lead_tz else ZoneInfo(campaign.timezone)
    except Exception:
        return ZoneInfo(campaign.timezone)


def _as_utc(now: datetime) -> datetime:
    return now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)


def can_call_now(lead_tz: str | None, campaign: Campaign, now: datetime) -> bool:
    local = _as_utc(now).astimezone(lead_zone(lead_tz, campaign))
    start, end = _hhmm(campaign.calling_hours.start), _hhmm(campaign.calling_hours.end)
    return start <= local.time() < end


def clamp_to_window(lead_tz: str | None, campaign: Campaign, when: datetime) -> datetime:
    """Earliest moment >= `when` inside calling hours. Returns naive UTC."""
    zone = lead_zone(lead_tz, campaign)
    local = _as_utc(when).astimezone(zone)
    start, end = _hhmm(campaign.calling_hours.start), _hhmm(campaign.calling_hours.end)
    if local.time() < start:
        local = local.replace(hour=start.hour, minute=start.minute, second=0, microsecond=0)
    elif local.time() >= end:
        nxt = local.date() + timedelta(days=1)
        local = datetime.combine(nxt, start, tzinfo=zone)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def retry_at(attempt_just_made: int, lead_tz: str | None, campaign: Campaign, now: datetime) -> datetime:
    """When to try again after an unanswered call. Attempt 2 ~2h later; attempt 3 next morning."""
    if attempt_just_made <= 1:
        return clamp_to_window(lead_tz, campaign, _as_utc(now) + timedelta(hours=2))
    zone = lead_zone(lead_tz, campaign)
    local_next_day = (_as_utc(now).astimezone(zone) + timedelta(days=1)).replace(
        hour=10, minute=30, second=0, microsecond=0
    )
    return clamp_to_window(lead_tz, campaign, local_next_day)
