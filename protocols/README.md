# Trial protocols

One JSON file per trial. Each file lists the trial's key eligibility criteria and says how each one gets decided against a patient in `data/synthea-nj.json`.

These are **real, recruiting trials from ClinicalTrials.gov that Regeneron sponsors or collaborates on, simplified for the demo, not the full protocols.** Check each file's `sponsor` and `collaborators`: only NCT07685808 is led by Regeneron. Each file keeps the key criteria. Full protocols also have consent, pregnancy and run-in rules, which a coordinator handles at screening.

| File | Trial | Demo role |
|---|---|---|
| `NCT07685808.json` | Olatorepatide for overweight or obesity without diabetes | Fills |
| `NCT07309614.json` | Dupilumab for clinical remission in asthma | Fills, with lots of chart review |
| `NCT07053423.json` | Dupilumab for airway inflammation in COPD | Partly fills |
| `NCT06931717.json` | Adjuvant cemiplimab after lung cancer surgery | Can't fill |

## Results

Every criterion returns one of three results, never two:

- `MATCH`: the record shows the patient meets it.
- `NO_MATCH`: the record shows they don't.
- `UNKNOWN`: the record can't settle it. Shown to the doctor as "needs chart review", never counted as a pass.

For each trial, a patient lands in one of three buckets, based on the `code` and `jev` criteria only:

- **Pre-screen candidate:** every `code` and `jev` criterion is `MATCH`.
- **Needs chart review:** none is `NO_MATCH`, but at least one is `UNKNOWN`.
- **Not a match:** at least one is `NO_MATCH`.

`review` criteria don't affect the bucket. No record contains them for anyone (a family history, a test done at the screening visit), so counting them would put every patient in chart review. Instead they're listed on every candidate as "confirm at screening".

Show the doctor the split, for example `14 candidates, 6 need chart review`, and never hide the chart-review bucket. Never say a patient "qualifies"; only a screening visit decides that.

## Criterion fields

| Field | Meaning |
|---|---|
| `id` | Stable key, used in the UI and in Jev question names |
| `type` | `inclusion` or `exclusion` |
| `text` | The criterion in plain words, close to the registry wording |
| `check` | Who decides it: `code`, `jev` or `review` (below) |
| `rule` | For `code`: the test to run |
| `question` | For `jev`: what to ask |
| `reason` | For `review`: why the data can't settle it |
| `unknownAs` | Optional: the result to use when the rule is `unknown` (see below) |
| `notes` | Optional: explains a choice in the rule |

### `check: "code"`, decided in the browser

The `rule` evaluates to `true`, `false` or `unknown`, and the criterion type maps that to a result:

| Rule | Inclusion | Exclusion |
|---|---|---|
| `true` | `MATCH` | `NO_MATCH` |
| `false` | `NO_MATCH` | `MATCH` |
| `unknown` | `UNKNOWN` | `UNKNOWN` |

A criterion can set `unknownAs` to override the last row. For example, `"unknownAs": "MATCH"` on an exclusion means "exclude only when the record proves it, otherwise confirm at screening".

`condition`, `medication` and `procedure` rules return `false` when nothing matching is on file, never `unknown`. So **a missing record counts as a pass for exclusions**: no diabetes diagnosis on file means "not diabetic". This is how pre-screening normally works, and it's listed in the README limits. Rules on measured values (`observation`, `weightChange`) return `unknown` when the value is missing.

Rule types:

| `rule.type` | Fields | True when |
|---|---|---|
| `age` | `gte`, `lt` | Age in whole years, as of the bundle's `asOf` date, is in range |
| `condition` | `codes` (SNOMED), `names` (regex, case-insensitive), optional `active`, `minDurationMonths`, `withinMonths` | The patient has a matching diagnosis. `active`: it has no end date. `minDurationMonths`: it started at least that long ago. `withinMonths`: it was active at any point in that window |
| `medication` | `names` (regex, case-insensitive), optional `active`, `withinMonths` | A matching medication was prescribed. Names, not RxNorm codes, so every strength and brand matches |
| `procedure` | `codes` (SNOMED), `names` (regex), optional `withinMonths` | A matching procedure was done |
| `observation` | `field` (a key in `patient.observations`), `gte`, `gt`, `lte`, `lt`, optional `maxAgeMonths` | The latest value is in range. Missing, or older than `maxAgeMonths` → unknown |
| `observationIn` | `field`, `values` | The latest text value is one of `values` |
| `weightChange` | `moreThanKg`, `withinMonths` | Highest minus lowest weight in the window is more than `moreThanKg`. Fewer than 2 weights in the window → unknown |
| `anyOf` / `allOf` | `rules` | Combine rules. Unknown parts follow three-valued logic: `anyOf` is true if any part is true, false only if all parts are false |

### `check: "jev"`, decided by the Jev evaluation model

For criteria that need judgment across several parts of the record. The engine builds a **de-identified** text summary of the patient and sends it with the question to `typesafe-ai/jev` through the Vercel AI Gateway (`experimental_decide` in the AI SDK).

- **The summary includes:** age (capped at 90), sex, and the record sections listed in `question.uses`.
- **Dates become relative time,** for example "about 14 months ago". Exact dates are never sent.
- **Never sent:** name, patient ID, birth date or county.

`question.instructions` is passed to Jev as-is. Jev answers with a choice of `MATCH`, `NO_MATCH` or `UNKNOWN`, and the instructions tell it when to choose `UNKNOWN`.

### `check: "review"`, not in the data

Never evaluated, and doesn't affect the bucket (see Results). The `reason` is shown on every candidate so the doctor knows what to confirm from the chart or at screening.
