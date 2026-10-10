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


class BmiRules(BaseModel):
    fit_min: float = 30.0
    fit_max_exclusive: float = 45.0
    comorbidity_min: float = 27.0


class Campaign(BaseModel):
    id: str
    demo_not_irb_approved: bool
    nct_id: str
    study_url: str
    sponsor: str
    clinic_name: str
    team_name: str
    clinic_address: str
    clinic_phone: str
    coordinator_name: str
    coordinator_phone: str
    timezone: str
    calling_hours: CallingHours = CallingHours()
    visit_length_minutes: int = 60
    agent_name: str = "Ava"
    study_short_name: str
    one_liner: str
    approved_facts: list[Fact]
    prescreen_questions: list[Question]
    bmi_rules: BmiRules = BmiRules()

    @model_validator(mode="after")
    def _check(self):
        ids = [q.id for q in self.prescreen_questions]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate question ids")
        if not self.approved_facts:
            raise ValueError("a campaign needs approved_facts")
        return self

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


def all_campaigns() -> dict[str, Campaign]:
    return {**file_campaigns(), **db_campaigns()}


def get_campaign(campaign_id: str) -> Campaign | None:
    return all_campaigns().get(campaign_id)
