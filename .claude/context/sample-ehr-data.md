# Sample Patient Data for the Demo

How to get, load and use patient data for the matching engine. Follows `AGENTS.md` (section 5: privacy and browser-only; section 6: three-state criteria; section 7: data).

**Decision:** the demo runs on the **CDISC SDTM/ADaM pilot dataset** (`CDISCPILOT01`). No backend, no database, no LLM matching. Synthea, MIMIC and FHIR are out of hackathon scope; see the last section.

Everything below was checked against the actual files on 2026-10-10.

---

## 1. Source and license

- Repo: https://github.com/cdisc-org/sdtm-adam-pilot-project
- **Not MIT. Do not commit the data.** CDISC terms of use (repo `README.md`) say:
  - attribution back to CDISC is required
  - no selling or distributing it for a fee
  - no modifying or altering the data
- Handling:
  1. A setup script downloads the files into `/data/cdisc/`. That folder is in `.gitignore`.
  2. Keep the downloaded files byte-for-byte as published. Reshape them into patient records **in memory at load time**, not as edited copies on disk.
  3. Write the provenance and attribution in `/docs/data.md`: source URL, CDISC credit, terms of use, date fetched.

---

## 2. Fetching

The repo ships every SDTM domain as **CDISC Dataset-JSON 1.1**, next to the `.xpt` files. Use the JSON. No SAS transport parser is needed, so no extra dependency.

Base URL:

```
https://raw.githubusercontent.com/cdisc-org/sdtm-adam-pilot-project/master/updated-pilot-submission-package/900172/m5/datasets/cdiscpilot01/tabulations/sdtm/
```

| File | Size | Load? | What it is |
|---|---|---|---|
| `dm.json` | 78 KB | yes | Demographics, one row per subject |
| `mh.json` | 396 KB | yes | Medical history (diagnoses) |
| `cm.json` | 1.3 MB | yes | Concomitant medications |
| `lb.json` | 10.5 MB | yes | Labs, every visit |
| `ti.json` | 5 KB | as a fixture | The pilot trial's own 31 inclusion/exclusion criteria |
| `ts.json` | 4 KB | optional | Trial summary (indication, phase, age limits) |
| `vs.json` | 6 MB | optional | Vital signs (blood pressure, weight, height) |
| `qs.json` | 24 MB | no | Questionnaires (ADAS-Cog, NPI-X). Too large and not needed. |

About 12 MB in the browser for `dm`, `mh`, `cm` and `lb`. Parse in the Web Worker, not on the main thread.

**Dataset-JSON shape:** column definitions and rows are stored separately. Zip them into objects:

```ts
const cols = json.columns.map((c: { name: string }) => c.name);
const records = json.rows.map((r: unknown[]) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
```

Join every domain on `USUBJID`.

---

## 3. What's in it (verified)

| Fact | Value |
|---|---|
| Subjects in `DM` | 306 |
| **Usable subjects** | **254**. The 52 with `ARM = "Screen Failure"` have DM rows only, with no MH, CM or LB. Exclude them and say so in `/docs`. |
| Sites (`SITEID`) | 17 |
| Age | 50–89 (the pilot trial enrolled only patients aged 50+) |
| Sex | 179 F / 127 M (all 306 subjects) |
| Race | 273 White, 29 Black, 2 American Indian, 2 Asian |
| Primary diagnosis | **Everyone has Alzheimer's disease** (`MHCAT = PRIMARY DIAGNOSIS`) |
| Data dates | 2012–2014 |
| Country | USA only |

This is a population of elderly Alzheimer's patients, not a general practice panel. The demo protocols have to target conditions that actually appear in it (section 7).

---

## 4. Domain → criterion type mapping

Matches the computable list in AGENTS.md section 6.

| Criterion type | Domain and fields | Notes |
|---|---|---|
| Age | `DM.AGE` (years) | Clean, always present |
| Sex | `DM.SEX` (`M`/`F`) | Clean. "Postmenopausal" is not recorded → `UNKNOWN` for women unless age-based rules are hand-authored |
| Diagnosis | `MH.MHDECOD` (MedDRA preferred term), `MH.MHBODSYS` (body system), `MH.MHSTDTC` (start date) | **MedDRA, not ICD-10.** See gotcha 1 |
| Labs vs threshold | `LB.LBTESTCD`, `LB.LBSTRESN` (SI result), `LB.LBSTNRLO` / `LB.LBSTNRHI` (reference limits), `LB.LBBLFL` (baseline flag), `LB.LBDTC` | Reference limits present on every row. The Hy's Law ratio pattern works directly |
| Medications | `CM.CMDECOD` (WHO Drug name), `CM.CMTRT` (as reported), `CM.CMCLAS` (ATC class), `CM.CMSTDTC` / `CM.CMENDTC` | 81% uncoded. See gotcha 3 |
| Date windows | `MH.MHSTDTC`, `CM.CMSTDTC`, `LB.LBDTC` | Partial dates. See gotcha 2 |
| Vitals (optional) | `VS.VSTESTCD` (e.g. `SYSBP`, `DIABP`, `WEIGHT`, `HEIGHT`), `VS.VSSTRESN` | Repeated by visit and position |

**Lab tests available (`LBTESTCD`):** ALB, ALP, ALT, AST, BASO, BILI, BUN, CA, CHOL, CK, CL, CREAT, EOS, GGT, GLUC, HBA1C, HCT, HGB, K, LYM, MCH, MCHC, MCV, MONO, PHOS, PLAT, PROT, RBC, SODIUM, TSH, URATE, VITB12, WBC, plus urinalysis and cell-morphology codes.
- Not present: folate, eGFR, LDL, troponin.
- eGFR is computable from `CREAT` (µmol/L ÷ 88.4 = mg/dL) plus age and sex using CKD-EPI 2021. Write it as one function in `/engine` and test it.

---

## 5. Gotchas the engine has to handle

1. **Diagnoses are MedDRA, not ICD-10.** AGENTS.md section 6 says "Diagnosis codes (ICD-10)". For this dataset, protocol JSON should match on MedDRA preferred terms (`MHDECOD`, e.g. `"HYPERTENSION"`, `"DIABETES MELLITUS NON-INSULIN-DEPENDENT"`) or on body system (`MHBODSYS`). Leave room for an `icd10` field for the FHIR path later. **Team should update AGENTS.md section 6 to match.**
2. **Partial or missing dates.** `MHSTDTC`: 859 of 1,818 rows empty, 517 year only, 131 year-month, 311 full date. `CMSTDTC` is mostly year only. A date-window criterion ("within the last 5 years") must:
   - decide when even the partial date settles it (e.g. `"2001"` is clearly more than 5 years before a 2013 as-of date)
   - return `UNKNOWN` when it doesn't, or when the date is missing.

   This produces real `UNKNOWN`s for the demo, which is what AGENTS.md wants.
3. **Medications are 81% uncoded** (6,085 of 7,510 rows have `CMDECOD = "UNCODED"`). Raw names look like `"TYLENOL"` and `"NEOSPORIN /USA/"`. Each medication criterion in a protocol should list both generic and brand names and match case-insensitively on `CMTRT` and `CMDECOD`.
   - Decide as a team: does having no CM record for a drug count as "not taking it" (a pass)? Pre-screening usually treats it that way. Whatever the choice, write it in the README limits.
4. **Anchor "as-of" to the data, not today.** All dates are 2012–2014. Measured from 2026, every "within N months" check fails. Use each subject's screening date (`DM.DMDTC`) as their as-of date, and pick labs from on or before it. In practice that means the baseline labs (`LBBLFL = "Y"`, which 253 subjects have).
5. **HbA1c is nearly absent.** Only 8 subjects have it, stored as a fraction (upper limit `0.112`, i.e. 11.2%). HbA1c criteria will be `UNKNOWN` for almost everyone. That's honest, but don't build the headline demo trial around HbA1c. `GLUC` (mmol/L) has full coverage.
6. **Lab units are SI** in `LBSTRESN` (bilirubin and creatinine in µmol/L, glucose and cholesterol in mmol/L). Write protocol thresholds in SI or as multiples of the upper limit of normal (`LBSTRESN / LBSTNRHI`), never in US units.
7. **Everyone was in a trial.** `DM.ARM` and the `EX` domain hold the pilot's own xanomeline or placebo assignment. Don't load `EX` or show the arm. It isn't practice data.

---

## 6. Practices = sites

There's no practice or doctor data in SDTM. Use `SITEID` as the practice. That supports both the doctor view and the sponsor rollup.

**Usable patients per site** (screen failures excluded):

| Site | 701 | 710 | 704 | 708 | 716 | 709 | 703 | 705 | 718 | 713 | 715 | 717 | 714 | 711 | 706 | 707 | 702 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Patients | 41 | 31 | 25 | 25 | 24 | 21 | 18 | 16 | 13 | 9 | 8 | 7 | 6 | 4 | 3 | 2 | 1 |

- **Doctor view:** use site 701 (41 patients), or all 254 pooled as one larger practice if per-trial counts are too thin. Say which one in the demo.
- **Sponsor rollup:** per-site counts. With small-cell suppression at 5, most sites will show as suppressed for anything but common conditions. That demonstrates the privacy rule working.
- Practice names, doctor names and locations are not in the data. Any names or map locations added for the demo must be made up and labelled illustrative in `/docs`.

---

## 7. Choosing the 3–5 demo protocols

Hand-author them as JSON (AGENTS.md section 7). Pick conditions that exist in this population so the counts are real.

**Subjects per MedDRA term (`MHDECOD`):**

| Condition | Subjects |
|---|---|
| Hypertension | 62 |
| Myocardial infarction | 22 |
| Hypothyroidism | 21 |
| Osteoarthritis | 20 |
| Glaucoma | 19 |
| Benign prostatic hyperplasia | 18 |
| Hypercholesterolaemia | 16 |
| Diabetes (all diabetes terms) | 14 |
| COPD | 7 |
| Depression | 7 |
| Asthma | 4 |
| Psoriasis | 2 |
| Atopic dermatitis | 1 |

**Suggested mix,** to land the "five trials, you can fill two" beat from the demo script (AGENTS.md section 11):
- **2 that fill:** e.g. a cardiometabolic trial (hypertension or hypercholesterolaemia, using `CHOL` and creatinine/eGFR thresholds) and a hypothyroidism or osteoarthritis trial.
- **1–2 that partly fill:** many patients blocked by `UNKNOWN`. Use a date-window or HbA1c criterion to drive the "needs chart review" count.
- **1 that can't fill:** e.g. a Dupixent-style atopic dermatitis trial (1 subject). It shows the engine filtering trials out instead of just ranking them.

If a protocol is modelled on a real NCT trial, cite the NCT ID and label it "simplified for demo, not the real protocol" (AGENTS.md section 8: claims discipline).

**Free test fixture:** `ti.json` is the pilot trial's real criteria list: 8 inclusion and 23 exclusion criteria. It's a ready-made worked example of AGENTS.md section 6's computable vs human split:

| Criterion | Text | Engine result |
|---|---|---|
| INCL01 | Males and postmenopausal females ≥ 50 | Age and sex computable; "postmenopausal" → `UNKNOWN` |
| INCL03 | MMSE score 10–23 | `UNKNOWN`, MMSE not in the loaded domains |
| EXCL15 | Syncope within 5 years | MH date window, often `UNKNOWN` (partial dates) |
| EXCL27 | Creatinine, bilirubin, AST, ALT above reference range | Computable from `LB` vs `LBSTNRHI` |
| EXCL28 | B12 and thyroid tests out of range | Computable (`VITB12`, `TSH`); folate missing → `UNKNOWN` |
| EXCL30 | HbA1c above range (insulin-dependent diabetics only) | Mostly `UNKNOWN` (HbA1c on 8 subjects) |
| INCL06, INCL08, EXCL26 | Consent, caregiver, communication | Human only |

Since all 254 usable subjects were enrolled in this trial, running it is also a sanity check: the engine should return **no `NO_MATCH`** on the computable criteria. Any `NO_MATCH` means a bug or a data-quality issue worth looking at.

---

## 8. Out of hackathon scope (for "what's next")

These line up with the honest limits in AGENTS.md section 12. Mention them in the README and the deck; don't build them now.

| Next step | Resource |
|---|---|
| Real EHR shape (FHIR R4, ICD-10/SNOMED, RxNorm, LOINC) | **Synthea** synthetic patients: https://synthetichealth.github.io/synthea-sample-data/. Java 17 is installed locally if someone wants to try it. |
| Real-world messy data | **MIMIC-IV demo**, 100 de-identified patients, open access: https://physionet.org/content/mimic-iv-demo/ (FHIR version: https://physionet.org/content/mimic-iv-fhir-demo/) |
| Benchmark against expert review | **TREC Clinical Trials 2021/2022**: 125 patient cases with expert eligibility labels against real trials. https://www.trec-cds.org/2021.html, https://www.trec-cds.org/2022.html. Processed copies in https://github.com/ncbi-nlp/TrialGPT |
| EHR integration | **SMART Health IT launcher** (https://launch.smarthealthit.org/) and **Epic sandbox** (https://fhir.epic.com/) |
