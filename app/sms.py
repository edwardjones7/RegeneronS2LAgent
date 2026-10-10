"""Text messages. The patient is only ever texted after a confirmed booking."""

import logging

from app.campaigns import Campaign
from app.config import get_settings

log = logging.getLogger("sms")


def patient_confirmation(first_name: str, when_short: str, campaign: Campaign, calendar_url: str = "") -> str:
    cal = f" Add to calendar: {calendar_url}" if calendar_url else ""
    return (
        f"Hi {first_name}, you're booked with {campaign.team_name} on {when_short}, {campaign.clinic_address}. "
        f"Reply C to confirm or R to reschedule. Questions? Call {campaign.clinic_phone}.{cal} Reply STOP to opt out."
    )


def coordinator_booked(
    first_name: str,
    last_name: str,
    when_short: str,
    campaign: Campaign,
    answered: int,
    total: int,
    flags: list[str],
    seconds_to_call: int | None,
    record_link: str,
) -> str:
    flag_text = "no flags" if not flags else "flags: " + "; ".join(flags)
    speed = f" Called {seconds_to_call}s after opt-in." if seconds_to_call is not None else ""
    last = f" {last_name[0]}." if last_name else ""
    return (
        f"New visit booked: {first_name}{last}, {when_short}, {campaign.study_short_name} study "
        f"({campaign.nct_id}). Pre-screen: {answered}/{total} answered, {flag_text}.{speed} {record_link}"
    )


def coordinator_alert(kind: str, first_name: str, last_name: str, phone: str, detail: str, record_link: str) -> str:
    headline = {
        "emergency": "URGENT: possible emergency on a screening call",
        "needs_human": "Lead needs a person",
    }.get(kind, kind)
    last = f" {last_name[0]}." if last_name else ""
    return f"{headline}: {first_name}{last} ({phone}). {detail} {record_link}"


class MockSms:
    """Keeps texts in memory and logs them. Used in mock mode and tests."""

    def __init__(self):
        self.sent: list[dict] = []

    def send(self, to: str, body: str) -> str:
        sid = f"SM_mock_{len(self.sent) + 1}"
        self.sent.append({"to": to, "body": body, "sid": sid})
        log.warning("[mock sms] to %s: %s", to, body)
        return sid


class TwilioSms:
    def __init__(self):
        from twilio.rest import Client

        s = get_settings()
        self.client = Client(s.twilio_account_sid, s.twilio_auth_token)
        self.from_number = s.twilio_from_number

    def send(self, to: str, body: str) -> str:
        msg = self.client.messages.create(to=to, from_=self.from_number, body=body)
        return msg.sid


_client = None


def get_sms():
    global _client
    if _client is None:
        _client = MockSms() if get_settings().mock_mode else TwilioSms()
    return _client


def set_sms(client) -> None:
    """Tests swap in their own client."""
    global _client
    _client = client
