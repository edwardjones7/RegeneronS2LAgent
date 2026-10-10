"""Talk to Ava in your browser (no phone or Twilio needed), against the real backend.

    uv run python scripts/browser_test.py --name Sarah

Creates a test lead, points the agent's default `lead_id` / `first_name` at it, and prints
the ElevenLabs page where you click "Test AI agent". Tools and the post-call webhook hit
this server through PUBLIC_BASE_URL, so the server and tunnel must be running.
"""

import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, service  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.models import Call, LeadStatus  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="Sarah")
    ap.add_argument("--campaign", default="olatorepatide-nct07685808")
    args = ap.parse_args()
    s = get_settings()
    if not s.elevenlabs_agent_id:
        sys.exit("Run scripts/setup_elevenlabs.py first.")

    db.init_engine()
    with db.session_scope() as session:
        lead = service.create_lead(
            session, campaign_id=args.campaign, first_name=args.name, last_name="Test",
            phone="+15550000000", consent_given=True, consent_text="Browser test", source="browser_test",
        )[0]
        lead.attempts = 1
        session.add(Call(lead_id=lead.id, attempt_no=1))
        service.set_status(session, lead, LeadStatus.CALLING, "browser test")
        lead_id = lead.id

    r = httpx.patch(
        f"https://api.elevenlabs.io/v1/convai/agents/{s.elevenlabs_agent_id}",
        headers={"xi-api-key": s.elevenlabs_api_key},
        json={"conversation_config": {"agent": {"dynamic_variables": {
            "dynamic_variable_placeholders": {"first_name": args.name, "lead_id": str(lead_id)}}}}},
        timeout=30,
    )
    r.raise_for_status()
    print(f"Test lead {lead_id} ready ({args.name}).")
    print(f"Open https://elevenlabs.io/app/agents/agents/{s.elevenlabs_agent_id} and click 'Test AI agent'.")
    print(f"Afterwards: curl -H 'X-API-Key: <READ_API_KEY>' {s.public_base_url}/leads/{lead_id}")


if __name__ == "__main__":
    main()
