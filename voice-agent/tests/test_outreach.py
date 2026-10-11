"""Practice outreach: a doctor accepts a trial, Ava calls their pre-screened patients."""

from datetime import date, datetime, timedelta
from unittest.mock import PropertyMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import db, messaging, outreach, prescreen, service, simulate_practice, sms, voice
from app.main import app
from app.models import Call, InboxMessage, Lead, LeadStatus
from app.prompt import practice_first_message, practice_system_prompt

TOOL = {"X-Tool-Secret": "test-secret"}
READ = {"X-API-Key": "test-read"}
PRACTICE, TRIAL = "middlesex", "NCT07685808"


@pytest.fixture
def s():
    db.init_engine("sqlite://")
    sms.set_sms(sms.MockSms())
    voice.set_voice(voice.MockVoice())
    with patch("app.outreach.fast_forward", return_value=60), db.session_scope() as session:
        yield session


def accept(s, doctor="Dr. Rivera"):
    return outreach.accept_trial(s, PRACTICE, TRIAL, doctor)


def leads(s, status=None):
    q = select(Lead).where(Lead.practice_id == PRACTICE)
    return list(s.scalars(q.where(Lead.status == status) if status else q))


def first_candidate(s) -> Lead:
    return leads(s, LeadStatus.QUEUED)[0]


# ---------------------------------------------------------------- accepting a trial


def test_accept_builds_the_call_list_from_the_prescreen(s):
    counts = prescreen.counts(PRACTICE, TRIAL)
    a = accept(s)
    assert (a.candidates, a.chart_review) == (counts["candidate"], counts["chart_review"])
    assert len(leads(s, LeadStatus.QUEUED)) == counts["candidate"]
    review = leads(s, LeadStatus.CHART_REVIEW)
    assert len(review) == counts["chart_review"]
    assert all(r.next_attempt_at is None for r in review)  # never called before staff clear them
    assert a.accepted_by == "Dr. Rivera"


def test_accept_is_idempotent(s):
    assert accept(s).id == accept(s).id
    assert len(leads(s)) == sum(v for k, v in prescreen.counts(PRACTICE, TRIAL).items() if k != "not_a_match")


def test_patients_without_real_numbers_are_simulated_with_unreachable_numbers(s):
    accept(s)
    assert all(x.simulated and x.phone.startswith("+1555") for x in leads(s))


def test_demo_phones_go_to_the_first_candidates(s):
    with patch("app.config.Settings.demo_phone_list", new_callable=PropertyMock, return_value=["+12015550188"]):
        accept(s)
    real = [x for x in leads(s) if not x.simulated]
    assert [x.phone for x in real] == ["+12015550188"] and real[0].status == LeadStatus.QUEUED


def test_birth_date_and_personal_touch_stay_server_side(s):
    accept(s)
    lead = first_candidate(s)
    assert lead.birth_date and lead.personal_touch
    variables = outreach.dynamic_variables(s, lead)
    assert set(variables) == {"first_name", "lead_id", "office_name", "doctor_name", "callback_number"}
    assert lead.birth_date not in str(variables) and lead.last_name not in str(variables)
    assert variables["office_name"] == "Dr. Rivera's office"


# ---------------------------------------------------------------- the script holds no study details


def test_practice_prompt_has_no_study_or_patient_details():
    prompt = practice_system_prompt() + practice_first_message()
    for word in ("olatorepatide", "obesity", "weight", "NCT0", "dupilumab"):
        assert word.lower() not in prompt.lower()
    assert "verify_identity" in prompt


# ---------------------------------------------------------------- identity


def test_nothing_about_the_study_until_the_date_of_birth_matches(s):
    accept(s)
    lead = first_candidate(s)
    assert "verify_identity" in service.tool_get_open_slots(s, lead)
    assert "doesn't match" in service.tool_verify_identity(s, lead, "1900-01-01")
    out = service.tool_verify_identity(s, lead, lead.birth_date)
    assert out.startswith("VERIFIED") and "olatorepatide" in out and "weight_change" in out
    assert lead.identity_verified


def test_two_wrong_dates_hand_the_patient_to_staff(s):
    accept(s)
    lead = first_candidate(s)
    service.tool_verify_identity(s, lead, "1900-01-01")
    out = service.tool_verify_identity(s, lead, "1900-01-02")
    assert out.startswith("NOT VERIFIED") and "olatorepatide" not in out
    assert lead.status == LeadStatus.NEEDS_HUMAN and not lead.identity_verified


@pytest.mark.parametrize("said", ["1961-11-29", "11/29/1961", "November 29th, 1961", "november twenty ninth nineteen sixty one", "29 Nov 1961"])
def test_date_of_birth_parsing(said):
    assert outreach.parse_date_of_birth(said) == date(1961, 11, 29)


def test_verified_patient_answers_then_books(s):
    accept(s)
    lead = first_candidate(s)
    service.tool_verify_identity(s, lead, lead.birth_date)
    assert "Ask next" in service.tool_record_answer(s, lead, "weight_change", "no")
    assert "get_open_slots" in service.tool_record_answer(s, lead, "thyroid_cancer_history", "no")
    offer = service.tool_get_open_slots(s, lead)
    slot_id = int(offer.split("slot_id ")[1].split(":")[0])
    assert "Booked" in service.tool_book_visit(s, lead, slot_id)
    assert lead.status == LeadStatus.BOOKED and lead.next_attempt_at is None


def test_a_ruling_out_answer_never_mentions_eligibility(s):
    accept(s)
    lead = first_candidate(s)
    service.tool_verify_identity(s, lead, lead.birth_date)
    out = service.tool_record_answer(s, lead, "weight_change", "yes")
    assert "OFFICE WILL FOLLOW UP" in out and "qualif" not in out.lower()


# ---------------------------------------------------------------- the missed-call sequence


def _missed(s, lead, voicemail=True):
    service.dial(lead.id)
    s.expire_all()
    call = s.scalars(select(Call).where(Call.lead_id == lead.id).order_by(Call.id.desc())).first()
    service.call_ended(s, call, transcript=[], voicemail=voicemail)
    s.flush()


def test_missed_call_texts_times_without_study_details_and_retries(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    assert lead.status == LeadStatus.NO_ANSWER and lead.next_attempt_at
    text = next(e for e in lead.events if e.type == "sms_sent").detail["body"]
    assert "Dr. Rivera" in text and "Reply 1, 2, 3" in text and "STOP" in text
    for word in ("weight", "obesity", "olatorepatide", "NCT"):
        assert word.lower() not in text.lower()
    assert any(e.type == "slots_offered" for e in lead.events)


def test_three_misses_go_to_the_staff_queue(s):
    accept(s)
    lead = first_candidate(s)
    for _ in range(3):
        lead.next_attempt_at = service.utcnow()
        _missed(s, lead, voicemail=False)
    assert lead.attempts == 3 and lead.status == LeadStatus.NEEDS_HUMAN
    assert any(f["type"] == "staff_queue" for f in lead.flags) and lead.next_attempt_at is None


def test_next_attempt_is_the_next_day_at_a_different_time():
    lead = Lead(timezone="America/New_York", call_window=None)
    with patch("app.outreach.fast_forward", return_value=0):
        tue_10am = datetime(2026, 10, 13, 14, 0)  # 10:00 Eastern
        nxt = outreach.next_attempt(lead, tue_10am, outreach._local(tue_10am, "America/New_York"))
        assert nxt == datetime(2026, 10, 14, 18, 0)  # Wed 14:00 Eastern
        sat = datetime(2026, 10, 17, 14, 0)
        assert outreach.next_attempt(lead, sat).date() == date(2026, 10, 19)  # skips Sunday
        lead.call_window = "after 17:00"
        assert outreach.next_attempt(lead, tue_10am).hour == 21  # 17:00 Eastern = 21:00 UTC


def test_batches_cap_calls_in_progress(s):
    accept(s)
    with patch("app.service.get_settings") as gs:
        gs.return_value.batch_size = 3
        due = service.due_leads(s)
    assert len(due) == 3


# ---------------------------------------------------------------- text replies


def test_reply_with_a_number_books_from_the_missed_call_text(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    out = messaging.apply_reply(s, lead, "2")
    assert "You're booked" in out and lead.status == LeadStatus.BOOKED and lead.next_attempt_at is None
    assert any(f["type"] == "booked_by_text" for f in lead.flags)


def test_reply_with_a_time_moves_the_next_call(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    out = messaging.apply_reply(s, lead, "can you call me after 5pm")
    assert "after 5 PM" in out and lead.call_window == "after 17:00"


def test_stop_stops_calls_too(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    assert messaging.apply_reply(s, lead, "STOP") is None
    assert lead.status == LeadStatus.OPTED_OUT and lead.next_attempt_at is None


def test_not_interested_by_text(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    messaging.apply_reply(s, lead, "No thanks, not interested")
    assert lead.status == LeadStatus.CLOSED


def test_unclear_text_goes_to_staff(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    messaging.apply_reply(s, lead, "who is this??")
    assert lead.status == LeadStatus.NEEDS_HUMAN


def test_text_from_unknown_number_lands_in_the_inbox(s):
    assert "passed your message" in messaging.handle_inbound(s, "+12015550177", "hi I missed a call")
    assert s.scalars(select(InboxMessage)).one().from_phone == "+12015550177"


# ---------------------------------------------------------------- staff actions


def test_clearing_chart_review_queues_the_patient(s):
    accept(s)
    lead = leads(s, LeadStatus.CHART_REVIEW)[0]
    outreach.clear_chart_review(s, lead)
    assert lead.status == LeadStatus.QUEUED and lead.next_attempt_at


# ---------------------------------------------------------------- simulation


def test_simulated_calls_resolve_into_outcomes(s):
    accept(s)
    with patch("app.simulate_practice.get_settings") as gs:
        gs.return_value.simulated_call_secs = 0
        for lead_id in service.due_leads(s)[:10]:
            service.dial(lead_id)
        s.expire_all()
        assert simulate_practice.resolve_due(s) == 10
    statuses = {x.status for x in leads(s) if x.attempts}
    assert statuses <= {"booked", "closed", "needs_human", "no_answer", "not_a_fit"}
    assert all(not m["to"].startswith("+1555") for m in sms.get_sms().sent)  # nothing real sent to fake numbers


# ---------------------------------------------------------------- HTTP: dashboard API + inbound calls


@pytest.fixture
def client():
    db.init_engine("sqlite://")
    sms.set_sms(sms.MockSms())
    voice.set_voice(voice.MockVoice())
    with patch("app.main.db.init_engine"), patch("app.outreach.fast_forward", return_value=60):
        with TestClient(app) as c:
            yield c


def test_trials_accept_and_overview_api(client):
    trials = client.get(f"/practices/{PRACTICE}/trials", headers=READ).json()
    obesity = next(t for t in trials if t["nct_id"] == TRIAL)
    assert obesity["candidates"] == prescreen.counts(PRACTICE, TRIAL)["candidate"] and not obesity["accepted"]
    r = client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    assert r.status_code == 200 and r.json()["accepted_by"] == "Dr. Rivera"
    over = client.get(f"/practices/{PRACTICE}/outreach", headers=READ).json()
    assert over["totals"]["patients"] == obesity["candidates"] + obesity["chart_review"]
    assert over["practice"]["office_display"] == "Dr. Rivera's office"


def test_inbound_known_caller_gets_their_thread(client):
    client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    with db.session_scope() as s:
        lead = first_candidate(s)
        phone, lead_id = lead.phone, lead.id
    r = client.post("/webhooks/elevenlabs/inbound", json={"caller_id": phone, "call_sid": "CA1"}, headers=TOOL)
    body = r.json()
    assert body["dynamic_variables"]["lead_id"] == str(lead_id)
    assert "thanks for calling" in body["conversation_config_override"]["agent"]["first_message"].lower()
    with db.session_scope() as s:
        assert s.get(Lead, lead_id).calls[-1].direction == "inbound"


def test_inbound_unknown_caller_takes_a_message(client):
    r = client.post("/webhooks/elevenlabs/inbound", json={"caller_id": "+12015550199"}, headers=TOOL).json()
    assert r["dynamic_variables"]["lead_id"] == "0"
    assert "take_message" in r["conversation_config_override"]["agent"]["prompt"]["prompt"]
    out = client.post("/tools/take_message", json={"name": "Pat", "callback_number": "201-555-0199", "message": "call me"}, headers=TOOL)
    assert "Message taken" in out.json()["result"]
    assert client.get("/inbox", headers=READ).json()[0]["name"] == "Pat"


def test_inbound_requires_the_tool_secret(client):
    assert client.post("/webhooks/elevenlabs/inbound", json={"caller_id": "+1"}).status_code == 401


def test_call_me_after_5_during_a_call_schedules_the_next_try(s):
    accept(s)
    lead = first_candidate(s)
    service.dial(lead.id)
    s.expire_all()
    service.tool_verify_identity(s, lead, lead.birth_date)
    out = service.tool_schedule_callback(s, lead, "can you call me after 5")
    assert "after 5 PM" in out
    assert lead.status == LeadStatus.NO_ANSWER and lead.call_window == "after 17:00" and lead.next_attempt_at
    call = lead.calls[-1]
    service.call_ended(s, call, transcript=[{"role": "user", "message": "after 5 please"}])
    assert lead.status == LeadStatus.NO_ANSWER  # not "call ended before screening finished"
