"""Practice outreach without a phone: a typed conversation with the live agent and its real tools.

Costs only the language model's time (no voice, no phone line), so use it for routine checks and
save real calls for the voice and the texts. Plays one patient from an accepted trial:
confirms their name and birthday, says yes, picks the first time offered.

Run against the same database as the running caller (its tools must reach this data):
    DATABASE_URL=sqlite:///$PWD/outreach-live.db uv run python scripts/practice_text_call.py [lead_id]
"""

import asyncio
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
import websockets  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import db, outreach, service  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.models import Call, Lead, LeadStatus  # noqa: E402
from app.voice import practice_override  # noqa: E402

QUIET_SECS = 4


def pick_lead(lead_id: int | None) -> int:
    with db.session_scope() as s:
        if lead_id:
            return lead_id
        lead = s.scalars(
            select(Lead).where(Lead.practice_id.is_not(None), Lead.status.in_([LeadStatus.QUEUED, LeadStatus.NO_ANSWER]))
            .order_by(Lead.id)
        ).first()
        if lead is None:
            sys.exit("No queued practice patient. Accept a trial first.")
        return lead.id


def start(lead_id: int) -> tuple[dict, list[str]]:
    with db.session_scope() as s:
        lead = s.get(Lead, lead_id)
        lead.attempts += 1
        lead.next_attempt_at = None
        s.add(Call(lead_id=lead.id, attempt_no=lead.attempts, direction="outbound"))
        service.set_status(s, lead, LeadStatus.CALLING, "text-mode test")
        variables = outreach.dynamic_variables(s, lead)
        born = date.fromisoformat(lead.birth_date).strftime("%B %-d, %Y")
        lines = [f"Yes, this is {lead.first_name}.", born, "Sure, I'd like to come in.", "The first one works.", "No, that's all. Thanks!"]
        return variables, lines


async def converse(lead_id: int) -> None:
    s = get_settings()
    variables, lines = start(lead_id)
    url = httpx.get(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        params={"agent_id": s.elevenlabs_agent_id}, headers={"xi-api-key": s.elevenlabs_api_key}, timeout=20,
    ).json()["signed_url"]
    async with websockets.connect(url, max_size=2**22) as ws:
        await ws.send(json.dumps({
            "type": "conversation_initiation_client_data",
            "conversation_config_override": {"conversation": {"text_only": True}, **practice_override()},
            "dynamic_variables": variables,
        }))
        loop = asyncio.get_running_loop()
        last, deadline = loop.time(), loop.time() + 240
        while loop.time() < deadline:
            if loop.time() - last >= QUIET_SECS:
                if not lines:
                    break
                line = lines.pop(0)
                print(f"  patient: {line}")
                await ws.send(json.dumps({"type": "user_message", "text": line}))
                last = loop.time()
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=0.5))
            except asyncio.TimeoutError:
                continue
            except websockets.ConnectionClosed:
                break
            t = msg.get("type")
            if t == "ping":
                await ws.send(json.dumps({"type": "pong", "event_id": msg["ping_event"]["event_id"]}))
            elif t == "conversation_initiation_metadata":
                conv = msg["conversation_initiation_metadata_event"]["conversation_id"]
                with db.session_scope() as sess:
                    sess.get(Lead, lead_id).calls[-1].provider_conversation_id = conv
            elif t == "agent_response":
                last = loop.time()
                print(f"  Ava:     {msg['agent_response_event']['agent_response']}")
            elif t == "agent_tool_response":
                last = loop.time()
                name = msg.get("agent_tool_response", {}).get("tool_name")
                print(f"  [tool]   {name}")
                if name == "end_call":
                    break
    await asyncio.sleep(1.5)
    with db.session_scope() as sess:
        lead = sess.get(Lead, lead_id)
        if lead.calls[-1].ended_at is None:
            service.call_ended(sess, lead.calls[-1], transcript=[], summary="Text-mode practice test.")
        print(f"\nResult: {lead.first_name} {lead.last_name} is {lead.status} ({lead.status_reason})")


if __name__ == "__main__":
    asyncio.run(converse(pick_lead(int(sys.argv[1]) if len(sys.argv) > 1 else None)))
