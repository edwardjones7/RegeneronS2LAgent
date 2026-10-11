"""Starting outbound calls. All ElevenLabs call-time API usage lives here.

See docs/notes/elevenlabs-api.md for the request shapes.
"""

import logging

import httpx

from app.campaigns import Campaign
from app.config import get_settings

log = logging.getLogger("voice")

ELEVENLABS_API = "https://api.elevenlabs.io"


class VoiceError(RuntimeError):
    pass


def campaign_override(campaign: Campaign) -> dict:
    from app.prompt import first_message, system_prompt

    return {"agent": {"first_message": first_message(campaign), "prompt": {"prompt": system_prompt(campaign)}}}


def practice_override(inbound: bool = False, known_caller: bool = True) -> dict:
    """Practice outreach: no study or patient details beyond the dynamic variables (see prompt.py)."""
    from app.prompt import practice_first_message, practice_system_prompt, unknown_caller_system_prompt

    prompt = practice_system_prompt(inbound) if known_caller else unknown_caller_system_prompt()
    return {"agent": {"first_message": practice_first_message(inbound, known_caller), "prompt": {"prompt": prompt}}}


class MockVoice:
    """Pretends to dial. `scripts/mock_call.py` then plays the conversation through the tool endpoints."""

    def __init__(self):
        self.calls: list[dict] = []

    def start_call(self, *, lead_id: int, first_name: str, phone: str, campaign: Campaign, context: dict | None = None) -> dict:
        n = len(self.calls) + 1
        result = {"conversation_id": f"conv_mock_{lead_id}_{n}", "call_sid": f"CA_mock_{n}"}
        self.calls.append({"lead_id": lead_id, "phone": phone, **result})
        log.warning("[mock voice] would call %s (%s) for lead %s", phone, first_name, lead_id)
        return result


class ElevenLabsVoice:
    def __init__(self):
        s = get_settings()
        if not (s.elevenlabs_api_key and s.elevenlabs_agent_id and s.elevenlabs_phone_number_id):
            raise VoiceError("ElevenLabs is not set up; run scripts/setup_elevenlabs.py (or set MOCK_MODE=true)")
        self.settings = s
        self.http = httpx.Client(base_url=ELEVENLABS_API, headers={"xi-api-key": s.elevenlabs_api_key}, timeout=20)

    def start_call(self, *, lead_id: int, first_name: str, phone: str, campaign: Campaign, context: dict | None = None) -> dict:
        # Practice outreach passes its own variables (office, doctor, callback number) and the
        # privacy-first script; the ad opt-in flow carries its campaign's script.
        variables = context or {
            "first_name": first_name, "lead_id": str(lead_id),
            "office_name": campaign.team_name, "doctor_name": "", "callback_number": campaign.clinic_phone,
        }
        body = {
            "agent_id": self.settings.elevenlabs_agent_id,
            "agent_phone_number_id": self.settings.elevenlabs_phone_number_id,
            "to_number": phone,
            "conversation_initiation_client_data": {
                "dynamic_variables": variables,
                "user_id": f"lead-{lead_id}",
                # One agent serves every study: each call carries its own script.
                "conversation_config_override": practice_override() if context else campaign_override(campaign),
            },
            "telephony_call_config": {"ringing_timeout_secs": 30},
        }
        r = self.http.post("/v1/convai/twilio/outbound-call", json=body)
        if r.status_code >= 300:
            raise VoiceError(f"outbound-call HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        if not data.get("success", True):
            raise VoiceError(f"outbound-call refused: {data.get('message')}")
        return {"conversation_id": data.get("conversation_id"), "call_sid": data.get("callSid")}

    def fetch_conversation(self, conversation_id: str) -> dict:
        r = self.http.get(f"/v1/convai/conversations/{conversation_id}")
        r.raise_for_status()
        return r.json()

    def fetch_audio(self, conversation_id: str) -> bytes:
        r = self.http.get(f"/v1/convai/conversations/{conversation_id}/audio")
        r.raise_for_status()
        return r.content


_client = None


def get_voice():
    global _client
    if _client is None:
        _client = MockVoice() if get_settings().mock_mode else ElevenLabsVoice()
    return _client


def set_voice(client) -> None:
    global _client
    _client = client
