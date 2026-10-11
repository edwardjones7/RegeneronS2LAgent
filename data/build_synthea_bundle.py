"""Trim Synthea's raw CSV export into one small JSON bundle the browser can load.

Synthea writes ~1.7 GB of CSV for 2,000 patients. The matching engine only needs
demographics, conditions, medications, procedures, recent acute-care visits, a
year of weights and the latest value of a short list of labs and
vitals, so this keeps those and drops the rest (claims, costs, addresses, IDs).

Patients are grouped by the county Synthea placed them in. Counties stand in for
practices; no practice or doctor names are invented.

Usage:
    ./data/generate.sh  (or: python3 data/build_synthea_bundle.py <synthea csv folder> data/synthea-nj.json)
"""

from __future__ import annotations

import csv
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

# LOINC codes the trial criteria use. Latest value per patient is kept.
OBSERVATIONS = {
    "39156-5": "bmi",
    "8302-2": "height_cm",
    "29463-7": "weight_kg",
    "8480-6": "systolic_bp",
    "8462-4": "diastolic_bp",
    "4548-4": "hba1c",
    "2339-0": "glucose",
    "2345-7": "glucose",
    "2093-3": "cholesterol",
    "18262-6": "ldl",
    "2085-9": "hdl",
    "2571-8": "triglycerides",
    "38483-4": "creatinine",
    "2160-0": "creatinine",
    "33914-3": "egfr",
    "1742-6": "alt",
    "1920-8": "ast",
    "1975-2": "bilirubin",
    "6690-2": "wbc",
    "718-7": "hemoglobin",
    "777-3": "platelets",
    "19926-5": "fev1_fvc",
    "26449-9": "eosinophils",
    "711-2": "eosinophils",
    "72166-2": "smoking_status",
}


# Weight history window (for "weight change in the last 3 months") and the
# acute-care window (for "an asthma attack or COPD flare-up in the last 2 years").
WEIGHT_HISTORY_DAYS = 365
ACUTE_VISIT_DAYS = 3 * 365
ACUTE_CLASSES = {"emergency", "urgentcare", "inpatient"}


def day(value: str) -> str | None:
    return value[:10] if value else None


def clean_name(value: str) -> str:
    # Synthea appends digits to names ("Olen518") so they're unique; drop them.
    return re.sub(r"\d+", "", value).strip()


def rows(folder: Path, name: str):
    with open(folder / name, newline="") as f:
        yield from csv.DictReader(f)


def build(folder: Path) -> dict:
    patients: dict[str, dict] = {}
    for r in rows(folder, "patients.csv"):
        if r["DEATHDATE"]:
            continue
        patients[r["Id"]] = {
            "id": r["Id"],
            "name": f"{clean_name(r['FIRST'])} {clean_name(r['LAST'])}",
            "birthDate": r["BIRTHDATE"],
            "sex": r["GENDER"],
            "race": r["RACE"],
            "ethnicity": r["ETHNICITY"],
            "group": r["COUNTY"],
            "conditions": {},
            "medications": {},
            "procedures": {},
            "observations": {},
            "weights": [],
            "acuteVisits": [],
        }

    codes: dict[str, dict[str, str]] = {"snomed": {}, "rxnorm": {}, "loinc": {}}

    # Conditions and medications: one entry per code, earliest start, latest stop
    # (None while any episode is still active).
    for file, key, system in (
        ("conditions.csv", "conditions", "snomed"),
        ("medications.csv", "medications", "rxnorm"),
    ):
        for r in rows(folder, file):
            p = patients.get(r["PATIENT"])
            if not p:
                continue
            codes[system][r["CODE"]] = r["DESCRIPTION"]
            start, stop = day(r["START"]), day(r["STOP"])
            seen = p[key].get(r["CODE"])
            if not seen:
                p[key][r["CODE"]] = [start, stop]
                continue
            seen[0] = min(seen[0], start)
            seen[1] = None if seen[1] is None or stop is None else max(seen[1], stop)

    # Procedures: most recent date per code.
    for r in rows(folder, "procedures.csv"):
        p = patients.get(r["PATIENT"])
        if not p:
            continue
        codes["snomed"][r["CODE"]] = r["DESCRIPTION"]
        when = day(r["START"])
        if when > p["procedures"].get(r["CODE"], ""):
            p["procedures"][r["CODE"]] = when

    weights_since = (date.today() - timedelta(days=WEIGHT_HISTORY_DAYS)).isoformat()
    acute_since = (date.today() - timedelta(days=ACUTE_VISIT_DAYS)).isoformat()

    # Emergency, urgent care and hospital visits, with the reason recorded.
    for r in rows(folder, "encounters.csv"):
        p = patients.get(r["PATIENT"])
        when = day(r["START"])
        if not p or r["ENCOUNTERCLASS"] not in ACUTE_CLASSES or when < acute_since:
            continue
        p["acuteVisits"].append([when, r["ENCOUNTERCLASS"], r["DESCRIPTION"], r["REASONDESCRIPTION"] or None])

    # Observations: latest value per kept LOINC code, plus a year of weights.
    for r in rows(folder, "observations.csv"):
        field = OBSERVATIONS.get(r["CODE"])
        p = patients.get(r["PATIENT"])
        if not field or not p:
            continue
        codes["loinc"][r["CODE"]] = r["DESCRIPTION"]
        when = day(r["DATE"])
        if field == "weight_kg" and when >= weights_since:
            p["weights"].append([when, round(float(r["VALUE"]), 1)])
        seen = p["observations"].get(field)
        if seen and seen["date"] >= when:
            continue
        value: float | str = r["VALUE"]
        if r["TYPE"] == "numeric":
            value = round(float(value), 2)
        p["observations"][field] = {"value": value, "unit": r["UNITS"] or None, "date": when}

    out = []
    for p in patients.values():
        p["conditions"] = [[c, s, e] for c, (s, e) in sorted(p["conditions"].items())]
        p["medications"] = [[c, s, e] for c, (s, e) in sorted(p["medications"].items())]
        p["procedures"] = [[c, d] for c, d in sorted(p["procedures"].items())]
        p["weights"] = sorted(set(map(tuple, p["weights"])))
        p["weights"] = [list(w) for w in p["weights"]]
        p["acuteVisits"].sort()
        out.append(p)
    out.sort(key=lambda p: (p["group"], p["name"]))

    return {
        "source": "Synthea (https://github.com/synthetichealth/synthea), synthetic patients, no real people",
        "generated": {"seed": 42, "clinicianSeed": 42, "population": 2000, "state": "New Jersey"},
        "asOf": date.today().isoformat(),
        "groupBy": "county",
        "codes": codes,
        "patients": out,
    }


if __name__ == "__main__":
    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    bundle = build(src)
    dest.write_text(json.dumps(bundle, separators=(",", ":")))
    print(f"{len(bundle['patients'])} patients -> {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
