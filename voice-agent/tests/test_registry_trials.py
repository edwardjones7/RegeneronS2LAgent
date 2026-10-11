"""Accepting any trial the matching engine has results for, with a call script built from the
public trial registry. Offline: Supabase is a fake served by httpx.MockTransport."""

import json
import re
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import campaigns, db, ehr, outreach, prescreen, service, sms, voice
from app.campaigns import Campaign, get_campaign
from app.main import app
from app.models import CampaignRecord, Call, Lead, LeadStatus

READ = {"X-API-Key": "test-read"}
PRACTICE = "middlesex"
NEW = "NCT09990001"  # a trial with engine results but no hand-authored protocol or campaign

TRIAL_ROW = {
    "nct_id": NEW,
    "brief_title": "A Study of Itepekimab in Adults With Chronic Obstructive Pulmonary Disease",
    "official_title": "A Randomized, Placebo-Controlled Phase 3 Study of Itepekimab in COPD",
    "overall_status": "RECRUITING",
    "phases": ["PHASE3"],
    "conditions": ["Chronic Obstructive Pulmonary Disease"],
    "lead_sponsor": "Regeneron Pharmaceuticals",
    "enrollment_count": 1200,
    "sex": "ALL",
    "minimum_age_years": "40",  # PostgREST sends numeric as a string
    "maximum_age_years": "85",
    "brief_summary": "This randomized study compares itepekimab with placebo.",
    "start_date": "2026-01-15",
    "primary_completion_date": "2028-06",
}


class FakeSupabase:
    """Just enough of PostgREST for ehr.py, serving the bundled Synthea patients."""

    def __init__(self, trials: dict[str, dict], results: dict[tuple[str, str], list[dict]]):
        self.trials, self.results, self.requests = trials, results, []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path, q = request.url.path.removeprefix("/rest/v1"), dict(request.url.params)
        self.requests.append(path)
        eq = lambda k: (q.get(k) or "").removeprefix("eq.")  # noqa: E731
        bundle = ehr._bundle()["patients"]
        if path == "/practices":
            names = {ehr.practice_slug(p["group"]): p["group"] for p in bundle}
            return httpx.Response(200, json=[{"id": k, "name": v} for k, v in sorted(names.items())])
        if path == "/rpc/practice_patient_counts":
            return httpx.Response(200, json=[{"practice_id": p["id"], "patients": p["patients"]} for p in self._offline_practices()])
        if path == "/patients":
            rows = [self._patient_row(p) for p in bundle if ehr.practice_slug(p["group"]) == eq("practice_id")]
            if q.get("id"):
                rows = [r for r in rows if r["id"] == eq("id")]
            off, lim = int(q.get("offset", 0)), int(q.get("limit", 10_000))
            return httpx.Response(200, json=rows[off:off + lim])
        if path == "/prescreen_results":
            return httpx.Response(200, json=self.results.get((eq("practice_id"), eq("nct_id")), []))
        if path == "/prescreen_trial_counts":
            rows = []
            for (practice, nct), rs in self.results.items():
                if practice != eq("practice_id") or (q.get("nct_id") and nct != eq("nct_id")):
                    continue
                n = lambda b: sum(r["bucket"] == b for r in rs)  # noqa: E731,B023
                rows.append({"nct_id": nct, "candidates": n("candidate"), "chart_review": n("chart_review"),
                             "not_a_match": n("not_a_match")})
            return httpx.Response(200, json=rows)
        if path == "/trials":
            ids = re.fullmatch(r"in\.\((.*)\)", q["nct_id"]).group(1).split(",")
            return httpx.Response(200, json=[self.trials[i] for i in ids if i in self.trials])
        return httpx.Response(404, json={"message": f"unexpected {path}"})

    @staticmethod
    def _offline_practices():
        with patch("app.ehr._supabase", return_value=None):
            return ehr.list_practices()

    @staticmethod
    def _patient_row(p: dict) -> dict:
        record = {k: v for k, v in p.items() if k not in ("id", "name", "birthDate", "sex")}
        return {"id": p["id"], "name": p["name"], "birth_date": p["birthDate"], "sex": p["sex"],
                "practice_id": ehr.practice_slug(p["group"]), "record": record}


def engine_rows(practice: str = PRACTICE) -> list[dict]:
    with patch("app.ehr._supabase", return_value=None):
        patients = ehr.list_patients(practice)
    ids = [p["id"] for p in patients[:4]]
    return [
        {"patient_id": ids[0], "bucket": "candidate", "score": 0.9, "uncertain_criteria": []},
        {"patient_id": ids[1], "bucket": "candidate", "score": 0.8, "uncertain_criteria": []},
        {"patient_id": ids[2], "bucket": "chart_review", "score": 0.5, "uncertain_criteria": ["inc_3 accept 0.6: FEV1?"]},
        {"patient_id": ids[3], "bucket": "not_a_match", "score": 0.1, "uncertain_criteria": []},
    ]


@pytest.fixture(autouse=True)
def _clean():
    ehr._cache.clear()
    yield
    campaigns._built.clear()
    campaigns.invalidate_campaign_cache()
    ehr._cache.clear()


@pytest.fixture
def fake():
    """Supabase configured: ehr._supabase builds its client on a MockTransport."""
    f = FakeSupabase({NEW: TRIAL_ROW}, {(PRACTICE, NEW): engine_rows()})

    def client():
        return httpx.Client(base_url="https://fake.supabase.co/rest/v1", transport=httpx.MockTransport(f))

    with patch("app.ehr._supabase", side_effect=client):
        yield f


@pytest.fixture
def s():
    db.init_engine("sqlite://")
    sms.set_sms(sms.MockSms())
    voice.set_voice(voice.MockVoice())
    with patch("app.outreach.fast_forward", return_value=60), db.session_scope() as session:
        yield session


@pytest.fixture
def client():
    db.init_engine("sqlite://")
    sms.set_sms(sms.MockSms())
    voice.set_voice(voice.MockVoice())
    with patch("app.main.db.init_engine"), patch("app.outreach.fast_forward", return_value=60):
        with TestClient(app) as c:
            yield c


# ---------------------------------------------------------------- building a campaign


def test_campaign_from_a_registry_row():
    c = campaigns.from_trial(TRIAL_ROW)
    assert Campaign.model_validate(json.loads(c.model_dump_json())) == c  # valid, and survives storage
    assert (c.id, c.mode, c.nct_id, c.agent_name) == ("practice-nct09990001", "practice", NEW, "Ava")
    assert c.study_url == f"https://clinicaltrials.gov/study/{NEW}" and c.sponsor == "Regeneron Pharmaceuticals"
    assert c.demo_not_irb_approved and c.prescreen_questions == [] and c.visit_length_minutes == 60
    assert c.one_liner == "It's a research study for adults aged 40 to 85 with chronic obstructive pulmonary disease."
    assert c.study_short_name == "Chronic Obstructive Pulmonary Disease"
    facts = {f.fact: f.source for f in c.approved_facts}
    text = " ".join(facts)
    for phrase in ("Phase 3", "1,200 people", "sponsored by Regeneron Pharmaceuticals", "placebo", "decided by chance",
                   "screening visit", "stay the patient's doctor", "voluntary"):
        assert phrase in text, phrase
    # Study facts come from the record; the visit and practice wording is marked as demo wording.
    assert all(src == "ctgov" for f, src in facts.items() if f.startswith(("The study is", "It is a", "The study plans")))
    assert {src for f, src in facts.items() if "voluntary" in f or "screening visit" in f} == {"demo"}


def test_campaign_from_a_sparse_registry_row():
    c = campaigns.from_trial({"nct_id": "nct09990002", "brief_title": "A Study", "phases": ["NA"], "conditions": [],
                              "sex": "FEMALE", "minimum_age_years": None, "maximum_age_years": None})
    assert c.id == "practice-nct09990002" and c.nct_id == "NCT09990002"
    assert "Phase" not in " ".join(f.fact for f in c.approved_facts) and "women" in c.one_liner
    assert campaigns.phase_label(["PHASE1", "PHASE2"]) == "Phase 1/2" and campaigns.phase_label([]) is None


# ---------------------------------------------------------------- accepting a trial without a protocol


def test_accept_a_trial_with_engine_results_but_no_protocol(fake, s):
    assert prescreen.protocol(NEW) is None and get_campaign(outreach.campaign_id_for(NEW)) is None
    assert prescreen.counts(PRACTICE, NEW) == {"candidate": 2, "chart_review": 1, "not_a_match": 1}

    a = outreach.accept_trial(s, PRACTICE, NEW, "Dr. Rivera")
    assert (a.candidates, a.chart_review, a.campaign_id) == (2, 1, "practice-nct09990001")
    rec = s.get(CampaignRecord, "practice-nct09990001")
    assert rec and rec.data["mode"] == "practice" and rec.data["prescreen_questions"] == []
    assert get_campaign("practice-nct09990001").nct_id == NEW

    leads = list(s.scalars(select(Lead).where(Lead.campaign_id == a.campaign_id)))
    assert sorted(x.status for x in leads) == [LeadStatus.CHART_REVIEW, LeadStatus.QUEUED, LeadStatus.QUEUED]

    # Ava calls the first candidate with the built script.
    lead_id = service.due_leads(s)[0]
    service.dial(lead_id)
    s.expire_all()
    lead = s.get(Lead, lead_id)
    assert lead.status == LeadStatus.CALLING and s.scalars(select(Call).where(Call.lead_id == lead_id)).first()
    assert "chronic obstructive pulmonary disease" in service._study_briefing(s, lead)

    # Accepting again reuses everything; nothing is rebuilt.
    assert outreach.accept_trial(s, PRACTICE, NEW, "Dr. Rivera").id == a.id


def test_engine_results_without_a_registry_row_have_no_call_script(fake, s):
    fake.trials.clear()
    with pytest.raises(outreach.OutreachError, match="no call script"):
        outreach.accept_trial(s, PRACTICE, NEW, "Dr. Rivera")


def test_no_results_and_no_protocol_cannot_be_accepted(fake, s):
    with pytest.raises(outreach.OutreachError, match="no pre-screen results"):
        outreach.accept_trial(s, "hudson", NEW, "Dr. Rivera")  # the engine ran for middlesex only
    assert s.get(CampaignRecord, "practice-nct09990001") is None  # no script built for nothing


# ---------------------------------------------------------------- the trials list


def test_trials_list_includes_trials_with_stored_results(fake, client):
    trials = client.get(f"/practices/{PRACTICE}/trials", headers=READ).json()
    new = next(t for t in trials if t["nct_id"] == NEW)
    assert new["title"] == TRIAL_ROW["brief_title"] and new["sponsor"] == "Regeneron Pharmaceuticals"
    assert new["phase"] == "Phase 3" and new["callable"] and not new["accepted"]
    assert (new["candidates"], new["chart_review"]) == (2, 1)
    assert set(prescreen.protocols()) <= {t["nct_id"] for t in trials}  # the fallback trials stay listed
    assert fake.requests.count("/trials") == 1  # titles in one batched request
    for key in ("nct_id", "callable", "candidates", "chart_review", "accepted", "accepted_by", "accepted_at", "title"):
        assert key in new

    r = client.post(f"/practices/{PRACTICE}/trials/{NEW}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    assert r.status_code == 200 and r.json()["candidates"] == 2
    again = next(t for t in client.get(f"/practices/{PRACTICE}/trials", headers=READ).json() if t["nct_id"] == NEW)
    assert again["accepted"] and again["accepted_by"] == "Dr. Rivera"


def test_without_supabase_only_protocol_trials_are_listed(client):
    assert ehr._supabase() is None and ehr.prescreen_trial_counts(PRACTICE) is None and ehr.trials([NEW]) == {}
    trials = client.get(f"/practices/{PRACTICE}/trials", headers=READ).json()
    assert {t["nct_id"] for t in trials} == set(prescreen.protocols())
    obesity = next(t for t in trials if t["nct_id"] == "NCT07685808")
    assert obesity["callable"] and obesity["title"] == prescreen.protocol("NCT07685808")["shortTitle"]
    assert obesity["candidates"] == prescreen.counts(PRACTICE, "NCT07685808")["candidate"]
    r = client.post(f"/practices/{PRACTICE}/trials/{NEW}/accept", json={"doctor_name": "Rivera"}, headers=READ)
    assert r.status_code == 400 and "no pre-screen results" in r.json()["detail"]
