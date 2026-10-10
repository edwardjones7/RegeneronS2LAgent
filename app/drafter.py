"""Draft a new campaign from any ClinicalTrials.gov study with Gemini (free tier).

The model proposes a plain-language one-liner, patient-safe facts and phone pre-screen
questions. Nothing here goes live on its own: a coordinator reviews and edits the draft in
the dashboard and approves it. Every fact must quote the public record as evidence; facts
whose evidence can't be found in the record are dropped and listed as rejected.
"""

import json
import logging
import re
import time

import httpx

from app.campaigns import Campaign, all_campaigns
from app.config import get_settings

log = logging.getLogger("drafter")

CTGOV = "https://clinicaltrials.gov/api/v2/studies/{nct}"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
NCT_RE = re.compile(r"^NCT\d{8}$")


class DraftError(ValueError):
    pass


def fetch_study(nct_id: str) -> dict:
    nct_id = nct_id.strip().upper()
    if not NCT_RE.match(nct_id):
        raise DraftError("That doesn't look like an NCT ID (e.g. NCT07685808).")
    r = httpx.get(CTGOV.format(nct=nct_id), timeout=20)
    if r.status_code == 404:
        raise DraftError(f"{nct_id} wasn't found on ClinicalTrials.gov.")
    r.raise_for_status()
    return r.json()


def study_text(study: dict) -> dict:
    p = study["protocolSection"]
    ident, status = p["identificationModule"], p["statusModule"]
    desc, elig = p.get("descriptionModule", {}), p.get("eligibilityModule", {})
    design = p.get("designModule", {})
    return {
        "nct_id": ident["nctId"],
        "title": ident.get("briefTitle", ""),
        "official_title": ident.get("officialTitle", ""),
        "sponsor": p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", ""),
        "status": status.get("overallStatus", ""),
        "conditions": p.get("conditionsModule", {}).get("conditions", []),
        "phases": design.get("phases", []),
        "enrollment": design.get("enrollmentInfo", {}).get("count"),
        "allocation": design.get("designInfo", {}).get("allocation"),
        "masking": design.get("designInfo", {}).get("maskingInfo", {}).get("masking"),
        "brief_summary": desc.get("briefSummary", ""),
        "eligibility_criteria": elig.get("eligibilityCriteria", ""),
        "sex": elig.get("sex"),
        "minimum_age": elig.get("minimumAge"),
        "maximum_age": elig.get("maximumAge"),
        "healthy_volunteers": elig.get("healthyVolunteers"),
        "arms": [a.get("label") for a in p.get("armsInterventionsModule", {}).get("armGroups", [])],
        "interventions": [i.get("name") for i in p.get("armsInterventionsModule", {}).get("interventions", [])],
    }


SCHEMA = {
    "type": "object",
    "properties": {
        "study_short_name": {"type": "string", "description": "2-4 plain words naming the study area, lowercase, e.g. 'weight management', 'knee arthritis'"},
        "one_liner": {"type": "string", "description": "ONE plain-language sentence (max 30 words) a caller can say: what is being tested and for whom. No hype, no promises."},
        "approved_facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string", "description": "A short, patient-friendly fact (8th-grade reading level)"},
                    "evidence": {"type": "string", "description": "An EXACT phrase copied verbatim from the study record that supports the fact"},
                },
                "required": ["fact", "evidence"],
            },
        },
        "prescreen_questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "snake_case id"},
                    "kind": {"type": "string", "enum": ["number", "yes_no"]},
                    "ask": {"type": "string", "description": "Conversational question a caller can ask out loud"},
                    "role": {"type": "string", "enum": ["require_yes", "disqualify_if_yes", "info"],
                             "description": "require_yes: 'no' means not a fit. disqualify_if_yes: 'yes' means not a fit."},
                    "min": {"type": "number", "description": "Only for kind=number (age): minimum allowed"},
                    "max": {"type": "number", "description": "Only for kind=number (age): maximum allowed"},
                    "criterion": {"type": "string", "description": "The inclusion/exclusion criterion this checks, quoted or closely paraphrased"},
                },
                "required": ["id", "kind", "ask", "role", "criterion"],
            },
        },
    },
    "required": ["study_short_name", "one_liner", "approved_facts", "prescreen_questions"],
}

INSTRUCTIONS = """You help a clinical research site set up a phone pre-screen for interested patients.
From the ClinicalTrials.gov record below, draft:
1. study_short_name and a one_liner the caller says first.
2. 6-10 approved_facts a caller may share if asked (what's tested, who it's for, phase, placebo/randomization, length, enrollment size, sponsor). Each fact MUST include `evidence`: an exact phrase copied from the record. Never add facts not in the record (no pay, side effects, locations, schedules, results).
3. 5-9 prescreen_questions a patient can answer by phone from their own knowledge: start with age (kind=number, min/max from the record), then the most important KEY inclusion criteria (role=require_yes) and exclusion criteria (role=disqualify_if_yes). Skip anything needing labs, imaging, scores, or a doctor's assessment. Use plain words; explain medical terms briefly. Questions must be yes/no except age.
Final eligibility is always decided by the research team; never phrase anything as a promise of eligibility."""


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def verify_facts(facts: list[dict], info: dict) -> tuple[list[dict], list[dict]]:
    """Keep facts whose quoted evidence appears in the record (ignoring case, punctuation, spacing)."""
    record = _norm(json.dumps(info, ensure_ascii=False)).replace(" ", "")
    kept, rejected = [], []
    for f in facts:
        ev = _norm(f.get("evidence", "")).replace(" ", "")
        (kept if len(ev) >= 3 and ev in record else rejected).append(f)
    return kept, rejected


# Free-tier models get busy: retry, then fall back to lighter models.
FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-lite-latest"]


def _generate(settings, prompt: str) -> dict:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA, "temperature": 0.2},
    }
    last = ""
    for model in [settings.gemini_model, *FALLBACK_MODELS]:
        for attempt in range(2):
            r = httpx.post(GEMINI.format(model=model), headers={"x-goog-api-key": settings.gemini_api_key}, json=body, timeout=90)
            if r.status_code < 300:
                return r.json()
            last = f"{model}: {r.status_code}"
            if r.status_code not in (429, 500, 503):
                raise DraftError(f"Gemini error {r.status_code}: {r.text[:200]}")
            time.sleep(1.5 * (attempt + 1))
    raise DraftError(f"Gemini is busy right now ({last}). Try again in a minute.")


def draft_campaign(nct_id: str, template_id: str = "olatorepatide-nct07685808") -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise DraftError("GEMINI_API_KEY isn't set.")
    study = fetch_study(nct_id)
    info = study_text(study)
    prompt = f"{INSTRUCTIONS}\n\nSTUDY RECORD (JSON):\n{json.dumps(info, ensure_ascii=False)}"
    data = _generate(settings, prompt)
    try:
        draft = json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise DraftError("Gemini returned an unexpected response; try again.") from exc

    kept, rejected = verify_facts(draft.get("approved_facts", []), info)

    template = all_campaigns().get(template_id)
    site = template.model_dump(include={"clinic_name", "team_name", "clinic_address", "clinic_phone", "coordinator_name",
                                        "coordinator_phone", "timezone", "calling_hours", "visit_length_minutes", "agent_name"}) if template else {}
    questions = []
    for q in draft.get("prescreen_questions", []):
        q = {k: v for k, v in q.items() if v not in (None, "")}
        q["id"] = re.sub(r"[^a-z0-9_]", "_", q["id"].lower())[:40] or f"q{len(questions) + 1}"
        if q["kind"] != "number":
            q.pop("min", None), q.pop("max", None)
        questions.append(q)
    campaign = {
        "id": f"{_norm(draft['study_short_name']).replace(' ', '-')[:40]}-{info['nct_id'].lower()}",
        "demo_not_irb_approved": True,
        "nct_id": info["nct_id"],
        "study_url": f"https://clinicaltrials.gov/study/{info['nct_id']}",
        "sponsor": info["sponsor"],
        **site,
        "study_short_name": draft["study_short_name"],
        "one_liner": draft["one_liner"],
        "approved_facts": [{"fact": f["fact"], "source": "ctgov", "evidence": f["evidence"]} for f in kept],
        "prescreen_questions": questions,
    }
    Campaign.model_validate(campaign)  # raises if the draft can't run
    return {
        "campaign": campaign,
        "rejected_facts": rejected,
        "study": {k: info[k] for k in ("nct_id", "title", "sponsor", "status", "conditions", "phases")},
        "model": data.get("modelVersion", settings.gemini_model),
    }
