from datetime import date, datetime

from app.hours import can_call_now, clamp_to_window, retry_at
from app.slots import book, open_slots, seed_slots, short, spoken

# Campaign timezone is America/New_York (EDT = UTC-4 in October), hours 09:00-20:00.


def test_can_call_inside_window(campaign):
    assert can_call_now(None, campaign, datetime(2026, 10, 14, 18, 0))  # 2 PM EDT
    assert not can_call_now(None, campaign, datetime(2026, 10, 14, 12, 59))  # 8:59 AM
    assert can_call_now(None, campaign, datetime(2026, 10, 14, 13, 0))  # 9:00 AM
    assert not can_call_now(None, campaign, datetime(2026, 10, 15, 0, 0))  # 8:00 PM


def test_lead_timezone_overrides_campaign(campaign):
    # 7 PM Eastern is 4 PM Pacific: both fine. 10 PM Eastern = 7 PM Pacific: only Pacific lead callable.
    t = datetime(2026, 10, 15, 2, 0)
    assert not can_call_now(None, campaign, t)
    assert can_call_now("America/Los_Angeles", campaign, t)


def test_bad_timezone_falls_back_to_campaign(campaign):
    assert can_call_now("Not/AZone", campaign, datetime(2026, 10, 14, 18, 0))


def test_clamp_late_night_moves_to_next_morning(campaign):
    # 11 PM EDT -> next day 9 AM EDT = 13:00 UTC
    assert clamp_to_window(None, campaign, datetime(2026, 10, 15, 3, 0)) == datetime(2026, 10, 15, 13, 0)


def test_clamp_early_morning_moves_to_9am(campaign):
    assert clamp_to_window(None, campaign, datetime(2026, 10, 14, 10, 0)) == datetime(2026, 10, 14, 13, 0)


def test_retry_two_hours_later(campaign):
    assert retry_at(1, None, campaign, datetime(2026, 10, 14, 18, 0)) == datetime(2026, 10, 14, 20, 0)


def test_retry_late_rolls_to_morning(campaign):
    # 7 PM EDT + 2h = 9 PM -> next 9 AM
    assert retry_at(1, None, campaign, datetime(2026, 10, 14, 23, 0)) == datetime(2026, 10, 15, 13, 0)


def test_second_retry_next_day_mid_morning(campaign):
    assert retry_at(2, None, campaign, datetime(2026, 10, 14, 18, 0)) == datetime(2026, 10, 15, 14, 30)


def test_slots_seed_open_and_book(session, campaign):
    from app.models import Lead

    lead = Lead(campaign_id=campaign.id, first_name="A", phone="+15550000000")
    session.add(lead)
    session.flush()
    assert seed_slots(session, campaign, start=date(2030, 1, 7)) == 20  # Mon
    assert seed_slots(session, campaign) == 0  # already has open slots
    slots = open_slots(session, campaign, n=3, after=datetime(2030, 1, 1))
    assert len(slots) == 3
    assert slots[0].starts_at == datetime(2030, 1, 7, 9, 30)
    assert book(session, slots[0].id, lead.id)
    assert not book(session, slots[0].id, lead.id)  # no double booking
    assert open_slots(session, campaign, n=1, after=datetime(2030, 1, 1))[0].id != slots[0].id


def test_spoken_and_short():
    dt = datetime(2026, 10, 16, 10, 0)
    assert spoken(dt) == "Friday, October 16th at 10 AM"
    assert short(dt) == "Fri Oct 16, 10:00 AM"
    assert spoken(datetime(2026, 10, 22, 14, 30)) == "Thursday, October 22nd at 2:30 PM"
