"""Practice outreach: a doctor accepts a trial, Ava calls their pre-screened patients."""

from datetime import date, datetime, timedelta
from unittest.mock import PropertyMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import db, messaging, outreach, prescreen, service, simulate_practice, sms, voice
from app import slots as outreach_slots
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
    # Every dynamic variable any tool uses must be present, or ElevenLabs ends the call.
    assert set(variables) == {"first_name", "lead_id", "office_name", "doctor_name", "callback_number", "caller_id"}
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
    assert out.startswith("VERIFIED") and "olatorepatide" in out and "get_open_slots" in out
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


def test_verified_patient_is_booked_with_no_phone_questions(s):
    accept(s)
    lead = first_candidate(s)
    service.tool_verify_identity(s, lead, lead.birth_date)
    offer = service.tool_get_open_slots(s, lead)
    slot_id = int(offer.split("slot_id ")[1].split(":")[0])
    assert "Booked" in service.tool_book_visit(s, lead, slot_id)
    assert lead.status == LeadStatus.BOOKED and lead.next_attempt_at is None
    text = next(e for e in lead.events if e.type == "sms_sent" and e.detail.get("to") == "patient").detail["body"]
    assert "booked" in text and "Dr. Rivera" in text  # the booking confirmation


def _missed(s, lead, voicemail=True):
    service.dial(lead.id)
    s.expire_all()
    call = s.scalars(select(Call).where(Call.lead_id == lead.id).order_by(Call.id.desc())).first()
    service.call_ended(s, call, transcript=[], voicemail=voicemail)
    s.flush()


def test_missed_call_texts_a_callback_request_without_study_details_and_retries(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    assert lead.status == LeadStatus.NO_ANSWER and lead.next_attempt_at
    text = next(e for e in lead.events if e.type == "sms_sent").detail["body"]
    assert "Dr. Rivera" in text and "call back" in text and "STOP" in text
    assert "Reply 1" not in text  # no time menu: booking happens on the callback
    for word in ("weight", "obesity", "olatorepatide", "NCT"):
        assert word.lower() not in text.lower()


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


def test_call_sundays_lets_the_caller_dial_on_sunday():
    lead = Lead(timezone="America/New_York", call_window=None)
    sun_noon = datetime(2026, 10, 18, 16, 0)  # Sunday 12:00 Eastern
    with patch("app.outreach.fast_forward", return_value=0):
        assert not outreach.in_calling_hours(lead, sun_noon)
        with patch("app.outreach.get_settings") as gs:
            gs.return_value.call_sundays = True
            assert outreach.in_calling_hours(lead, sun_noon)
            sat = datetime(2026, 10, 17, 14, 0)
            assert outreach.next_attempt(lead, sat).date() == date(2026, 10, 18)  # Sunday allowed


def test_batches_cap_calls_in_progress(s):
    accept(s)
    with patch("app.service.get_settings") as gs:
        gs.return_value.batch_size = 3
        due = service.due_leads(s)
    assert len(due) == 3


# ---------------------------------------------------------------- text replies


def test_callback_after_the_text_books_on_the_phone(s):
    accept(s)
    lead = first_candidate(s)
    _missed(s, lead)
    outreach.start_inbound_call(s, lead, "CA_back")
    assert lead.status == LeadStatus.CALLING and lead.next_attempt_at is None  # pending retry cancelled
    service.tool_verify_identity(s, lead, lead.birth_date)
    slot_id = int(service.tool_get_open_slots(s, lead).split("slot_id ")[1].split(":")[0])
    assert "Booked" in service.tool_book_visit(s, lead, slot_id) and lead.status == LeadStatus.BOOKED


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


def test_patient_outreach_api_shows_one_patients_thread(client):
    client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    with db.session_scope() as s:
        lead = first_candidate(s)
        pid = lead.patient_id
    rows = client.get(f"/practices/{PRACTICE}/patients/{pid}/outreach", headers=READ).json()
    assert len(rows) == 1 and rows[0]["status"] == "queued" and rows[0]["trial_title"] == "weight management"
    assert rows[0]["test_birth_date"] is None  # simulated patients never expose it
    assert client.get(f"/practices/bergen/patients/{pid}/outreach", headers=READ).json() == []  # other practices see nothing


def test_new_slots_never_repeat_a_time(s):
    accept(s)
    from app.models import Slot

    campaign = service.campaign_for(first_candidate(s))
    for _ in range(3):  # book everything, forcing new slots each round
        for sl in slots_open(s, campaign):
            sl.booked_lead_id = first_candidate(s).id
        s.flush()
        outreach_slots.seed_slots(s, campaign, practice_id=PRACTICE)
    times = [x.starts_at for x in s.scalars(select(Slot).where(Slot.practice_id == PRACTICE))]
    assert len(times) == len(set(times))


def slots_open(s, campaign):
    return outreach_slots.open_slots(s, campaign, n=100, practice_id=PRACTICE)


def test_hanging_up_before_identity_counts_as_a_missed_call(s):
    accept(s)
    lead = first_candidate(s)
    service.dial(lead.id)
    s.expire_all()
    service.call_ended(s, lead.calls[-1], transcript=[{"role": "user", "message": "Who is this?"}])
    assert lead.status == LeadStatus.NO_ANSWER and lead.next_attempt_at
    assert any(e.type == "callback_requested" for e in lead.events)


def test_practice_scripts_ask_no_phone_questions():
    from app.campaigns import file_campaigns

    practice = [c for c in file_campaigns().values() if c.mode == "practice"]
    assert practice and all(not c.prescreen_questions for c in practice)


def test_one_calendar_per_practice_shared_by_trials(client):
    client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    cal = client.get(f"/practices/{PRACTICE}/calendar?days=14", headers=READ).json()
    times = [x["starts_at_local"] for x in cal["slots"]]
    assert times and len(times) == len(set(times))  # one cell per time, never two
    with db.session_scope() as s:
        lead = first_candidate(s)
        service.tool_verify_identity(s, lead, lead.birth_date)
        slot_id = int(service.tool_get_open_slots(s, lead).split("slot_id ")[1].split(":")[0])
        service.tool_book_visit(s, lead, slot_id)
        name = f"{lead.first_name} {lead.last_name}"
    cal = client.get(f"/practices/{PRACTICE}/calendar?days=14", headers=READ).json()
    booked = [x for x in cal["slots"] if x["booked"]]
    assert [b["booked"]["name"] for b in booked] == [name] and booked[0]["booked"]["booked_by"] == "Ava"


def test_activity_feed_speaks_plain_english(client):
    client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    with db.session_scope() as s:
        lead = first_candidate(s)
        service.tool_verify_identity(s, lead, lead.birth_date)
        slot_id = int(service.tool_get_open_slots(s, lead).split("slot_id ")[1].split(":")[0])
        service.tool_book_visit(s, lead, slot_id)
        name = f"{lead.first_name} {lead.last_name}"
    feed = client.get(f"/practices/{PRACTICE}/activity", headers=READ).json()
    assert feed["recent"][0]["text"].startswith(f"Booked {name} for ")
    assert client.get(f"/practices/bergen/activity", headers=READ).json()["recent"] == []


def test_times_offered_on_a_call_are_held_for_that_patient(s):
    accept(s)
    a, b = leads(s, LeadStatus.QUEUED)[:2]
    for x in (a, b):
        service.tool_verify_identity(s, x, x.birth_date)
    offered = service.tool_get_open_slots(s, a)
    first_id = int(offered.split("slot_id ")[1].split(":")[0])
    # Someone else (another call, or a simulated patient) can't see or take the held times.
    assert f"slot_id {first_id}:" not in service.tool_get_open_slots(s, b)
    from app import slots as sl
    assert not sl.book(s, first_id, b.id)
    assert "Booked" in service.tool_book_visit(s, a, first_id)


def test_booked_patient_calling_back_can_keep_or_move_their_visit(s):
    accept(s)
    lead = first_candidate(s)
    service.tool_verify_identity(s, lead, lead.birth_date)
    first_slot = int(service.tool_get_open_slots(s, lead).split("slot_id ")[1].split(":")[0])
    service.tool_book_visit(s, lead, first_slot)
    # Calling back: Ava is told they're booked, not to pitch again.
    assert service._study_briefing(s, lead).startswith("ALREADY BOOKED")
    # Same time: nothing changes, and no new text is promised.
    texts = len([e for e in lead.events if e.type == "sms_sent"])
    out = service.tool_book_visit(s, lead, first_slot)
    assert "Nothing changed" in out and len([e for e in lead.events if e.type == "sms_sent"]) == texts
    # A different time moves the visit and texts the new time.
    offer = service.tool_get_open_slots(s, lead)
    assert "already booked" in offer
    new_slot = int(offer.split("slot_id ")[1].split(":")[0])
    assert "Moved" in service.tool_book_visit(s, lead, new_slot)
    assert service.booked_slot(s, lead).id == new_slot and lead.status == LeadStatus.BOOKED
    s.refresh(lead)
    assert any(e.type == "visit_rescheduled" for e in lead.events)


def test_call_list_comes_from_the_engine_when_it_has_run(s):
    patients = prescreen.ehr.list_patients(PRACTICE)
    a, b, c = patients[0]["id"], patients[1]["id"], patients[2]["id"]
    rows = [
        {"patient_id": b, "bucket": "candidate", "score": 0.95, "uncertain_criteria": []},
        {"patient_id": a, "bucket": "candidate", "score": 0.60, "uncertain_criteria": []},
        {"patient_id": c, "bucket": "chart_review", "score": 0.5, "uncertain_criteria": ["inc_2 accept 0.61: BMI?"]},
    ]
    with patch("app.ehr.prescreen_results", return_value=rows):
        assert prescreen.counts(PRACTICE, TRIAL) == {"candidate": 2, "chart_review": 1, "not_a_match": len(patients) - 3}
        accept(s)
    queued = sorted(leads(s, LeadStatus.QUEUED), key=lambda x: x.id)
    assert [x.patient_id for x in queued] == [b, a]  # best match is called first
    review = leads(s, LeadStatus.CHART_REVIEW)
    assert len(review) == 1 and "BMI?" in review[0].flags[0]["detail"]


def test_reset_wipes_the_practice_outreach_and_frees_booked_times(client):
    client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    with db.session_scope() as s:
        lead = first_candidate(s)
        service.tool_verify_identity(s, lead, lead.birth_date)
        offer = service.tool_get_open_slots(s, lead)
        slot_id = int(offer.split("slot_id ")[1].split(":")[0])
        service.tool_book_visit(s, lead, slot_id)
    r = client.post(f"/practices/{PRACTICE}/reset", headers=READ)
    assert r.status_code == 200 and r.json()["trials"] == 1 and r.json()["patients"] > 0
    with db.session_scope() as s:
        assert leads(s) == []
        assert s.get(outreach_slots.Slot, slot_id).booked_lead_id is None
    trials = client.get(f"/practices/{PRACTICE}/trials", headers=READ).json()
    assert not next(t for t in trials if t["nct_id"] == TRIAL)["accepted"]
    # And the trial can be accepted again from scratch.
    assert client.post(f"/practices/{PRACTICE}/trials/{TRIAL}/accept", json={"doctor_name": "Rivera"}, headers=READ).status_code == 200


def test_reset_one_trial_keeps_the_others(client):
    other = "NCT07309614"
    for nct in (TRIAL, other):
        client.post(f"/practices/{PRACTICE}/trials/{nct}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    client.post(f"/practices/{PRACTICE}/reset?nct_id={TRIAL}", headers=READ)
    accepted = {t["nct_id"] for t in client.get(f"/practices/{PRACTICE}/trials", headers=READ).json() if t["accepted"]}
    assert accepted == {other}


def test_reset_needs_the_api_key(client):
    assert client.post(f"/practices/{PRACTICE}/reset").status_code in (401, 403)
