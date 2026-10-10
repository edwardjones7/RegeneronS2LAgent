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


class Question(BaseModel):
    id: str
    kind: Literal["number", "height", "weight", "yes_no"]
    ask: str
    role: Literal["disqualify_if_yes", "comorbidity", "info"] = "info"
    min: float | None = None
    only_if: Literal["bmi_27_to_30"] | None = None
    unsure_flags: bool = False


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
def all_campaigns() -> dict[str, Campaign]:
    out = {}
    for path in sorted(Path(get_settings().campaigns_dir).glob("*.yaml")):
        c = load_campaign_file(path)
        out[c.id] = c
    return out


def get_campaign(campaign_id: str) -> Campaign | None:
    return all_campaigns().get(campaign_id)
