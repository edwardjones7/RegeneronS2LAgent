"""Create or update everything ElevenLabs needs. Safe to re-run (do so whenever PUBLIC_BASE_URL changes).

    uv run python scripts/setup_elevenlabs.py [--campaign olatorepatide-nct07685808]

Steps: tool secret -> server tools -> post-call webhook -> agent -> Twilio number import.
IDs are kept in .elevenlabs.json (gitignored); secrets the app needs are written to .env.
API shapes: docs/notes/elevenlabs-api.md
"""

import argparse
import json
import secrets
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.campaigns import get_campaign  # noqa: E402
from app.config import REPO, ROOT, get_settings  # noqa: E402
from app.prompt import PRACTICE_VOICEMAIL, practice_first_message, practice_system_prompt  # noqa: E402

# Keys live in the repo-root .env (shared with site/); fall back to voice-agent/.env.
STATE_FILE = (REPO if (REPO / ".env").exists() else ROOT) / ".elevenlabs.json"
ENV_FILE = REPO / ".env" if (REPO / ".env").exists() else ROOT / ".env"
DEFAULT_LLM = "claude-sonnet-5-5"
DEFAULT_VOICE = "cgSgspJ2msm6clMCkdW9"  # "Jessica": warm, conversational stock voice


def load_state() -> dict:
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def set_env(key: str, value: str) -> None:
    """Add or replace KEY=value in .env without touching other lines."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    out, found = [], False
    for line in lines:
        if line.split("=", 1)[0].strip() == key:
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(out) + "\n")


def check(r: httpx.Response, what: str) -> dict:
    if r.status_code >= 300:
        sys.exit(f"✗ {what} failed: HTTP {r.status_code} {r.text[:600]}")
    return r.json() if r.content else {}


def lead_id_param():
    return {"type": "string", "dynamic_variable": "lead_id"}


def tool_defs(base: str) -> list[dict]:
    def tool(name, description, props, required, timeout=10):
        return {
            "type": "webhook",
            "name": name,
            "description": description,
            "response_timeout_secs": timeout,
            "api_schema": {
                "url": f"{base}/tools/{name}",
                "method": "POST",
                "content_type": "application/json",
                "request_body_schema": {
                    "type": "object",
                    "description": f"{name} request",
                    "properties": {"lead_id": lead_id_param(), **props},
                    "required": ["lead_id", *required],
                },
            },
        }

    s = lambda d: {"type": "string", "description": d}  # noqa: E731
    return [
        tool(
            "record_answer",
            "Save the person's answer to a pre-screening question. Call after EVERY answer. The result says which question to ask next or that screening is complete.",
            {
                "question_id": s("The question_id of the question they just answered, exactly as given (e.g. age, height, weight, diabetes)."),
                "answer": s("Their answer in their own words. For yes/no questions START with 'yes' or 'no', e.g. 'yes, gained about 15 pounds'. For numbers include units they used, e.g. '5 foot 7', '220 pounds', '61'."),
            },
            ["question_id", "answer"],
        ),
        tool(
            "get_open_slots",
            "Get open screening-visit times. Only call after record_answer said the person LOOKS LIKE A FIT.",
            {},
            [],
        ),
        tool(
            "book_visit",
            "Book the visit time the person chose. Sends their confirmation text.",
            {"slot_id": {"type": "integer", "description": "slot_id of the time they picked, from get_open_slots."}},
            ["slot_id"],
        ),
        tool(
            "opt_out",
            "The person does not want to be contacted again. Adds them to the do-not-call list.",
            {"reason": s("Short reason, e.g. 'asked not to be called again'.")},
            [],
        ),
        tool(
            "mark_not_interested",
            "The person declined this study but did NOT ask to stop all contact. Closes the lead without adding them to the do-not-call list.",
            {"reason": s("Short reason in their words, e.g. 'not interested right now'.")},
            [],
        ),
        tool(
            "escalate_to_human",
            "Alert the research team that this person needs a human: requested a person, medical question, language, confusion, callback request, or no open slots.",
            {"reason": s("Why, e.g. 'requested a person', 'medical question: <question>', 'language: Spanish', 'callback requested: after 5pm'.")},
            ["reason"],
        ),
        tool(
            "verify_identity",
            "Check the date of birth the person gave. Call once they confirm they're the patient, BEFORE saying anything about a study or their health. Returns VERIFIED with everything you may say about the study, or what to do instead.",
            {"date_of_birth": s("The date of birth they said, as YYYY-MM-DD if you can, otherwise exactly as they said it.")},
            ["date_of_birth"],
        ),
        tool(
            "schedule_callback",
            "The person wants to be called at another time. Moves the next call.",
            {"when": s("When, in their words, e.g. 'after 5', 'tomorrow morning', 'evenings'.")},
            ["when"],
        ),
        {
            **tool(
                "take_message",
                "A caller we couldn't match to a patient. Records their name, number and message for the office staff.",
                {
                    "name": s("The caller's name."),
                    "callback_number": s("The best number to call them back."),
                    "message": s("What they're calling about, briefly."),
                    "caller_id": {"type": "string", "dynamic_variable": "caller_id"},
                },
                [],
            ),
        },
        tool(
            "flag_emergency",
            "Possible medical emergency mentioned (chest pain, trouble breathing, stroke signs, self-harm). Call right after telling them to hang up and call 911.",
            {"what_they_said": s("What the person said, briefly quoted.")},
            ["what_they_said"],
        ),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign", default="olatorepatide-nct07685808")
    args = ap.parse_args()

    settings = get_settings()
    campaign = get_campaign(args.campaign)
    if campaign is None:
        sys.exit(f"unknown campaign {args.campaign}")
    if not settings.elevenlabs_api_key:
        sys.exit("ELEVENLABS_API_KEY (or ELEVEN_LAB_API_KEY) missing from .env")
    base = settings.public_base_url.rstrip("/")
    if base.startswith("http://localhost"):
        print("! PUBLIC_BASE_URL is localhost; ElevenLabs can't reach it. Start a tunnel and set PUBLIC_BASE_URL first.")

    http = httpx.Client(base_url="https://api.elevenlabs.io", headers={"xi-api-key": settings.elevenlabs_api_key}, timeout=30)
    state = load_state()
    if state.get("agent_id") and http.get(f"/v1/convai/agents/{state['agent_id']}").status_code != 200:
        # Saved state is from another ElevenLabs account (or was deleted): start fresh.
        print("! the saved agent isn't on this API key's account; creating a new agent, tools and number import")
        state = {}

    # 1. Shared secret ElevenLabs sends on every tool call.
    tool_secret = settings.tool_secret
    if tool_secret == "dev-tool-secret" or not state.get("tool_secret_id"):
        tool_secret = secrets.token_urlsafe(24)
        set_env("TOOL_SECRET", tool_secret)
        r = check(http.post("/v1/convai/secrets", json={"type": "new", "name": f"cmm_tool_secret_{secrets.token_hex(3)}", "value": tool_secret}), "create secret")
        state["tool_secret_id"] = r["secret_id"]
        print("✓ tool secret stored")
    if settings.read_api_key == "dev-read-key":
        set_env("READ_API_KEY", secrets.token_urlsafe(18))
        print("✓ READ_API_KEY generated in .env")

    # 2. Server tools.
    tool_ids = state.setdefault("tool_ids", {})
    for cfg in tool_defs(base):
        cfg["api_schema"]["request_headers"] = {"X-Tool-Secret": {"secret_id": state["tool_secret_id"]}}
        existing = tool_ids.get(cfg["name"])
        if existing:
            r = http.patch(f"/v1/convai/tools/{existing}", json={"tool_config": cfg})
            if r.status_code < 300:
                continue
            print(f"  (re-creating {cfg['name']}: {r.status_code})")
        tool_ids[cfg["name"]] = check(http.post("/v1/convai/tools", json={"tool_config": cfg}), f"create tool {cfg['name']}")["id"]
    save_state(state)
    print(f"✓ {len(tool_ids)} tools -> {base}/tools/*")

    # 3. Post-call webhook (new one if the URL changed).
    hook_url = f"{base}/webhooks/elevenlabs"
    if state.get("webhook_url") != hook_url:
        if state.get("webhook_id"):
            http.delete(f"/v1/workspace/webhooks/{state['webhook_id']}")
            state.pop("webhook_id", None)
        r = http.post(
            "/v1/workspace/webhooks",
            json={"settings": {"auth_type": "hmac", "name": "call-me-maybe-post-call", "webhook_url": hook_url}},
        )
        if r.status_code < 300:
            r = r.json()
            state.update(webhook_id=r["webhook_id"], webhook_url=hook_url)
            if r.get("webhook_secret"):
                set_env("ELEVENLABS_WEBHOOK_SECRET", r["webhook_secret"])
            save_state(state)
            print(f"✓ webhook -> {hook_url}")
        else:
            # The server's worker polls ElevenLabs for finished calls, so this is optional.
            print(f"! couldn't create the post-call webhook (HTTP {r.status_code}); falling back to polling for call results.")
            print("  To use the webhook instead, give the API key the webhooks_write permission and re-run.")

    # 4. Agent. Its defaults are the practice-outreach script (a doctor's office calling its own
    # patients); every outbound call and every inbound callback carries its own script and details.
    coordinator = campaign.coordinator_phone
    agent_body = {
        "name": "Ava · doctor's office outreach",
        "tags": ["call-me-maybe", "practice-outreach"],
        "conversation_config": {
            "agent": {
                "first_message": practice_first_message(),
                "language": "en",
                "dynamic_variables": {"dynamic_variable_placeholders": {
                    "first_name": "there", "lead_id": "0", "office_name": "your doctor's office",
                    "doctor_name": "your doctor", "callback_number": "", "caller_id": "",
                }},
                "prompt": {
                    "prompt": practice_system_prompt(),
                    "llm": settings.elevenlabs_llm or DEFAULT_LLM,
                    "temperature": 0.3,
                    "tool_ids": list(tool_ids.values()),
                    "built_in_tools": {
                        "end_call": {"type": "system", "name": "end_call", "description": "", "params": {"system_tool_type": "end_call"}},
                        "language_detection": {
                            "type": "system",
                            "name": "language_detection",
                            "description": "",
                            "params": {"system_tool_type": "language_detection"},
                        },
                        "voicemail_detection": {
                            "type": "system",
                            "name": "voicemail_detection",
                            "description": "",
                            # No study or health details: anyone could hear a voicemail.
                            "params": {"system_tool_type": "voicemail_detection", "voicemail_message": PRACTICE_VOICEMAIL},
                        },
                        "transfer_to_number": {
                            "type": "system",
                            "name": "transfer_to_number",
                            "description": "",
                            "params": {
                                "system_tool_type": "transfer_to_number",
                                "transfers": [
                                    {
                                        "transfer_destination": {"type": "phone", "phone_number": coordinator},
                                        "condition": "The person asks to speak with a human / real person / someone from the team.",
                                        "transfer_type": "conference",
                                    }
                                ],
                                "enable_client_message": True,
                            },
                        },
                    },
                },
            },
            "tts": {"voice_id": settings.elevenlabs_voice_id or DEFAULT_VOICE, "model_id": "eleven_flash_v2"},
            # Spanish switches to the multilingual voice model; wording comes from the campaign file.
            **(
                {"language_presets": {lang: {"overrides": {"agent": {"first_message": t.first_message}}}
                                      for lang, t in campaign.translations.items()}}
                if campaign.translations else {}
            ),
            "turn": {"turn_timeout": 7, "turn_eagerness": "normal"},
            "conversation": {"max_duration_seconds": 900},
        },
        # text_only lets scripts/text_call.py test the real agent + tools without a phone.
        # Per-call overrides: each campaign's prompt/first message ride on the call (one agent, many
        # studies); text_only lets scripts/text_call.py test the real agent + tools without a phone.
        # Inbound callbacks: ElevenLabs asks /webhooks/elevenlabs/inbound who's calling before Ava answers.
        "platform_settings": {"overrides": {
            "conversation_config_override": {
                "agent": {"first_message": True, "prompt": {"prompt": True}},
                "conversation": {"text_only": True},
            },
            "enable_conversation_initiation_client_data_from_webhook": True,
        }},
    }
    if state.get("webhook_id"):
        agent_body["platform_settings"] |= {
            "workspace_overrides": {
                "webhooks": {
                    "post_call_webhook_id": state["webhook_id"],
                    "events": ["transcript", "call_initiation_failure"],
                    "transcript_format": "json",
                }
            },
        }
    agent_id = state.get("agent_id")
    if agent_id:
        check(http.patch(f"/v1/convai/agents/{agent_id}", json=agent_body), "update agent")
        print(f"✓ agent updated ({agent_id})")
    else:
        agent_id = check(http.post("/v1/convai/agents/create", json=agent_body), "create agent")["agent_id"]
        state["agent_id"] = agent_id
        save_state(state)
        print(f"✓ agent created ({agent_id})")
    set_env("ELEVENLABS_AGENT_ID", agent_id)

    # 4b. Inbound callbacks: the workspace's conversation-initiation webhook.
    r = http.patch("/v1/convai/settings", json={"conversation_initiation_client_data_webhook": {
        "url": f"{base}/webhooks/elevenlabs/inbound",
        "request_headers": {"X-Tool-Secret": tool_secret},
    }})
    print(f"{'✓' if r.status_code < 300 else '!'} inbound callbacks -> {base}/webhooks/elevenlabs/inbound"
          + ("" if r.status_code < 300 else f" (HTTP {r.status_code}: {r.text[:200]})"))

    # 5. Twilio number.
    if settings.twilio_from_number:
        if state.get("phone_number") != settings.twilio_from_number:
            r = check(
                http.post(
                    "/v1/convai/phone-numbers",
                    json={
                        "provider": "twilio",
                        "phone_number": settings.twilio_from_number,
                        "label": "Call Me Maybe outbound",
                        "sid": settings.twilio_account_sid,
                        "token": settings.twilio_auth_token,
                        "agent_id": agent_id,
                    },
                ),
                "import Twilio number",
            )
            state.update(phone_number_id=r["phone_number_id"], phone_number=settings.twilio_from_number)
            save_state(state)
            print(f"✓ Twilio number {settings.twilio_from_number} imported")
        set_env("ELEVENLABS_PHONE_NUMBER_ID", state["phone_number_id"])
        # Text replies (C / R / CANCEL / questions) come back to this server.
        nums = httpx.get(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/IncomingPhoneNumbers.json",
            params={"PhoneNumber": settings.twilio_from_number},
            auth=(settings.twilio_account_sid, settings.twilio_auth_token), timeout=20,
        ).json().get("incoming_phone_numbers", [])
        if nums:
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/IncomingPhoneNumbers/{nums[0]['sid']}.json",
                data={"SmsUrl": f"{base}/webhooks/twilio/sms", "SmsMethod": "POST"},
                auth=(settings.twilio_account_sid, settings.twilio_auth_token), timeout=20,
            )
            print(f"{'✓' if r.status_code < 300 else '!'} Twilio texts -> {base}/webhooks/twilio/sms")
    else:
        print("! TWILIO_FROM_NUMBER not set: buy a Twilio number, add it to .env, and re-run to enable real calls.")

    print("\nDone. Restart the server so it picks up the new .env values.")


if __name__ == "__main__":
    main()
