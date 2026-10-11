"""Which of a practice's patients are pre-screen candidates for a trial.

Source of truth: the matching engine (site/src/engine, Gemini criteria + Jev), which writes one
row per evaluated patient to Supabase `prescreen_results`. When it has run for a practice and
trial, `screen_practice` uses those rows, so the patients Ava calls are exactly the ones counted
for the doctor, best matches first.

Fallback (no database, or the engine hasn't run for that pair): evaluate the plain-code criteria
in protocols/*.json (format: protocols/README.md). Jev criteria count as UNKNOWN there, so those
patients land in chart review and are never called before a person clears them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import lru_cache

from app import ehr
from app.config import get_settings

MATCH, NO_MATCH, UNKNOWN = "MATCH", "NO_MATCH", "UNKNOWN"


@lru_cache
def protocols() -> dict[str, dict]:
    out = {}
    for path in sorted(get_settings().protocols_dir.glob("NCT*.json")):
        p = json.loads(path.read_text())
        out[p["nctId"]] = p
    return out


def protocol(nct_id: str) -> dict | None:
    return protocols().get(nct_id)


@dataclass
class Screened:
    patient: dict
    bucket: str  # candidate | chart_review | not_a_match
    results: dict[str, str] = field(default_factory=dict)  # criterion id -> MATCH / NO_MATCH / UNKNOWN
    review_reasons: list[str] = field(default_factory=list)
    score: float | None = None  # engine ranking within a bucket (higher first); None from the fallback
    source: str = "rules"  # "engine" (prescreen_results) or "rules" (the fallback below)


def _age(birth: str, as_of: date) -> int:
    b = date.fromisoformat(birth)
    return as_of.year - b.year - ((as_of.month, as_of.day) < (b.month, b.day))


def _months_ago(as_of: date, months: float) -> str:
    return (as_of - timedelta(days=int(months * 30.44))).isoformat()


def _matches(rule: dict, code: str, names: dict[str, str]) -> bool:
    return code in rule.get("codes", []) or any(re.search(p, names.get(code, ""), re.I) for p in rule.get("names", []))


def evaluate(rule: dict, p: dict, as_of: date) -> bool | None:
    """A rule's value for one patient: True, False, or None (unknown). See protocols/README.md."""
    c = ehr.codes()
    t = rule["type"]
    if t == "age":
        a = _age(p["birthDate"], as_of)
        return ("gte" not in rule or a >= rule["gte"]) and ("lt" not in rule or a < rule["lt"])
    if t in ("condition", "medication"):
        names = c["snomed"] if t == "condition" else c["rxnorm"]
        for code, start, stop in p[t + "s"]:
            if not _matches(rule, code, names):
                continue
            if rule.get("active") and stop:
                continue
            if "minDurationMonths" in rule and start > _months_ago(as_of, rule["minDurationMonths"]):
                continue
            if "withinMonths" in rule and stop and stop < _months_ago(as_of, rule["withinMonths"]):
                continue
            return True
        return False
    if t == "procedure":
        return any(
            _matches(rule, code, c["snomed"]) and ("withinMonths" not in rule or when >= _months_ago(as_of, rule["withinMonths"]))
            for code, when in p["procedures"]
        )
    if t in ("observation", "observationIn"):
        o = p["observations"].get(rule["field"])
        if not o or ("maxAgeMonths" in rule and o["date"] < _months_ago(as_of, rule["maxAgeMonths"])):
            return None
        if t == "observationIn":
            return o["value"] in rule["values"]
        v = float(o["value"])
        checks = {"gte": v >= rule.get("gte", v), "gt": "gt" not in rule or v > rule["gt"], "lte": v <= rule.get("lte", v), "lt": "lt" not in rule or v < rule["lt"]}
        return all(checks.values())
    if t == "weightChange":
        w = [kg for d, kg in p["weights"] if d >= _months_ago(as_of, rule["withinMonths"])]
        return None if len(w) < 2 else max(w) - min(w) > rule["moreThanKg"]
    values = [evaluate(r, p, as_of) for r in rule["rules"]]
    if t == "anyOf":
        return True if True in values else (None if None in values else False)
    if t == "allOf":
        return False if False in values else (None if None in values else True)
    raise ValueError(f"unknown rule type {t}")


def screen(protocol_: dict, p: dict, as_of: date) -> Screened:
    results, reasons = {}, []
    for crit in protocol_["criteria"]:
        if crit["check"] == "review":
            continue  # confirmed at screening; never affects the bucket
        if crit["check"] == "jev":
            results[crit["id"]] = UNKNOWN
            reasons.append(f"{crit['text']} (judgment check pending)")
            continue
        v = evaluate(crit["rule"], p, as_of)
        if v is None:
            r = crit.get("unknownAs", UNKNOWN)
        else:
            r = MATCH if v == (crit["type"] == "inclusion") else NO_MATCH
        results[crit["id"]] = r
        if r == UNKNOWN:
            reasons.append(crit["text"])
    if NO_MATCH in results.values():
        bucket = "not_a_match"
    elif UNKNOWN in results.values():
        bucket = "chart_review"
    else:
        bucket = "candidate"
    return Screened(patient=p, bucket=bucket, results=results, review_reasons=reasons)


def screen_practice(practice_id: str, nct_id: str, as_of: date | None = None) -> list[Screened]:
    """Every patient of one practice, screened against one trial: the engine's results when it
    has run for this practice and trial, else the protocol rules."""
    patients = ehr.list_patients(practice_id)
    rows = ehr.prescreen_results(practice_id, nct_id)
    if rows:
        by_id = {p["id"]: p for p in patients}
        out, seen = [], set()
        for r in rows:
            p = by_id.get(r["patient_id"])
            if p is None:
                continue
            seen.add(p["id"])
            reasons = list(r.get("uncertain_criteria") or []) if r["bucket"] == "chart_review" else []
            out.append(Screened(patient=p, bucket=r["bucket"], review_reasons=reasons or (
                ["The pre-screen wasn't sure about a criterion"] if r["bucket"] == "chart_review" else []),
                score=r.get("score"), source="engine"))
        # Patients the engine didn't evaluate didn't match the trial's condition at all.
        out += [Screened(patient=p, bucket="not_a_match", source="engine") for p in patients if p["id"] not in seen]
        return out
    proto = protocol(nct_id)
    if proto is None:
        raise KeyError(nct_id)
    as_of = as_of or date.today()
    return [screen(proto, p, as_of) for p in patients]


def counts(practice_id: str, nct_id: str) -> dict[str, int]:
    """Bucket counts for one practice and trial (aggregate only). The engine's stored counts
    (view prescreen_trial_counts) when it has run for this pair, else screened here."""
    stored = (ehr.prescreen_trial_counts(practice_id, nct_id) or {}).get(nct_id)
    if stored:
        return dict(stored)
    out = {"candidate": 0, "chart_review": 0, "not_a_match": 0}
    for r in screen_practice(practice_id, nct_id):
        out[r.bucket] += 1
    return out
