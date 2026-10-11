# Jev pre-screening accuracy: v3

Date: 2026-10-11. Pipeline: `site/scripts/match.ts` at commit 3ee2b2b (branch `jev-matcher`), Jev `typesafe/jev-1.13`. Criteria: Gemini prompt v3 (`data/criteria/*.json`, status `llm`). Earlier tests: `docs/jev-accuracy-poc.md` (v1) and `docs/jev-accuracy-v2.md` (v2).

## 1. Result in 5 lines

1. v3 is better than v2. Criterion agreement rose from 90% to 95% (769/809). The cost stayed the same.
2. The wrong code rejects from v2 are gone. Every NSCLC and COPD not_a_match now has a correct reason.
3. Candidates did not change: obesity 59, and asthma, COPD and NSCLC 0. The cause is the record data, not wrong rejects.
4. Confidence works as a warning. Jev answers with p < 0.6 were correct 46% of the time. Answers with p ≥ 0.6 were correct 96–99% of the time.
5. Cost: $0.0133 for 142 calls (v2: $0.0121). Total wall time: 6.6 s.

## 2. What we tested

- Same sample and same 142 pairs as v2. That is 5 practices for the lung trials and Hudson for obesity.
- Changes since v2:
  - Code checks use numbers only (age, sex, lab values). Diagnoses, drugs and procedures now go to Jev.
  - The Gemini v3 criteria have new classes.
  - The buckets are now candidate / chart_review / not_a_match.
- Reference: `ref.py` (the hand-authored `check: "code"` rules), as in v1 and v2.
- Paid runs: 5, without `--write`. Real cost: **$0.0133**. The dry-run estimate was $0.0132.

Mapping changes from v2: COPD age → inc_1, copd → inc_2, airflow_obstruction → inc_4 (now a lab code check). Asthma exc_12 is now a `record` item, so it is evaluated. All other mappings are the same as v2.

## 3. v1 vs v2 vs v3

### Criterion accuracy

| Measure | v1 | v2 | v3 |
|---|---|---|---|
| All mapped answers | 555/620 (90%)* | 726/809 (90%) | **769/809 (95%)** |
| Decided by code | none | 100/100 | 63/63 |
| Decided by Jev only | 555/620 | 547/569 (96%) | 626/655 (96%) |
| Code and Jev combined (multi-ID rules) | none | 79/92 (86%) | 80/91 (88%) |
| Sent to review, not evaluated | none | 48 | 0 |

\* v1 gave one answer per auto-split ID, so its scoring is a little different.

Per trial in v3: obesity 443/455, asthma 247/252, COPD 67/84 and NSCLC 12/18. The 3 NSCLC "misses" on `nsclc` are stage I patients. Jev rejects them, and the protocol needs stage II–IIIA. The reference does not check stage, so these 3 are correct. With them, agreement is 772/809 (95%).

v3 confusion matrix (rows: reference, columns: v3):

| Reference ↓ / v3 → | accept | reject | unknown |
|---|---|---|---|
| accept | 728 | 4 | 18 |
| reject | 12 | 36 | 6 |
| unknown | 0 | 0 | 5 |

### Buckets (candidate / chart_review / not_a_match)

| Trial | v1 | v2 | v3 | Reference (v3 pairs) | Same bucket v1 / v2 / v3 |
|---|---|---|---|---|---|
| Obesity | 37 / 0 / 16 | 58 / 9 / 24 | 59 / 8 / 24 | 50 / 5 / 36 | 49/53, 79/91, 79/91 |
| Asthma | 0 / 4 / 33 | 0 / 28 / 8 | 0 / 31 / 5 | 33 / 0 / 3 | 4/37, 3/36, 2/36 |
| COPD | 0 / 0 / 12 | 0 / 0 / 12 | 0 / 0 / 12 | 4 / 0 / 8 | 8/12, 8/12, 8/12 |
| NSCLC | 0 / 0 / 3 | 0 / 0 / 3 | 0 / 0 / 3 | 0 / 0 / 3 | 3/3, 3/3, 3/3 |
| All | | | | | 64/105, 93/142, 92/142 |

The reference bucket uses only the code rules, so it is a weak reference. Asthma is "different" mostly because the ICS-dose and attack-history items are in chart review. The reference does not check them.

Each v3 not_a_match, checked by hand:

- **Obesity, 24:** all correct. 15 fail the BMI group and 9 have diabetes (Jev).
- **COPD, 12:** all correct. No patient has triple therapy or LAMA + LABA (inc_8 and inc_9). 6 never-smokers also fail. 3 have FEV1/FVC ≥ 70% (code). The v2 "bronchitis" reject is gone.
- **NSCLC, 3:** all correct. All 3 are stage I (inc_1, p = 1.0) and had prior cisplatin and paclitaxel (exc_3). The v2 "small cell" and "cancer" rejects are gone.
- **Asthma, 5:** 1 is wrong: an ex-smoker failed "current smoker" (p = 0.63). 4 are plausible. These patients have no attack in the record (inc_6) or low-dose or no ICS (inc_7). v2 had 4 wrong asthma rejects.

Chart review: asthma 31 and obesity 8. For asthma, inc_7 (stable medium-dose ICS with adherence) is unknown for 33 patients and inc_6 for 24. The record has no daily dose or attack details.

### Confidence (`min_confidence`, `uncertain_criteria`)

- `min_confidence` is the weakest Jev answer for each pair. It goes from 0.39 to 0.97. The median is about 0.70, and the deciles are 0.49 to 0.80. The spread is real, but most pairs are between 0.5 and 0.8.
- Median per trial: obesity 0.72, asthma 0.62, NSCLC 0.58 and COPD 0.47.
- `uncertain_criteria` (p < 0.75): 42 pairs have 0, 59 have 1, 33 have 2 and 8 have 3.
- Wrong answers are mostly low-confidence answers:

| Jev top probability | Answers | Agree with reference |
|---|---|---|
| below 0.6 | 28 | 13 (46%) |
| 0.6–0.75 | 53 | 51 (96%) |
| 0.75–0.9 | 114 | 110 (96%) |
| 0.9 and above | 445 | 440 (99%) |

- The median probability is 0.56 for wrong answers and 1.0 for right answers.
- 17 of 26 wrong answers are in `uncertain_criteria`. Of the 9 that are not, 3 are the correct stage I rejects and 5 are fair `unknown` answers (pack-years not recorded). Only 1 is a real confident error: a man, 24, whose childhood asthma ended in 2021, accepted at p = 0.90.
- Pairs in the same bucket as the reference have a median `min_confidence` of 0.71. Different pairs have 0.59.
- Noise: obesity exc_2 (weight change) is the most common uncertain item, in 44 pairs. Most of these are correct accepts.
- Of the 9 false obesity candidates, 5 have `min_confidence` < 0.75. 4 do not (0.75–0.79).

### Speed and cost (same 5 practices)

| Measure | v1 | v2 | v3 |
|---|---|---|---|
| Jev calls | 684 | 142 | 142 |
| Real cost | $0.0706 | $0.0121 | $0.0133 |
| Wall time, sum of runs | 12.4 s | 5.9 s | 6.6 s |
| Hudson, 4 trials | 2.6 s, $0.0242 | 2.2 s, $0.0078 | 2.3 s, $0.0086 |
| Latency p50 / p95 per run | 171–191 / 269–312 ms | 158–227 / 217–345 ms | 183–241 / 202–328 ms |
| Input tokens per eligibility call (estimate) | about 6,300 | about 1,970 | about 2,220 |

v3 costs 10% more than v2. This is because diagnosis, drug and procedure questions now go to Jev.

### Gemini v3 criteria

Fixed since v2:

- Asthma exc_7 ("according to Investigator") is now administrative.
- Asthma exc_12 (Dupixent indications) is now record.
- COPD inc_4 is a lab check, FEV1/FVC < 70%.
- NSCLC stage is in inc_1 (record).
- "Adequate organ function" and life expectancy are screening items.

Still wrong:

- NSCLC inc_10 keeps only "ECOG PS 2". It drops the route "age ≥ 70 with substantial comorbidities". It is also tagged `record`, but ECOG is not in the record.
- Obesity exc_5 asks about family history. It is tagged `record`, but the record has no family history.
- The 2 warnings in `NCT06931717.json` are still long questions. Item 23 (exc_5, malignancy) has 241 characters. Item 25 (exc_7, autoimmune disease) has 274 characters.

## 4. What still goes wrong

1. **Jev accepts BMI 27–30 with no comorbidity.** This happened 9 times (v2: 8). Example: a man, 32, BMI 29.2, accept at p = 0.93. This is the largest source of false candidates.
2. **Jev accepts asthma that has ended.** Example: a man, 24, with childhood asthma that ended in 2021, accept at p = 0.90. Example: a woman, 20, accept at p = 0.50.
3. **An ex-smoker fails "current smoker".** Example: a woman, 51, reject at p = 0.63. This happened in v1, v2 and v3.
4. **Jev does not equate emphysema or chronic obstructive bronchitis with COPD.** It said unknown 7 of 12 times.
5. **The 0.6 threshold hides some correct rejects.** Example: a woman, 40, with diabetic kidney disease and insulin: reject at p = 0.54, which became unknown. 2 BMI rejects (p = 0.57–0.58) also went to chart review.
6. **A missing procedure gives `unknown`, not `reject`.** No NSCLC patient had a lobectomy, but Jev said unknown 3 of 3 times.

## 5. What to fix next

1. **Check BMI plus comorbidity in code.** Use a lab check and a comorbidity code list. This removes the 9 false obesity candidates.
2. **Check the main diagnosis in code with SNOMED codes** from `trial_condition_codes.json`, not with name fragments. Include "active" and "duration". This fixes ended asthma and the COPD synonyms.
3. **Map `smoking_status` in code.** "Ex-smoker" is not a current smoker.
4. **Show `uncertain_criteria` to the doctor.** Keep the 0.6 reject threshold. Do not flag criteria where uncertainty is usually noise, for example weight change.
5. **Calculate ICS dose in code.** Without this, asthma stays at 0 candidates.

## 6. Limits

- The reference checks only code rules. It does not check NSCLC stage, ICS dose, attack history or triple therapy.
- `data/criteria/` is in `.gitignore`. A clean clone of 3ee2b2b does not contain the v3 criteria that we tested.
- The sample is small: 12 COPD pairs, 3 NSCLC pairs and one obesity practice. We ran each pair one time.
- Jev's probabilities are not calibrated. The confidence bands come from 640 answers.
- We judged the answers on unmapped criteria ourselves. No clinician reviewed them. The data is synthetic.
