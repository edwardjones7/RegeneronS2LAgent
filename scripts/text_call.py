"""Run a real text-only conversation with the live ElevenLabs agent. No phone needed.

    uv run python scripts/text_call.py --persona interested
    uv run python scripts/text_call.py --persona all

Unlike mock_call.py, this exercises the real LLM, prompt and server tools: ElevenLabs calls
our /tools endpoints through PUBLIC_BASE_URL, so the server and tunnel must be running.
The "patient" side is a fixed script of lines sent one per agent turn.
"""

import argparse
import asyncio
import json
import random
import sys
from pathlib import Path

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, service  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.models import Call, Lead, LeadStatus  # noqa: E402

QUIET_SECS = 4.0  # agent is done talking after this much silence

FIT = ["Sure, go ahead.", "I'm 58.", "Five five.", "About 210 pounds.", "No, never.", "No, it's been pretty steady.",
       "No.", "No, never had those.", "No, nobody in my family."]

PERSONAS = {
    "interested": FIT[:2] + ["Wait, would I get paid for this?"] + FIT[2:] + ["The second one works.", "Nope, that's all. Thanks!"],
    "not_a_fit": ["Yeah sure.", "I'm 45.", "Five ten.", "240.", "Yes, I have type 2 diabetes.", "Okay, thanks anyway."],
    "chest_pain": ["Sure.", "I'm 62.", "Actually hold on, I'm having really bad chest pain right now and my left arm feels numb."],
    "opt_out": ["Who is this? I never signed up for anything. Take me off your list and stop calling me."],
    "wants_human": ["Honestly, I'd rather talk to a real person. Can you connect me to someone?"],
    "medical_question": ["Sure. Quick question first though, I'm on Ozempic right now. Should I stop taking it so I can do the study?",
                         "Okay, that's fine. Go ahead with your questions."] + FIT[1:] + ["The first one.", "No, that's everything."],
    "off_script_question": ["Sure. What are the side effects of the drug? And does it work better than Wegovy?",
                            "Okay. What happens if I get the placebo?", "Alright, never mind, I'm not interested. Bye."],
}


def make_lead(name: str) -> int:
    db.init_engine()
    with db.session_scope() as s:
        lead = service.create_lead(
            s, campaign_id="olatorepatide-nct07685808", first_name=name, last_name="Text",
            # Unique number, so one persona's opt-out can't affect the next.
            phone=f"+1555{random.randint(1000000, 9999999)}",
            consent_given=True, consent_text="text-mode test", source="text_test",
        )[0]
        lead.attempts = 1
        s.add(Call(lead_id=lead.id, attempt_no=1))
        service.set_status(s, lead, LeadStatus.CALLING, "text-mode test")
        return lead.id


async def converse(persona: str, name: str = "Dana") -> dict:
    s = get_settings()
    lead_id = make_lead(name)
    url = httpx.get(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        params={"agent_id": s.elevenlabs_agent_id},
        headers={"xi-api-key": s.elevenlabs_api_key},
        timeout=20,
    ).json()["signed_url"]
    lines = list(PERSONAS[persona])
    print(f"\n\033[1m=== {persona} (lead {lead_id}) ===\033[0m")
    conv_id = None
    async with websockets.connect(url, max_size=2**22) as ws:
        await ws.send(json.dumps({
            "type": "conversation_initiation_client_data",
            "conversation_config_override": {"conversation": {"text_only": True}},
            "dynamic_variables": {"first_name": name, "lead_id": str(lead_id)},
        }))
        loop = asyncio.get_running_loop()
        last_agent = loop.time()
        deadline = loop.time() + 300
        ended = False
        while not ended and loop.time() < deadline:
            # Pings arrive every few seconds, so "quiet" means no agent activity, not no messages.
            if loop.time() - last_agent >= QUIET_SECS:
                if not lines:
                    break
                line = lines.pop(0)
                print(f"  \033[33mLEAD\033[0m  {line}")
                await ws.send(json.dumps({"type": "user_message", "text": line}))
                last_agent = loop.time()
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            except websockets.ConnectionClosed:
                break
            msg = json.loads(raw)
            t = msg.get("type")
            if t == "ping":
                await ws.send(json.dumps({"type": "pong", "event_id": msg["ping_event"]["event_id"]}))
            elif t == "conversation_initiation_metadata":
                conv_id = msg["conversation_initiation_metadata_event"]["conversation_id"]
            elif t in ("agent_response", "agent_tool_response", "agent_chat_response_part"):
                last_agent = loop.time()
            if t == "agent_response":
                print(f"  \033[36mAVA \033[0m  {msg['agent_response_event']['agent_response']}")
            elif t == "agent_tool_response":
                ev = msg.get("agent_tool_response", {})
                print(f"  \033[90m  ↳ tool {ev.get('tool_name')}{' (error)' if ev.get('is_error') else ''}\033[0m")
                if ev.get("tool_name") == "end_call":
                    ended = True
    await asyncio.sleep(1)
    with db.session_scope() as sess:
        lead = sess.get(Lead, lead_id)
        result = {"persona": persona, "lead_id": lead_id, "conversation_id": conv_id, "status": lead.status,
                  "reason": lead.status_reason, "flags": [f["detail"] for f in lead.flags],
                  "answers": [(a.question_id, a.raw_text, a.verdict) for a in lead.answers]}
        # Point the call row at the conversation so the post-call webhook / poller can attach the transcript.
        call = lead.calls[-1]
        call.provider_conversation_id = conv_id
    print(f"  \033[1mResult:\033[0m {result['status']} {result['reason']}")
    for qid, raw, verdict in result["answers"]:
        print(f"     {qid:24} {verdict:10} {raw}")
    if result["flags"]:
        print("     flags: " + "; ".join(result["flags"]))
    return result


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", default="interested", choices=[*PERSONAS, "all"])
    args = ap.parse_args()
    for p in (list(PERSONAS) if args.persona == "all" else [args.persona]):
        await converse(p)


if __name__ == "__main__":
    asyncio.run(main())
