"""End-to-end flows through the HTTP API with mock voice + mock SMS."""

import hashlib
import hmac
import json
import time
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import db, sms, voice
from app.campaigns import get_campaign
from app.main import app
from app.models import Lead, LeadStatus, Suppression

TOOL = {"X-Tool-Secret": "test-secret"}
READ = {"X-API-Key": "test-read"}
CID = "olatorepatide-nct07685808"
COORD = get_campaign(CID).coordinator_phone
IN_HOURS = datetime(2026, 10, 14, 18, 0)  # 2 PM Eastern


@pytest.fixture
def client():
    db.init_engine("sqlite://")
    sms.set_sms(sms.MockSms())
    voice.set_voice(voice.MockVoice())
    with patch("app.main.db.init_engine"), patch("app.service.utcnow", return_value=IN_HOURS):
        with TestClient(app) as c:
            yield c


def new_lead(client, phone="+15550001111", **kw):
    body = {"campaign_id": CID, "first_name": "Sarah", "last_name": "Miller", "phone": phone, "consent_given": True,
            "consent_text": "I agree to be called", **kw}
    return client.post("/leads", json=body)


def tool(client, name, lead_id, **kw):
    r = client.post(f"/tools/{name}", json={"lead_id": str(lead_id), **kw}, headers=TOOL)
    assert r.status_code == 200, r.text
    return r.json()["result"]


def answer_all(client, lead_id, **overrides):
    answers = {"age": "61", "height": "5 foot 7", "weight": "220 pounds", "diabetes": "no", "weight_change": "no",
               "bariatric_surgery": "no", "pancreas_gallbladder": "no", "thyroid_cancer_history": "no", **overrides}
    last = None
    for qid, a in answers.items():
        last = tool(client, "record_answer", lead_id, question_id=qid, answer=a)
        if "Screening complete" in last:
            break
    return last


def detail(client, lead_id):
    return client.get(f"/leads/{lead_id}", headers=READ).json()


def test_lead_triggers_call_immediately(client):
    r = new_lead(client)
    assert r.status_code == 201
    assert r.json()["status"] == "calling"
    assert len(voice.get_voice().calls) == 1
    d = detail(client, r.json()["lead_id"])
    assert d["status"] == "calling"
    assert d["seconds_to_first_call"] == 0
    assert [e["type"] for e in d["events"]][:3] == ["lead_received", "status", "call_started"]


def test_no_consent_rejected(client):
    r = new_lead(client, consent_given=False)
    assert r.status_code == 400
    assert voice.get_voice().calls == []


def test_suppressed_number_never_called(client):
    with db.session_scope() as s:
        s.add(Suppression(phone="+15550001111", reason="test"))
    r = new_lead(client, phone="(555) 000-1111")
    assert r.json()["status"] == "opted_out"
    assert voice.get_voice().calls == []


def test_outside_hours_is_queued(client):
    with patch("app.service.utcnow", return_value=datetime(2026, 10, 15, 3, 0)):  # 11 PM Eastern
        r = new_lead(client)
    assert r.json()["status"] == "queued"
    assert voice.get_voice().calls == []


def test_happy_path_books_and_texts_both(client):
    lead_id = new_lead(client).json()["lead_id"]
    first = tool(client, "record_answer", lead_id, question_id="age", answer="61")
    assert 'question_id: "height"' in first
    assert "LOOKS LIKE A FIT" in answer_all(client, lead_id)
    slots_text = tool(client, "get_open_slots", lead_id)
    slot_id = int(slots_text.split("slot_id ")[1].split(":")[0])
    booked = tool(client, "book_visit", lead_id, slot_id=slot_id)
    assert booked.startswith("Booked for")
    sent = sms.get_sms().sent
    assert [m["to"] for m in sent] == ["+15550001111", COORD]
    assert "you're booked" in sent[0]["body"] and "Reply STOP" in sent[0]["body"]
    assert "New visit booked: Sarah M." in sent[1]["body"] and "8/8 answered" in sent[1]["body"]
    d = detail(client, lead_id)
    assert d["status"] == "booked"
    assert d["visit"]["slot_id"] == slot_id
    assert d["screening"]["bmi"] == pytest.approx(34.5, abs=0.1)
    # Booking twice is a no-op, no extra texts.
    assert "Already booked" in tool(client, "book_visit", lead_id, slot_id=slot_id)
    assert len(sms.get_sms().sent) == 2


def test_slots_refused_before_screening_done(client):
    lead_id = new_lead(client).json()["lead_id"]
    assert tool(client, "get_open_slots", lead_id).startswith("Not yet")
    assert tool(client, "book_visit", lead_id, slot_id=1).startswith("Can't book")
    assert sms.get_sms().sent == []


def test_not_a_fit_no_texts(client):
    lead_id = new_lead(client).json()["lead_id"]
    assert "NOT A FIT" in answer_all(client, lead_id, diabetes="yes, type 2")
    assert detail(client, lead_id)["status"] == "not_a_fit"
    assert tool(client, "get_open_slots", lead_id).startswith("Not available")
    assert sms.get_sms().sent == []


def test_opt_out_blocks_future_calls(client):
    lead_id = new_lead(client).json()["lead_id"]
    tool(client, "opt_out", lead_id, reason="asked not to be called")
    assert detail(client, lead_id)["status"] == "opted_out"
    r = new_lead(client)
    assert r.json()["status"] == "opted_out"
    assert len(voice.get_voice().calls) == 1
    assert sms.get_sms().sent == []


def test_emergency_alerts_coordinator_only(client):
    lead_id = new_lead(client).json()["lead_id"]
    tool(client, "record_answer", lead_id, question_id="age", answer="61")
    tool(client, "flag_emergency", lead_id, what_they_said="I'm having chest pain right now")
    assert detail(client, lead_id)["status"] == "emergency"
    sent = sms.get_sms().sent
    assert len(sent) == 1 and sent[0]["to"] == COORD and "URGENT" in sent[0]["body"]
    # Nothing downgrades an emergency.
    tool(client, "escalate_to_human", lead_id, reason="requested a person")
    assert detail(client, lead_id)["status"] == "emergency"


def test_medical_question_then_booking_ends_booked_with_flag(client):
    lead_id = new_lead(client).json()["lead_id"]
    tool(client, "escalate_to_human", lead_id, reason="medical question: should I stop my Ozempic?")
    assert detail(client, lead_id)["status"] == "needs_human"
    answer_all(client, lead_id)
    slots_text = tool(client, "get_open_slots", lead_id)
    tool(client, "book_visit", lead_id, slot_id=int(slots_text.split("slot_id ")[1].split(":")[0]))
    d = detail(client, lead_id)
    assert d["status"] == "booked"
    assert any("Ozempic" in f["detail"] for f in d["flags"])


def test_bad_tool_secret(client):
    lead_id = new_lead(client).json()["lead_id"]
    r = client.post("/tools/record_answer", json={"lead_id": str(lead_id), "question_id": "age", "answer": "61"},
                    headers={"X-Tool-Secret": "nope"})
    assert r.status_code == 401


def test_read_api_needs_key(client):
    assert client.get("/campaigns/" + CID).status_code == 401
    lead_id = new_lead(client).json()["lead_id"]
    overview = client.get("/campaigns/" + CID, headers=READ).json()
    assert overview["total_leads"] == 1 and overview["median_seconds_to_first_call"] == 0
    assert client.get(f"/leads/{lead_id}?key=test-read").status_code == 200


# ------------------------------------------------------------- webhooks


def signed(body: dict, secret="whsec-test", ts=None):
    raw = json.dumps(body).encode()
    ts = ts or int(time.time())
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, {"ElevenLabs-Signature": f"t={ts},v0={mac}", "Content-Type": "application/json"}


def conv_id(client, lead_id):
    return detail(client, lead_id)["calls"][-1]["conversation_id"]


def transcript_event(cid, lead_id, user_spoke=True, call_result="answered"):
    t = [{"role": "agent", "message": "Hi Sarah, this is Ava...", "time_in_call_secs": 0}]
    if user_spoke:
        t.append({"role": "user", "message": "Sure, go ahead", "time_in_call_secs": 6})
    return {"type": "post_call_transcription", "event_timestamp": int(time.time()), "data": {
        "conversation_id": cid, "transcript": t, "has_audio": True,
        "metadata": {"call_duration_secs": 95, "phone_call": {"call_result": call_result}},
        "analysis": {"transcript_summary": "Sarah was interested."},
        "conversation_initiation_client_data": {"dynamic_variables": {"lead_id": str(lead_id)}}}}


def test_webhook_rejects_bad_signature(client):
    raw, headers = signed({"type": "x", "data": {}}, secret="wrong")
    assert client.post("/webhooks/elevenlabs", content=raw, headers=headers).status_code == 401
    raw, headers = signed({"type": "x", "data": {}}, ts=int(time.time()) - 3600)
    assert client.post("/webhooks/elevenlabs", content=raw, headers=headers).status_code == 401


def test_webhook_stores_transcript_after_booking(client):
    lead_id = new_lead(client).json()["lead_id"]
    answer_all(client, lead_id)
    s = tool(client, "get_open_slots", lead_id)
    tool(client, "book_visit", lead_id, slot_id=int(s.split("slot_id ")[1].split(":")[0]))
    raw, headers = signed(transcript_event(conv_id(client, lead_id), lead_id))
    assert client.post("/webhooks/elevenlabs", content=raw, headers=headers).status_code == 200
    d = detail(client, lead_id)
    assert d["status"] == "booked"
    assert d["calls"][0]["summary"] == "Sarah was interested."
    assert d["calls"][0]["duration_secs"] == 95
    assert len(sms.get_sms().sent) == 2  # webhook never texts the patient
    # duplicate delivery is a no-op
    assert client.post("/webhooks/elevenlabs", content=raw, headers=headers).status_code == 200


def test_voicemail_schedules_retry(client):
    lead_id = new_lead(client).json()["lead_id"]
    raw, headers = signed(transcript_event(conv_id(client, lead_id), lead_id, user_spoke=False, call_result="voicemail"))
    client.post("/webhooks/elevenlabs", content=raw, headers=headers)
    d = detail(client, lead_id)
    assert d["status"] == "no_answer"
    assert d["next_attempt_at"] == "2026-10-14T20:00:00Z"


def test_hangup_mid_screen_needs_human(client):
    lead_id = new_lead(client).json()["lead_id"]
    tool(client, "record_answer", lead_id, question_id="age", answer="61")
    raw, headers = signed(transcript_event(conv_id(client, lead_id), lead_id))
    client.post("/webhooks/elevenlabs", content=raw, headers=headers)
    assert detail(client, lead_id)["status"] == "needs_human"


def test_failed_dial_retries_then_closes(client):
    from app.main import worker_tick

    lead_id = new_lead(client).json()["lead_id"]
    for attempt in range(1, 4):
        body = {"type": "call_initiation_failure", "data": {"conversation_id": conv_id(client, lead_id), "failure_reason": "no-answer",
                "conversation_initiation_client_data": {"dynamic_variables": {"lead_id": str(lead_id)}}}}
        raw, headers = signed(body)
        client.post("/webhooks/elevenlabs", content=raw, headers=headers)
        d = detail(client, lead_id)
        if attempt < 3:
            assert d["status"] == "no_answer"
            due = datetime.fromisoformat(d["next_attempt_at"].rstrip("Z"))
            with patch("app.service.utcnow", return_value=due):
                assert worker_tick() == 1
        else:
            assert d["status"] == "closed"
    assert len(voice.get_voice().calls) == 3


def test_stale_call_goes_to_a_human_not_a_redial(client):
    from app.main import worker_tick

    lead_id = new_lead(client).json()["lead_id"]
    with patch("app.service.utcnow", return_value=datetime(2026, 10, 14, 18, 45)):
        assert worker_tick() == 0
    d = detail(client, lead_id)
    assert d["status"] == "needs_human"
    assert len(voice.get_voice().calls) == 1


def test_repeated_escalation_flags_once(client):
    lead_id = new_lead(client).json()["lead_id"]
    tool(client, "escalate_to_human", lead_id, reason="requested a person")
    tool(client, "escalate_to_human", lead_id, reason="requested a person")
    assert len(detail(client, lead_id)["flags"]) == 1
