# Sample Patient Data for the Demo

How the patient data is made, what's in it, and how the matching engine should use it. Follows `.claude/AGENTS.MD` (section 5: privacy; section 6: three-state criteria; section 7: data).

**Decision (2026-10-10):** the demo runs on synthetic patients from **Synthea**.

Every number below was checked against `data/synthea-nj.json` on 2026-10-10.

---

## 1. Source and license

- Synthea: https://github.com/synthetichealth/synthea (Apache-2.0). It simulates patients' lives from birth, with realistic disease progression, medications, labs and visits.
- **No real people.** Names, addresses and records are all generated.
- The generated patients are ours, so the trimmed bundle is **committed**: `data/synthea-nj.json`.
- The Synthea jar and its raw output (about 1.7 GB of CSV) are gitignored under `data/synthea/`.

---

## 2. Generating

```bash
./data/generate.sh
```

This downloads the Synthea jar, generates the patients, and trims them into the bundle. Needs Java 17+ (`brew install openjdk@17`) and Python 3.9+. Generating takes about a minute and trimming about 3 seconds.

The exact Synthea command:

```bash
java -jar synthea-with-dependencies.jar -s 42 -cs 42 -p 2000 \
  --exporter.csv.export=true --exporter.fhir.export=false "New Jersey"
```

- `-s 42 -cs 42`: fixed seeds, so the same jar gives the same patients.
- `-p 2000`: 2,000 living patients. Synthea also generates patients who died; the trim step drops them.
- `"New Jersey"`: patients get New Jersey towns and counties.

**Reproducibility caveat:** the script downloads Synthea's always-updating `master-branch-latest` build. A newer build can produce different patients from the same seed. That's why the bundle itself is committed.

`data/build_synthea_bundle.py` does the trimming. It keeps demographics, conditions, medications, procedures, acute-care visits, a year of weights and about 20 labs and vitals. It drops addresses, SSNs, claims, costs and insurance.

**Supabase:** `supabase/seed_patients.py` loads the same bundle into the `patients` table, each patient linked to their practice. Run `supabase/migrations/` in the Supabase SQL editor first.

---

## 3. What's in it

| Fact | Value |
|---|---|
| Patients | 2,000, all living |
| Adults (18+) | 1,553 |
| Age | 0–110 (Synthea's simulation sometimes runs past 100). Cap at 90 anywhere ages leave the practice |
| Sex | 1,033 F / 967 M |
| Race | 1,446 white, 286 Black, 205 Asian, 33 other, 21 Native Hawaiian, 9 Native American |
| Ethnicity | 359 Hispanic |
| As-of date | 2026-10-10 (generation date). Records run up to that date, so "within the last N months" checks work against today |
| Size | 6 MB JSON, about 1 MB gzipped |

---

## 4. Record shape

```json
{
  "id": "4eae15cd-…",
  "name": "Adell Metz",
  "birthDate": "1961-11-29",
  "sex": "F", "race": "black", "ethnicity": "nonhispanic",
  "group": "Atlantic County",
  "conditions":  [["<SNOMED>", "start", "end or null"]],
  "medications": [["<RxNorm>", "start", "end or null"]],
  "procedures":  [["<SNOMED>", "latest date"]],
  "observations": { "bmi": { "value": 31.2, "unit": "kg/m2", "date": "2025-10-09" } },
  "weights":     [["date", kg]],
  "acuteVisits": [["date", "emergency | urgentcare | inpatient", "visit description", "reason or null"]]
}
```

- Code names are in the bundle's top-level `codes` object (`snomed`, `rxnorm`, `loinc`) and in the Supabase `codes` table.
- A condition or medication with a `null` end date is still active.
- `observations` hold the **latest** value only. Fields: `bmi`, `height_cm`, `weight_kg`, `systolic_bp`, `diastolic_bp`, `hba1c`, `glucose`, `cholesterol`, `ldl`, `hdl`, `triglycerides`, `creatinine`, `egfr`, `alt`, `ast`, `bilirubin`, `wbc`, `hemoglobin`, `platelets`, `fev1_fvc`, `eosinophils`, `smoking_status`.
- Units are US (mg/dL), as Synthea records them. Synthea has no reference ranges.

---

## 5. Criterion type → data

| Criterion type | Where | Notes |
|---|---|---|
| Age and sex | `birthDate`, `sex` | Always present |
| Diagnosis | `conditions` (SNOMED CT) | Match on codes or names. ICD-10 isn't in Synthea's CSV export |
| Medications | `medications` (RxNorm) | Match on ingredient names, not codes, so every strength and brand matches |
| Procedures | `procedures` (SNOMED CT) | Surgeries, spirometry, chemotherapy |
| Labs and vitals | `observations` | Latest value. Check its date against the criterion's window |
| Weight change | `weights` | Most patients are weighed about once a year |
| Exacerbations, attacks | `acuteVisits` + `medications` | "Emergency hospital admission for asthma" is explicit. Many urgent care visits have no reason |
| Smoking | `observations.smoking_status` | Text: "Never smoked tobacco", "Ex-smoker", "Smokes tobacco daily". No pack-years |

---

## 6. Gotchas

1. **Coverage varies a lot by field.** Height, weight, blood pressure, blood counts and smoking status: everyone. BMI: 1,945. Lipids: 1,224. Glucose and creatinine: 891. HbA1c: 794. eGFR: 440. Liver tests: about 297. FEV1/FVC: 41. Eosinophils: 25. A missing measurement is `UNKNOWN`, never a pass.
2. **Things Synthea doesn't model at all:** LAMA inhalers (tiotropium etc.), FeNO, family history, pack-years, cancer staging beyond stage 1 lung cancer, PD-L1, pregnancy plans. Protocol criteria that need them are `review` items (see `protocols/README.md`).
3. **Weights are sparse.** Only 109 patients have 2+ weights in the last 4 months. Weight-change criteria should exclude only when the record proves a change, otherwise confirm at screening.
4. **Visits often lack a reason.** Most urgent care visits record no reason. Jev questions about attacks or flare-ups should answer `UNKNOWN` for those, not guess.
5. **Some patients are children.** 447 are under 18. Most trial age criteria exclude them.
6. **Missing record = pass, for exclusions only.** No diabetes diagnosis on file is read as not diabetic. Never apply this to inclusions.

---

## 7. Practices = county groups

Synthea assigns each patient to a real New Jersey hospital or clinic, about 1,300 of them, with at most 29 patients each. Using those would spread patients too thin and put claims about real organizations in the demo. Instead, **each patient's county is their practice**:

| County | Patients | | County | Patients |
|---|---|---|---|---|
| Middlesex | 200 | | Somerset | 90 |
| Bergen | 194 | | Atlantic | 73 |
| Monmouth | 166 | | Mercer | 72 |
| Essex | 164 | | Gloucester | 65 |
| Ocean | 138 | | Sussex | 39 |
| Hudson | 134 | | Cape May | 29 |
| Passaic | 117 | | Cumberland | 29 |
| Burlington | 110 | | Hunterdon | 28 |
| Camden | 107 | | Warren | 27 |
| Union | 107 | | Salem | 9 |
| Morris | 102 | | | |

- **Doctor view:** pick one county, e.g. Middlesex (200 patients). Say in the demo that practices are county groups of synthetic patients.
- **Sponsor rollup:** per-county counts. With small-cell suppression at 5, small counties (Salem) show as suppressed for most trials, which demonstrates the privacy rule.
- No practice or doctor names are invented. If any are added for the demo, label them illustrative.

---

## 8. Patients per demo trial

The four trials are in `protocols/`. These counts are from the plain-code criteria across all 2,000 patients (Jev criteria still pending):

| Trial | Candidates | Needs chart review | Waiting on Jev | Demo role |
|---|---|---|---|---|
| NCT07685808 olatorepatide, obesity | 760 | 109 | – | Fills |
| NCT07309614 dupilumab, asthma | – | – | 75 | Fills, with chart review |
| NCT07053423 dupilumab, COPD | – | – | 20 | Partly fills |
| NCT06931717 cemiplimab, lung cancer after surgery | 0 | 0 | 0 | Can't fill |

---

## 9. Out of hackathon scope (for "what's next")

| Next step | Resource |
|---|---|
| Real EHR integration (FHIR R4) | Synthea can also export FHIR (`--exporter.fhir.export=true`) to prototype against. **SMART Health IT launcher** (https://launch.smarthealthit.org/) and the **Epic sandbox** (https://fhir.epic.com/) for real EHR APIs |
| Real-world messy data | **MIMIC-IV demo**, 100 de-identified patients, open access: https://physionet.org/content/mimic-iv-demo/ (FHIR version: https://physionet.org/content/mimic-iv-fhir-demo/) |
| Benchmark against expert review | **TREC Clinical Trials 2021/2022**: 125 patient cases with expert eligibility labels against real trials. https://www.trec-cds.org/2021.html, https://www.trec-cds.org/2022.html. Processed copies in https://github.com/ncbi-nlp/TrialGPT |
