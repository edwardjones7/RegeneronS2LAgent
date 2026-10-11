# Clinical Trials Ingestion (ClinicalTrials.gov)

Goal: fetch clinical trials from ClinicalTrials.gov and store them so a matching algorithm can check which patients (from doctors' EHRs) qualify for which trials.

**Approach:** don't scrape. Use the free, public ClinicalTrials.gov API v2 (JSON, no API key). Store trials in **Postgres + pgvector** (hybrid structured + semantic). Use an LLM once at ingest to turn free-text eligibility criteria into structured rules.

All API parameters below were verified live on 2026-10-10 (API version 2.0.5).

---

## 1. Fetching

**Endpoints**
- Search: `GET https://clinicaltrials.gov/api/v2/studies`
- Single study: `GET https://clinicaltrials.gov/api/v2/studies/{NCTId}`
- Data freshness: `GET https://clinicaltrials.gov/api/v2/version` → `dataTimestamp`

**Key query parameters**

| Param | Use |
|---|---|
| `filter.overallStatus=RECRUITING,NOT_YET_RECRUITING` | Only trials that can enroll patients |
| `filter.geo=distance(lat,lon,50mi)` | Trials near the doctors' sites |
| `query.cond=...` / `query.term=...` | Conditions in the patient panel |
| `query.spons=Regeneron` | Scope to one sponsor (optional) |
| `filter.advanced=AREA[StudyType]INTERVENTIONAL AND AREA[LastUpdatePostDate]RANGE[2026-10-01,MAX]` | Interventional trials only; the date range enables incremental syncs |
| `fields=...` | Return only the modules needed |
| `pageSize=1000` + `pageToken` | Pagination |
| `countTotal=true` | Total result count |

Example (verified): Regeneron-sponsored, recruiting, interventional, within 50 mi of NYC, updated since 2026-09-01 → 23 trials.

```bash
curl -s -G "https://clinicaltrials.gov/api/v2/studies" \
  --data-urlencode "query.spons=Regeneron" \
  --data-urlencode "filter.overallStatus=RECRUITING,NOT_YET_RECRUITING" \
  --data-urlencode "filter.geo=distance(40.7128,-74.0060,50mi)" \
  --data-urlencode "filter.advanced=AREA[StudyType]INTERVENTIONAL AND AREA[LastUpdatePostDate]RANGE[2026-09-01,MAX]" \
  --data-urlencode "countTotal=true"
```

Note: URL-encode parameters (`curl -G --data-urlencode` or `requests` params). Raw `[`, `]` and spaces break the request.

**Constraints**
- Rate limit: about 50 requests per minute per IP. Sleep about 1.3 s between pages.
- Daily refresh: compare `/version` `dataTimestamp` to the last sync. Re-pull studies with `LastUpdatePostDate` after the last sync.
- Bulk alternative: **AACT** (aact.ctti-clinicaltrials.org) is a free Postgres mirror of the full registry. Use it if every trial is needed, not a filtered subset.

**Fetcher sketch**

```python
import requests, time

BASE = "https://clinicaltrials.gov/api/v2/studies"

def fetch_trials(params):
    token = None
    while True:
        p = {**params, "pageSize": 1000, **({"pageToken": token} if token else {})}
        r = requests.get(BASE, params=p, timeout=30)
        r.raise_for_status()
        data = r.json()
        yield from data["studies"]
        token = data.get("nextPageToken")
        if not token:
            break
        time.sleep(1.3)  # stay under ~50 req/min
```

---

## 2. Data to pull

Module names are what go in the `fields=` parameter.

| Module | Key fields | Why |
|---|---|---|
| `IdentificationModule` | `nctId`, `briefTitle`, `officialTitle` | Primary key and display |
| `StatusModule` | `overallStatus`, `lastUpdatePostDate`, start/completion dates | Freshness; skip closed trials |
| `ConditionsModule` | `conditions`, `keywords` | First-pass match against patient diagnoses |
| `ConditionBrowseModule` (under `derivedSection`) | MeSH IDs + ancestor terms | Normalized condition codes; map to ICD-10/SNOMED in the EHR |
| **`EligibilityModule`** | `eligibilityCriteria` (free text), `minimumAge`, `maximumAge`, `sex`, `healthyVolunteers`, `stdAges` | Core of matching |
| `DesignModule` | `studyType`, `phases`, enrollment | Filtering and prioritization |
| `ArmsInterventionsModule` | Interventions (drug names, types) | Exclusions such as prior therapy or drug interactions |
| `ContactsLocationsModule` | `locations[]` (facility, city, zip, geoPoint, **per-site `status`**), contacts, PI | Match trial sites to doctors; referral contacts |
| `SponsorCollaboratorsModule` | `leadSponsor` | Sponsor filtering |
| `DescriptionModule` | `briefSummary` | Embedding text; plain-language text for the voice agent |

**Gotchas**
- Per-site status ≠ overall status. A trial can be recruiting overall while the site near the doctor is closed. Filter on `locations[].status`.
- Ages are strings (`"30 Years"`, `"6 Months"`). Normalize them to numbers at ingest.
- Note: the field name is `ContactsLocationsModule`. `LocationsModule` is rejected by the API.

---

## 3. Storage and matching pipeline

`eligibilityCriteria` is unstructured. Real example:

> `* Control HbA1c > 5.7, T2DM HbA1c > 9` · `* Subjects taking beta blockers, calcium channel blockers, insulin...` · `* Peri or post-menopausal women`

**Pipeline**

1. **Ingest:** store the raw JSON plus normalized columns in Postgres. Run an LLM once per trial to split the criteria into structured rules, for example:
   - `{type: "exclusion", category: "lab", test: "HbA1c", op: ">", value: 9, loinc: "4548-4"}`
   - `{type: "exclusion", category: "medication", class: "beta blocker"}`

   Cache the result by `nctId` + `lastUpdatePostDate` so only changed trials are re-parsed.
2. **Hard filters (SQL):** status, a site near the doctor, age, sex. Cuts tens of thousands of trials down to dozens per patient.
3. **Semantic retrieval (pgvector):** embed each trial's conditions, summary and criteria, and an EHR summary for each patient (problems, meds, labs). Keep the top K trials.
4. **LLM check, criterion by criterion:** compare each structured rule to the patient's EHR. Return **met / not met / unknown**, citing EHR evidence. This is the TrialGPT approach from NIH.

**Unknowns feed the voice agent:** criteria the EHR can't answer ("currently pregnant?", "exercises < 1 hr/week?") become pre-screen questions for the outbound call. Final eligibility belongs to the research team (see `project-brief.json`).

**Suggested tables**
- `trials`: normalized fields, raw JSON, embedding
- `trial_sites`: one row per location (geo, status, contacts)
- `trial_criteria`: parsed rules
- `patient_trial_matches`: scores, per-criterion verdicts, evidence
