"""Reading patients from the practice's EHR stand-in.

In the demo, Supabase's `patients` table stands in for each practice's own EHR (.claude/AGENTS.MD
section 5). Every read here is scoped to ONE practice; nothing pools patients across practices.
Without Supabase settings (tests, offline demo), the same patients come from data/synthea-nj.json.

Patient dicts have the bundle's shape: id, name, birthDate, sex, group/practice, conditions,
medications, procedures, observations, weights, acuteVisits.
"""

from __future__ import annotations

import json
import re
import time
from functools import lru_cache

import httpx

from app.config import get_settings


def practice_slug(county: str) -> str:
    return re.sub(r"[^a-z]+", "-", county.lower().replace(" county", "")).strip("-")


@lru_cache
def _bundle() -> dict:
    return json.loads(get_settings().patients_file.read_text())


def codes() -> dict[str, dict[str, str]]:
    """Code -> display name, per system. Not patient data."""
    return _bundle()["codes"]


def _supabase() -> httpx.Client | None:
    s = get_settings()
    if not (s.supabase_url and s.supabase_secret_key):
        return None
    key = s.supabase_secret_key
    return httpx.Client(
        base_url=s.supabase_url.rstrip("/") + "/rest/v1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )


def _from_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "birthDate": row["birth_date"],
        "sex": row["sex"],
        "practice_id": row["practice_id"],
        **row["record"],
    }


def list_practices() -> list[dict]:
    """[{id, name, patients}] for every practice. Counts only, no patient data."""
    client = _supabase()
    if client:
        with client:
            practices = client.get("/practices", params={"select": "id,name", "order": "name"}).raise_for_status().json()
            counts = {r["practice_id"]: r["patients"] for r in client.post("/rpc/practice_patient_counts").raise_for_status().json()}
        return [{**p, "patients": counts.get(p["id"])} for p in practices]
    by_id: dict[str, dict] = {}
    for p in _bundle()["patients"]:
        pid = practice_slug(p["group"])
        by_id.setdefault(pid, {"id": pid, "name": p["group"], "patients": 0})["patients"] += 1
    return sorted(by_id.values(), key=lambda p: p["name"])


def practice_name(practice_id: str) -> str:
    return next((p["name"] for p in list_practices() if p["id"] == practice_id), practice_id)


_CACHE_SECS = 60
_cache: dict[str, tuple[float, list[dict]]] = {}


def list_patients(practice_id: str) -> list[dict]:
    """Every patient of ONE practice (cached for a minute: the records don't change during a demo)."""
    hit = _cache.get(practice_id)
    if hit and time.monotonic() - hit[0] < _CACHE_SECS:
        return hit[1]
    patients = _fetch_patients(practice_id)
    _cache[practice_id] = (time.monotonic(), patients)
    return patients


def _fetch_patients(practice_id: str) -> list[dict]:
    client = _supabase()
    if client:
        out, page = [], 1000
        with client:
            while True:
                rows = client.get(
                    "/patients",
                    params={"select": "*", "practice_id": f"eq.{practice_id}", "order": "id", "limit": page, "offset": len(out)},
                ).raise_for_status().json()
                out += [_from_row(r) for r in rows]
                if len(rows) < page:
                    return out
    return [
        {**p, "practice_id": practice_slug(p["group"])}
        for p in _bundle()["patients"]
        if practice_slug(p["group"]) == practice_id
    ]


def get_patient(practice_id: str, patient_id: str) -> dict | None:
    """One patient, only if they belong to this practice."""
    client = _supabase()
    if client:
        with client:
            rows = client.get(
                "/patients", params={"select": "*", "practice_id": f"eq.{practice_id}", "id": f"eq.{patient_id}"}
            ).raise_for_status().json()
        return _from_row(rows[0]) if rows else None
    return next((p for p in list_patients(practice_id) if p["id"] == patient_id), None)


def prescreen_results(practice_id: str, nct_id: str) -> list[dict] | None:
    """The matching engine's results for one practice and trial (site/src/engine, table
    prescreen_results). None when there's no database or the engine hasn't run for this pair."""
    client = _supabase()
    if not client:
        return None
    with client:
        rows = client.get(
            "/prescreen_results",
            params={
                "select": "patient_id,bucket,score,condition_match,review_items,uncertain_criteria,evaluated_at",
                "practice_id": f"eq.{practice_id}",
                "nct_id": f"eq.{nct_id}",
                "order": "score.desc",
            },
        ).raise_for_status().json()
    return rows or None


def prescreen_trial_counts(practice_id: str, nct_id: str | None = None) -> dict[str, dict[str, int]] | None:
    """Per-trial bucket counts for ONE practice from the `prescreen_trial_counts` view:
    {nct_id: {candidate, chart_review, not_a_match}}. Aggregate counts only, no patient data.
    The secret key bypasses RLS, so the practice filter here is what scopes it. None when
    there's no database. not_a_match counts only the patients the engine evaluated."""
    client = _supabase()
    if not client:
        return None
    params = {"select": "nct_id,candidates,chart_review,not_a_match", "practice_id": f"eq.{practice_id}"}
    if nct_id:
        params["nct_id"] = f"eq.{nct_id}"
    with client:
        rows = client.get("/prescreen_trial_counts", params=params).raise_for_status().json()
    return {
        r["nct_id"]: {
            "candidate": int(r.get("candidates") or 0),
            "chart_review": int(r.get("chart_review") or 0),
            "not_a_match": int(r.get("not_a_match") or 0),
        }
        for r in rows
    }


TRIAL_FIELDS = (
    "nct_id,brief_title,official_title,overall_status,phases,conditions,lead_sponsor,enrollment_count,"
    "sex,minimum_age_years,maximum_age_years,brief_summary,start_date,primary_completion_date"
)


def trials(nct_ids) -> dict[str, dict]:
    """Public registry rows (Supabase `trials`, from ClinicalTrials.gov) for these trials, in one
    request. Not patient data. Empty when there's no database."""
    ids = sorted({n for n in nct_ids if re.fullmatch(r"NCT\d{8}", n or "")})
    if not ids:
        return {}
    client = _supabase()
    if not client:
        return {}
    with client:
        rows = client.get(
            "/trials", params={"select": TRIAL_FIELDS, "nct_id": f"in.({','.join(ids)})"}
        ).raise_for_status().json()
    return {r["nct_id"]: r for r in rows}


def trial(nct_id: str) -> dict | None:
    """One trial's public registry row, or None (no database, or not in the registry)."""
    return trials([nct_id]).get(nct_id)
