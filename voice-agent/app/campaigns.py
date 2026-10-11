"""Campaign files: one YAML per study. They are the agent's only source of study wording."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, model_validator

from app.config import get_settings


class CallingHours(BaseModel):
    start: str = "09:00"
    end: str = "20:00"


class Fact(BaseModel):
    fact: str
    source: Literal["ctgov", "demo"]
    evidence: str | None = None  # exact phrase from the public record backing this fact


class Question(BaseModel):
    id: str
    kind: Literal["number", "height", "weight", "yes_no"]
    ask: str
    role: Literal["disqualify_if_yes", "require_yes", "comorbidity", "info"] = "info"
    min: float | None = None
    max: float | None = None
    only_if: Literal["bmi_27_to_30"] | None = None
    unsure_flags: bool = False
    criterion: str | None = None  # the protocol criterion this question checks


class Translation(BaseModel):
    """Pre-written wording in another language. Ava uses only this; she never translates on the fly."""

    validated: bool = False  # True only once a certified translator / IRB has approved it
    first_message: str
    one_liner: str
    facts: list[str]
    questions: dict[str, str]  # question id -> wording
    voicemail: str = ""


class BmiRules(BaseModel):
    fit_min: float = 30.0
    fit_max_exclusive: float = 45.0
    comorbidity_min: float = 27.0


class Campaign(BaseModel):
    id: str
    # opt_in: the original ad opt-in flow, clinic details in this file.
    # practice: a doctor's office calling its own pre-screened patients; the clinic details
    # (office name, doctor, address, phones) come from the practice at call time.
    mode: Literal["opt_in", "practice"] = "opt_in"
    demo_not_irb_approved: bool
    nct_id: str
    study_url: str
    sponsor: str
    clinic_name: str = ""
    team_name: str = ""
    clinic_address: str = ""
    clinic_phone: str = ""
    coordinator_name: str = ""
    coordinator_phone: str = ""
    timezone: str = "America/New_York"
    calling_hours: CallingHours = CallingHours()
    visit_length_minutes: int = 60
    agent_name: str = "Ava"
    study_short_name: str
    one_liner: str
    approved_facts: list[Fact]
    prescreen_questions: list[Question]
    bmi_rules: BmiRules = BmiRules()
    translations: dict[str, Translation] = {}

    @model_validator(mode="after")
    def _check(self):
        ids = [q.id for q in self.prescreen_questions]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate question ids")
        if not self.approved_facts:
            raise ValueError("a campaign needs approved_facts")
        return self

    def for_practice(self, profile) -> "Campaign":
        """This campaign as spoken by one practice's office (see models.PracticeProfile)."""
        office = f"Dr. {profile.doctor_name}'s office" if profile.doctor_name else f"your doctor's office at {profile.name}"
        return self.model_copy(update={
            "clinic_name": profile.name,
            "team_name": office,
            "clinic_address": profile.address,
            "clinic_phone": profile.callback_phone,
            "coordinator_name": f"{profile.name} office staff",
            "coordinator_phone": profile.staff_phone,
            "timezone": profile.timezone,
        })

    def question(self, qid: str) -> Question | None:
        return next((q for q in self.prescreen_questions if q.id == qid), None)


def load_campaign_file(path: Path) -> Campaign:
    return Campaign.model_validate(yaml.safe_load(path.read_text()))


@lru_cache
def file_campaigns() -> dict[str, Campaign]:
    out = {}
    for path in sorted(Path(get_settings().campaigns_dir).glob("*.yaml")):
        c = load_campaign_file(path)
        out[c.id] = c
    return out


_db_cache: tuple[float, dict[str, Campaign]] | None = None


def db_campaigns() -> dict[str, Campaign]:
    """Campaigns approved in the dashboard (stored in the database), cached for a few seconds."""
    global _db_cache
    import time

    if _db_cache and time.monotonic() - _db_cache[0] < 5:
        return _db_cache[1]
    from sqlalchemy import select

    from app.db import session_scope
    from app.models import CampaignRecord

    out: dict[str, Campaign] = {}
    try:
        with session_scope() as s:
            for rec in s.scalars(select(CampaignRecord).order_by(CampaignRecord.created_at)):
                out[rec.id] = Campaign.model_validate(rec.data)
    except Exception:  # noqa: BLE001 - e.g. table not created yet
        return {}
    _db_cache = (time.monotonic(), out)
    return out


def invalidate_campaign_cache() -> None:
    global _db_cache
    _db_cache = None


# Campaigns built from the registry by this process. Kept here too so they're found at once,
# before the transaction that stores them commits (db_campaigns reads in its own session).
_built: dict[str, Campaign] = {}


def all_campaigns() -> dict[str, Campaign]:
    return {**_built, **file_campaigns(), **db_campaigns()}


# ---------------------------------------------------------------- built from the trial registry


_PHASE_WORDS = {
    "EARLY_PHASE1": "an Early Phase 1 study, which means the treatment is being tried in people for the first time",
    "PHASE1": "a Phase 1 study, which means the treatment is mainly being tested for safety",
    "PHASE2": "a Phase 2 study, which means the treatment is still being tested for safety and how well it works",
    "PHASE3": "a Phase 3 study, which tests how well the treatment works in a larger group of people",
    "PHASE4": "a Phase 4 study of a treatment that is already approved, to learn more about it",
}


def phase_label(phases: list[str] | None) -> str | None:
    """['PHASE1', 'PHASE2'] -> 'Phase 1/2'; ['PHASE4'] -> 'Phase 4'; [] or ['NA'] -> None."""
    nums = [p.removeprefix("EARLY_").removeprefix("PHASE") for p in phases or [] if p.upper() != "NA"]
    if not nums:
        return None
    early = "Early " if any(p.startswith("EARLY_") for p in phases) else ""
    return f"{early}Phase {'/'.join(nums)}"


def _years(v) -> int | None:
    try:
        return None if v in (None, "") else int(float(v))
    except (TypeError, ValueError):
        return None


def _who(row: dict) -> str:
    """'adults aged 40 to 85 with Chronic Obstructive Pulmonary Disease' from the registry row."""
    lo, hi = _years(row.get("minimum_age_years")), _years(row.get("maximum_age_years"))
    people = {"FEMALE": "women", "MALE": "men"}.get((row.get("sex") or "").upper(), "adults" if (lo or 0) >= 18 else "people")
    if lo and hi:
        ages = f" aged {lo} to {hi}"
    elif lo:
        ages = f" {lo} or older"
    elif hi:
        ages = f" up to age {hi}"
    else:
        ages = ""
    # Lowercase Title Case words ("Chronic Obstructive Pulmonary Disease"); keep acronyms (COPD).
    conditions = [" ".join(w if w.isupper() else w.lower() for w in c.split()) for c in row.get("conditions") or [] if c]
    if not conditions:
        return f"{people}{ages}"
    cond = conditions[0] if len(conditions) == 1 else ", ".join(conditions[:-1]) + " or " + conditions[-1]
    return f"{people}{ages} with {cond}"


def _short_name(row: dict) -> str:
    conditions = [c for c in row.get("conditions") or [] if c]
    name = conditions[0] if conditions else (row.get("brief_title") or row["nct_id"])
    return name if len(name) <= 40 else name[:40].rsplit(" ", 1)[0]


def from_trial(row: dict, visit_length_minutes: int = 60) -> Campaign:
    """A practice-mode campaign built from a ClinicalTrials.gov registry row (Supabase `trials`).

    Templated, no LLM: every study fact is a field of the public record (`source: ctgov`). The
    three facts about the visit and the practice describe this outreach, so they're `demo`, the
    same as the hand-written practice campaigns. DEMO: NOT IRB-APPROVED. No phone questions: the
    practice's records already pre-screened these patients, and the screening visit confirms the
    rest."""
    nct = row["nct_id"].upper()
    sponsor = (row.get("lead_sponsor") or "").strip()
    who = _who(row)
    facts: list[Fact] = [Fact(fact=f"The study is for {who}.", source="ctgov",
                              evidence=", ".join(row.get("conditions") or []) or None)]
    phases = [p for p in row.get("phases") or [] if p.upper() != "NA"]
    if len(phases) == 1 and phases[0].upper() in _PHASE_WORDS:
        facts.append(Fact(fact=f"It is {_PHASE_WORDS[phases[0].upper()]}.", source="ctgov", evidence=phases[0]))
    elif label := phase_label(phases):
        facts.append(Fact(fact=f"It is a {label} study.", source="ctgov", evidence=", ".join(phases)))
    summary = (row.get("brief_summary") or "").lower()
    if "placebo" in summary:
        chance = " Who gets which is decided by chance." if "randomi" in summary else ""
        facts.append(Fact(fact=f"Some participants receive a placebo, an inactive look-alike, instead of the study treatment.{chance}",
                          source="ctgov", evidence="placebo"))
    if row.get("enrollment_count"):
        n = int(row["enrollment_count"])
        facts.append(Fact(fact=f"The study plans to enroll about {n:,} people.", source="ctgov", evidence=str(n)))
    if sponsor:
        facts.append(Fact(fact=f"The study is sponsored by {sponsor}.", source="ctgov", evidence=sponsor))
    facts += [
        Fact(fact=f"The first step is a screening visit of about {_duration(visit_length_minutes)} at the doctor's office, "
                  "where the team checks whether the study is a good fit. It's free.", source="demo"),
        Fact(fact="The doctor's office is taking part in the study, so they'd stay the patient's doctor.", source="demo"),
        Fact(fact="Taking part is completely voluntary, and they can stop at any time.", source="demo"),
    ]
    return Campaign(
        id=f"practice-{nct.lower()}",
        mode="practice",
        demo_not_irb_approved=True,
        nct_id=nct,
        study_url=f"https://clinicaltrials.gov/study/{nct}",
        sponsor=sponsor or "the study sponsor",
        agent_name="Ava",
        visit_length_minutes=visit_length_minutes,
        study_short_name=_short_name(row),
        one_liner=f"It's a research study for {who}.",
        approved_facts=facts,
        prescreen_questions=[],
    )


def _duration(minutes: int) -> str:
    if minutes == 60:
        return "an hour"
    if minutes % 60 == 0:
        return f"{minutes // 60} hours"
    return f"{minutes} minutes"


def save_campaign(s, c: Campaign, note: str = "") -> Campaign:
    """Store a campaign the way approved ones are stored (CampaignRecord), so get_campaign, the
    calendar and the dashboards find it. File campaigns are never overwritten."""
    from app.models import CampaignRecord

    if c.id in file_campaigns():
        return file_campaigns()[c.id]
    rec = s.get(CampaignRecord, c.id)
    if rec:
        rec.data = c.model_dump()
    else:
        s.add(CampaignRecord(id=c.id, data=c.model_dump(), approved_by_note=note))
    s.flush()
    _built[c.id] = c
    invalidate_campaign_cache()
    return c


def get_campaign(campaign_id: str) -> Campaign | None:
    return all_campaigns().get(campaign_id)
