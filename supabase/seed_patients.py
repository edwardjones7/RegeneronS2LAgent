"""Load data/synthea-nj.json into Supabase: practices, patients and codes.

Run supabase/migrations/0001_practices_patients.sql first. Uses the secret key, which bypasses
row-level security, so run it only from a trusted machine. Safe to re-run:
rows are upserted by primary key.

Usage (from the repo root, with SUPABASE_URL and SUPABASE_SECRET_KEY set in site/.env or the root .env):
    python3 supabase/seed_patients.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATCH = 250


def read_env(path: Path) -> dict[str, str]:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def slug(county: str) -> str:
    return re.sub(r"[^a-z]+", "-", county.lower().replace(" county", "")).strip("-")


def upsert(url: str, key: str, table: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH):
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}",
            data=json.dumps(rows[i : i + BATCH]).encode(),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            urllib.request.urlopen(req, timeout=60).close()
        except urllib.error.HTTPError as e:
            sys.exit(f"{table}: HTTP {e.code} {e.read().decode()[:500]}")
    print(f"{table}: {len(rows)} rows")


def main() -> None:
    env = {}
    for path in (ROOT / ".env", ROOT / "site" / ".env"):  # site/.env wins
        if path.exists():
            env.update(read_env(path))
    url, key = env.get("SUPABASE_URL", "").rstrip("/"), env.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SECRET_KEY in site/.env (or the root .env)")

    bundle = json.loads((ROOT / "data" / "synthea-nj.json").read_text())
    patients = bundle["patients"]

    practices = {p["group"]: slug(p["group"]) for p in patients}
    upsert(url, key, "practices", [{"id": pid, "name": name} for name, pid in sorted(practices.items())])

    upsert(url, key, "codes", [
        {"system": system, "code": code, "description": text}
        for system, table in bundle["codes"].items()
        for code, text in table.items()
    ])

    clinical = ("conditions", "medications", "procedures", "observations", "weights", "acuteVisits")
    upsert(url, key, "patients", [
        {
            "id": p["id"],
            "practice_id": practices[p["group"]],
            "name": p["name"],
            "birth_date": p["birthDate"],
            "sex": p["sex"],
            "race": p["race"],
            "ethnicity": p["ethnicity"],
            "record": {k: p[k] for k in clinical},
        }
        for p in patients
    ])


if __name__ == "__main__":
    main()
