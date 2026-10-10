"""Play a scripted call through the real backend, with no phone, keys or network.

    uv run python scripts/mock_call.py                # interested persona
    uv run python scripts/mock_call.py --persona all  # every persona

The lead goes through POST /leads, the "agent" turns go through the same /tools endpoints
ElevenLabs calls, and the call ends with a signed post-call webhook. Texts are printed, not sent.
Records land in the local database, so the read API shows them afterwards.
"""

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

os.environ["MOCK_MODE"] = "true"
os.environ.setdefault("ELEVENLABS_WEBHOOK_SECRET", "mock-webhook-secret")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import sms  # noqa: E402
from app.campaigns import get_campaign  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.prompt import first_message, voicemail_message  # noqa: E402

CID = "olatorepatide-nct07685808"
campaign = get_campaign(CID)
BASE_ANSWERS = [
    ("age", "I'm 61"),
    ("height", "five foot seven"),
    ("weight", "about 220 pounds"),
    ("diabetes", "No, I don't"),
    ("weight_change", "Nope, pretty steady"),
    ("bariatric_surgery", "No"),
    ("pancreas_gallbladder", "No"),
    ("thyroid_cancer_history", "Not that I know of... actually I'm not sure"),
]

# Each persona: list of ("say", who, text) or ("tool", name, kwargs) steps.
PERSONAS = {
    "interested": [("say", "user", "Oh wow, that was fast. Sure."), ("say", "user", "Is it paid, by the way?"),
                   ("say", "agent", "That's a great question for the research team. I'll make sure they follow up with you."),
                   ("answers", BASE_ANSWERS), ("book", None)],
    "not_a_fit": [("say", "user", "Yeah, go ahead."),
                  ("answers", BASE_ANSWERS[:3] + [("diabetes", "Yes, type 2, for about five years")])],
    "chest_pain": [("say", "user", "Sure."), ("answers", BASE_ANSWERS[:1]),
                   ("say", "user", "Sorry, I actually have this crushing chest pain right now."),
                   ("say", "agent", "That sounds like it could be serious. Please hang up and call 9 1 1 right now."),
                   ("tool", "flag_emergency", {"what_they_said": "crushing chest pain right now"})],
    "opt_out": [("say", "user", "How did you get this number? Stop calling me."),
                ("say", "agent", "I'm so sorry for the bother. I'll make sure you're not called again."),
                ("tool", "opt_out", {"reason": "asked not to be called again"})],
    "wants_human": [("say", "user", "Can I just talk to a real person?"),
                    ("tool", "escalate_to_human", {"reason": "requested a person"}),
                    ("say", "agent", "Of course, let me connect you with Jordan from the research team.")],
    "medical_question": [("say", "user", "Sure. Should I stop my Ozempic to do this?"),
                         ("say", "agent", "I can't give medical advice, but I'll make sure the research team follows up on that."),
                         ("tool", "escalate_to_human", {"reason": "medical question: should I stop my Ozempic?"}),
                         ("answers", BASE_ANSWERS), ("book", None)],
    "voicemail": [("voicemail", None)],
}


def say(who, text):
    tag = "\033[36mAVA \033[0m" if who == "agent" else "\033[33mLEAD\033[0m"
    print(f"  {tag}  {text}")


def note(text):
    print(f"  \033[90m  ↳ {text}\033[0m")


def run(persona: str, client: TestClient, phone: str):
    s = get_settings()
    tool_h = {"X-Tool-Secret": s.tool_secret}
    print(f"\n\033[1m=== Persona: {persona} ===\033[0m")
    r = client.post("/leads", json={"campaign_id": CID, "first_name": "Sarah", "last_name": "Miller", "phone": phone,
                                    "consent_given": True, "consent_text": "Demo consent (mock call)", "source": "mock"})
    r.raise_for_status()
    lead_id = r.json()["lead_id"]
    note(f"lead {lead_id} created, status: {r.json()['status']} (phone would ring now)")
    transcript = []

    def agent(text):
        say("agent", text)
        transcript.append({"role": "agent", "message": text, "time_in_call_secs": len(transcript) * 5})

    def user(text):
        say("user", text)
        transcript.append({"role": "user", "message": text, "time_in_call_secs": len(transcript) * 5})

    def tool(name, **kw):
        res = client.post(f"/tools/{name}", json={"lead_id": str(lead_id), **kw}, headers=tool_h).json()["result"]
        note(f"{name}({', '.join(f'{k}={v!r}' for k, v in kw.items())}) → {res}")
        return res

    voicemail = False
    steps = PERSONAS[persona]
    if steps[0][0] != "voicemail":
        agent(first_message(campaign).replace("{{first_name}}", "Sarah"))
    for kind, a, *rest in steps:
        if kind == "say":
            (agent if a == "agent" else user)(rest[0])
        elif kind == "tool":
            tool(a, **rest[0])
        elif kind == "voicemail":
            voicemail = True
            agent(voicemail_message(campaign))
        elif kind == "answers":
            agent(f"In short, {campaign.one_liner[0].lower()}{campaign.one_liner[1:]} I have a few quick questions.")
            q_text = {q.id: q.ask for q in campaign.prescreen_questions}
            for qid, ans in a:
                agent(q_text[qid])
                user(ans)
                res = tool("record_answer", question_id=qid, answer=ans)
                if "Screening complete" in res:
                    if "NOT A FIT" in res:
                        agent("Thank you so much for your time. This particular study may not be the right match, but "
                              "the team will keep your information on file.")
                    break
        elif kind == "book":
            res = tool("get_open_slots")
            first = res.split("slot_id ")[1]
            slot_id, label = first.split(":", 1)
            label = label.split(";")[0].rstrip(".").strip()
            agent(f"You sound like a great person for the research team to meet. I have {label}. Does that work?")
            user("Yes, that works.")
            tool("book_visit", slot_id=int(slot_id))
            agent(f"You're all set for {label}. You'll get a text confirmation, and the research team will confirm "
                  "whether the study is a good fit at your visit.")

    # Post-call webhook, signed like ElevenLabs does.
    detail = client.get(f"/leads/{lead_id}", headers={"X-API-Key": s.read_api_key}).json()
    conv_id = detail["calls"][-1]["conversation_id"]
    body = {"type": "post_call_transcription", "event_timestamp": int(time.time()), "data": {
        "conversation_id": conv_id, "transcript": transcript, "has_audio": False,
        "metadata": {"call_duration_secs": len(transcript) * 5, "phone_call": {"call_result": "voicemail" if voicemail else "answered"}},
        "analysis": {"transcript_summary": f"Mock call, persona '{persona}'."},
        "conversation_initiation_client_data": {"dynamic_variables": {"lead_id": str(lead_id)}}}}
    raw = json.dumps(body).encode()
    ts = int(time.time())
    sig = hmac.new(s.elevenlabs_webhook_secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    client.post("/webhooks/elevenlabs", content=raw, headers={"ElevenLabs-Signature": f"t={ts},v0={sig}", "Content-Type": "application/json"})

    detail = client.get(f"/leads/{lead_id}", headers={"X-API-Key": s.read_api_key}).json()
    print(f"\n  \033[1mFinal status:\033[0m {detail['status']}  {detail['status_reason']}")
    if detail["flags"]:
        print("  Flags: " + "; ".join(f"{f['type']}: {f['detail']}" for f in detail["flags"]))
    if detail["visit"]:
        print(f"  Visit: {detail['visit']['starts_at_local']} (local)")
    if detail["next_attempt_at"]:
        print(f"  Retry at: {detail['next_attempt_at']}")
    return lead_id


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", default="interested", choices=[*PERSONAS, "all"])
    args = ap.parse_args()
    personas = list(PERSONAS) if args.persona == "all" else [args.persona]
    # Mock calls ignore calling hours so the demo works any time of day.
    with patch("app.hours.can_call_now", return_value=True), TestClient(app) as client:
        for i, p in enumerate(personas):
            sent_before = len(sms.get_sms().sent)
            run(p, client, phone=f"+1555010{1000 + i + int(time.time()) % 8000:04d}")
            texts = sms.get_sms().sent[sent_before:]
            for m in texts:
                print(f"  \033[32mTEXT → {m['to']}\033[0m  {m['body']}")
            if not texts:
                print("  (no texts sent)")


if __name__ == "__main__":
    main()
