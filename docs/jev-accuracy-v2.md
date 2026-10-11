# Jev pre-screening accuracy: v2 (Gemini-structured criteria)

Date: 2026-10-11. Pipeline: `site/scripts/match.ts` on branch `jev-matcher`, Jev `typesafe/jev-1.13`. Previous test: `docs/jev-accuracy-poc.md` (v1).

## 1. Result in 5 lines

1. v2 is better than v1 on cost, speed, prefilter recall and bucket honesty. It does not yet give lung-trial candidates.
2. Cost fell from $0.0706 to $0.0121 (−83%) for the same practices. Jev calls fell from 684 to 142.
3. Code-decided answers agreed with the reference 100/100. Jev-only answers agreed 547/569 (96%). Overall agreement stayed near 90% (726/809).
4. Asthma not_match fell from 33 to 8 pairs, and review rose from 4 to 28. Asthma, COPD and NSCLC still have 0 candidates.
5. The new main error source is Gemini code checks. "small cell", "cancer" and "bronchitis" match the trial's own diagnosis and reject patients.

## 2. What we tested

- Same sample as v1: Hudson, Middlesex, Somerset, Mercer and Monmouth for asthma (NCT07309614), COPD (NCT07053423) and NSCLC (NCT06931717). Hudson only for obesity (NCT07685808).
- Data came from Supabase. All 142 patient IDs exist in the v1 reference file.
- Pairs: 142 in v2 and 105 in v1. 104 pairs are in both.
  - Obesity: +38 pairs. The prefilter now uses BMI ≥ 25. It keeps 85 of 85 true patients (v1: 53 of 85). 6 extra pairs have BMI 25–27.
  - Asthma: −1 pair. That patient had no active asthma.
  - COPD and NSCLC: the same pairs. All patients outside the age range were correctly left out.
- Reference: `ref.py` runs the hand-authored `check: "code"` rules in `protocols/*.json`.
- Paid runs: 5 (one per practice). Real cost: **$0.0121**. The dry-run estimate was $0.0118.

Mapping from each hand-authored rule to the Gemini criterion IDs:

| Trial | Hand-authored → Gemini |
|---|---|
| Obesity | bmi → g1 (inc_1 OR inc_2); no_diabetes → exc_1; stable_weight → exc_2; no_bariatric_surgery → exc_3; no_pancreas_gallbladder → exc_4 |
| Asthma | age → inc_1; asthma_6_months → inc_2; no_current_smoking → exc_2; no_other_lung_disease → exc_8; no_recent_cancer → exc_10; no_biologic → exc_11; not_already_eligible_for_dupixent → exc_12 (tagged administrative, so not evaluated) |
| COPD | age → inc_2; copd → inc_1; smoking_history → inc_3; airflow_obstruction → inc_4 (tagged screening, so not evaluated); no_asthma → exc_1; no_other_lung_disease → exc_2 AND exc_5; no_biologic → exc_6 |
| NSCLC | age → inc_12; nsclc → inc_1; complete_resection → inc_3 AND g1 (inc_4 OR inc_5); no_prior_systemic_treatment → exc_3; no_recent_mi → exc_9; no_organ_transplant → exc_15 |

We give one answer for each hand-authored rule. A multi-ID rule combines its parts with AND or OR. A criterion sent to review counts as `unknown`.

## 3. v1 vs v2

### Criterion accuracy

| Measure | v1 | v2 |
|---|---|---|
| All pairs | 555/620 (90%), one answer per auto-split ID | 726/809 (90%) |
| The 104 pairs in both, same scoring | 536/595 (90%) | 544/619 (88%) |
| Decided by code | none | 100/100 (100%) |
| Decided by Jev only | 555/620 | 547/569 (96%) |
| Code and Jev combined (multi-ID rules) | none | 79/92 (86%) |
| Sent to review (not evaluated) | none | 0/48 |
| Without the 2 review-tagged rules | none | 726/761 (95%) |

Agreement per trial in v2: obesity 443/455 (97%), asthma 213/252 (85%), COPD 55/84 (65%) and NSCLC 15/18 (83%). 36 of the 39 asthma misses are exc_12, which went to review.

v2 confusion matrix (rows: reference, columns: v2), 809 answers:

| Reference ↓ / v2 → | accept | reject | unknown |
|---|---|---|---|
| accept | 686 | 2 | 62 |
| reject | 8 | 35 | 11 |
| unknown | 0 | 0 | 5 |

### Buckets (candidate / review / not_match)

| Trial | v1 | v2 | Reference (v2 pairs) | Same bucket v1 | Same bucket v2 |
|---|---|---|---|---|---|
| Obesity | 37 / 0 / 16 | 58 / 9 / 24 | 50 / 5 / 36 | 49/53 | 79/91 |
| Asthma | 0 / 4 / 33 | 0 / 28 / 8 | 33 / 0 / 3 | 4/37 | 3/36 |
| COPD | 0 / 0 / 12 | 0 / 0 / 12 | 4 / 0 / 8 | 8/12 | 8/12 |
| NSCLC | 0 / 0 / 3 | 0 / 0 / 3 | 0 / 0 / 3 | 3/3 | 3/3 |
| All | | | | 64/105 (61%) | 93/142 (65%) |

The reference bucket is weak. It uses only the code rules. It ignores ICS dose, attack history, triple therapy and labs. So a "different bucket" is often a correct extra check.

Each v2 not_match, checked by hand:

- **Obesity, 24:** all correct. 10 have diabetes (code). 14 fail the BMI rule (code and Jev).
- **COPD, 12:** all correct. No patient has a LAMA inhaler, so the triple-therapy group (g1) fails. 6 never-smokers also fail inc_3 correctly. But 6 also have a **wrong** code reject on exc_4.
- **NSCLC, 3:** correct bucket. Correct reasons: prior cisplatin and paclitaxel (exc_3) and eGFR under 10 (inc_14). Wrong reasons: code rejects on exc_2 and exc_5 for all 3.
- **Asthma, 8:** 3 are correct and 1 is plausible (no attack in the record). 4 are wrong: 3 come from exc_7 and 1 from exc_2.

Review results:

- **Obesity, 9:** all are unknown on the BMI group. 5 have a BMI older than 24 months. 4 have BMI 27–30 and no comorbidity. Jev rejected these 4 below p = 0.6, so they became unknown. They should be not_match.
- **Asthma, 28:** inc_7 (stable medium-dose ICS with adherence) is unknown in all 28. inc_6 (an attack in 2 years) is unknown in 19. The record has no daily dose or attack details, so `unknown` is fair.

### Speed and cost (same 5 practices)

| Measure | v1 (6 runs) | v2 (5 runs) |
|---|---|---|
| Jev calls | 684 (576 prefilter + 108 eligibility) | 142 (eligibility only) |
| Real cost | $0.0706 | $0.0121 |
| Cost per evaluated pair | $0.00067 | $0.00009 |
| Wall time, sum of runs | 12.4 s | 5.9 s |
| Hudson, 4 trials | 176 calls, 2.6 s, $0.0242 | 105 calls, 2.2 s, $0.0078 |
| Latency p50 / p95 per run | 171–191 / 269–312 ms | 158–227 / 217–345 ms |
| Input tokens per eligibility call (estimate) | about 6,300 (Hudson) | about 1,970 (cost implies about 2,030) |

Data load is now 0.5–0.8 s from Supabase. It was 0.2 s from the local file.

### Gemini criteria quality

| Trial | record / screening / administrative / subgroup | OR groups | Code checks |
|---|---|---|---|
| Obesity | 6 / 1 / 1 / 0 | g1 (two BMI routes): correct | 4 |
| Asthma | 14 / 6 / 5 / 1 | none | 2 |
| COPD | 15 / 3 / 0 / 0 | g1 (triple or dual therapy), g2 (eosinophil routes): correct | 6 |
| NSCLC | 24 / 6 / 4 / 4 | g1 (resection type), g2 (no platinum: refusal or unfit): correct | 19 |

Improvements over the v1 splitter: consent and judgment items are review items. "Female participants…" items now apply only to women (22 asthma answers settled as not applicable). The NSCLC "any of the following" and "Exceptions:" lists are now correct.

Clear mistakes:

1. **NSCLC exc_2:** the term "small cell" matches "Non-small cell lung cancer". This rejects every NSCLC patient.
2. **NSCLC exc_5:** the terms "cancer" and "tumor" match the trial's own NSCLC. This rejects every patient and ignores the exceptions.
3. **COPD exc_4:** the term "bronchitis" matches "Chronic obstructive bronchitis", which is active, so it is "within 1 month". This rejects 6 of 12 COPD patients.
4. **COPD inc_1:** the terms miss "emphysema" and "chronic obstructive bronchitis". The check always defers to Jev, and Jev said unknown 7 of 12 times.
5. **NSCLC inc_3:** the term "surgery" accepts "Pre-surgery testing" as a complete resection.
6. **COPD exc_1:** `active: true`, but the text also excludes a "documented history of asthma". It had no effect in this sample.
7. **Record items tagged review:** asthma exc_12 (Dupixent indications are diagnoses), NSCLC inc_2 (the stage is in the record, and all 3 patients are stage I), and COPD inc_4 (the record has FEV1/FVC).
8. **Asthma exc_7** says "according to Investigator", but it is tagged `record`. It should be review.

The 2 warnings in `NCT06931717.json` are long questions. The limit is 200 characters. Item 23 is exc_5 (malignancy, 228 characters). Item 25 is exc_7 (autoimmune disease, 274 characters). Both are long because they hold the exception lists. Neither is wrong.

## 4. What still goes wrong

1. **Code checks reject on the trial's own disease.** Example: a woman, 53, with NSCLC fails "any small cell component" and "another malignancy". Example: a man, 57, with COPD fails "respiratory infection in 4 weeks". The reference makes him a candidate. The triple-therapy rule hides this error in this sample.
2. **Jev accepts BMI 27–30 with no comorbidity.** This happened 8 times (v1: 4). Example: a man, 32, BMI 29.2, no listed comorbidity, accept at p = 0.90.
3. **Weak rejects pass the 0.6 threshold.** Asthma exc_7 rejected allergic rhinitis, atopic dermatitis or an epinephrine pen at p = 0.60–0.66. Example: a woman, 25. An ex-smoker still fails "current smoker" (a man, 63, p = 0.66), as in v1.
4. **The threshold also hides correct rejects.** 4 correct BMI rejects fell below 0.6 and went to review.
5. **No lung-trial candidates.** For asthma, the ICS dose and adherence item is unknown for 34 of 36 patients. For COPD, no patient has triple therapy.

## 5. What to fix next

1. **Guard the code checks.** Match whole words. Fail validation when an exclusion term matches the trial's own condition codes in `trial_condition_codes.json`. This fixes mistakes 1–3 above.
2. **Use the condition map for the main diagnosis.** Do not use Gemini name fragments for it. This fixes COPD inc_1 (emphysema, chronic obstructive bronchitis).
3. **Fix the classes in the Gemini prompt.** "Per investigator" items are administrative. Stage, spirometry and indication lists are record items. Re-running Gemini costs money, so ask first.
4. **Check compound lab-and-diagnosis rules in code.** An example is BMI ≥ 27 plus a comorbidity code list. This removes the 8 false BMI accepts.
5. **Calculate ICS dose in code** from the RxNorm strength. Or label inc_7 as a chart-review item. Then asthma can give candidates.

## 6. Limits

- The reference checks only the hand-authored code rules. As a bucket reference, it is weak.
- We mapped the criteria by hand. v2 has more mapped rules than v1, so we also give a same-scoring comparison on the 104 pairs in both.
- The sample is small: 12 COPD pairs, 3 NSCLC pairs and one obesity practice.
- We ran each pair one time. We did not test repeatability.
- Token counts are estimates. The runner keeps latency only per run, so p50 and p95 are per run.
- We judged the answers on unmapped criteria ourselves. No clinician reviewed them.
- The data is synthetic (Synthea). Real records have free text and missing codes.
