# Jev pre-screening accuracy: PoC test

Date: 2026-10-11. Pipeline: `site/scripts/match.ts` with Jev (`typesafe/jev-1.13`).

## 1. Result in 5 lines

1. Verdict: **yes for a PoC**, but you must fix the bucket rule before you show counts to a doctor.
2. The condition prefilter kept **49 of 49** lung patients and pruned **93%** of pairs. For obesity, it kept only **62%** of true patients.
3. On the criteria that code can check, Jev agreed with the reference on **90%** of answers (555 of 620). Most disagreements were reasonable `unknown` answers.
4. Jev gave **0 pre-screen candidates** for asthma, COPD and lung cancer. All 52 pairs had at least one `unknown` (consent, screening tests), and 48 had a `reject`.
5. The test cost **$0.0805**. A 134-patient practice with 4 trials took **2.6 s** and cost **$0.024**.

## 2. What we tested

- Data: `data/synthea-nj.json`, Synthea synthetic patients. The data has no real people.
- Practices: Hudson, Middlesex, Somerset, Mercer and Monmouth (all lung trials), and Hudson only for obesity.
- Patients asked by the prefilter: 527 adults. Pairs asked: 1,471. Pairs that went to the criteria step: 105.
- Trials: NCT07685808 (obesity), NCT07309614 (asthma), NCT07053423 (COPD) and NCT06931717 (lung cancer, NSCLC).
- Reference: a scratch evaluator runs the `check: "code"` rules in `protocols/*.json`. It follows `protocols/README.md`.
- Paid runs: 9. Jev calls: 714. Real cost: $0.0805 of the $0.10 limit.

## 3. Numbers

### Condition prefilter (step 2)

The reference condition is the protocol's diagnosis rule, with no duration check. For obesity, we used latest BMI ≥ 27.

| Trial | Pairs asked | True patients | Kept | Recall | Pruned | Wrongly kept |
|---|---|---|---|---|---|---|
| Asthma | 509 | 34 | 34 | 100% | 472 | 3 |
| COPD | 327 | 12 | 12 | 100% | 315 | 0 |
| NSCLC | 527 | 3 | 3 | 100% | 524 | 0 |
| Obesity | 108 | 85 | 53 | **62%** | 55 | 0 |

We ran 49 pairs two times. The answers were the same all 49 times.

### Criterion accuracy (step 3)

Mapping from each hand-authored `code` criterion to the auto-split criteria:

| Trial | Hand-authored → auto-split |
|---|---|
| Obesity | bmi → inc_1; no_diabetes → exc_1; stable_weight → exc_2; no_bariatric_surgery → exc_3; no_pancreas_gallbladder → exc_4 |
| Asthma | age → inc_1; asthma_6_months → inc_2; no_current_smoking → exc_2; no_other_lung_disease → exc_8; no_recent_cancer → exc_10; no_biologic → exc_11; not_already_eligible_for_dupixent → exc_12 |
| COPD | smoking_history → inc_1; airflow_obstruction → inc_2; no_asthma → exc_1; no_other_lung_disease → exc_2 + exc_4; no_biologic → exc_5. The `copd` rule has no auto-split match. |
| NSCLC | age → inc_9; nsclc → inc_1; complete_resection → inc_2 + inc_3 + inc_4; no_prior_systemic_treatment → exc_3; no_recent_mi → exc_10; no_organ_transplant → exc_16 |

Confusion matrix (rows: reference, columns: Jev), 620 answers:

| Reference ↓ / Jev → | accept | reject | unknown |
|---|---|---|---|
| accept | 519 | 7 | 48 |
| reject | 4 | 36 | 6 |

- Strict agreement: 555 of 620 (90%).
- 50 of the 65 disagreements are not Jev errors:
  - 47 times, Jev said `unknown` because the auto-split text adds a test that the record does not have. Example: asthma inc_2 adds "airflow variability" to the diagnosis.
  - 3 times, Jev correctly rejected stage I NSCLC. The reference `nsclc` rule does not check stage.
- If you count these 50 as correct, the agreement is 605 of 620 (98%).
- Weak criteria: asthma inc_2 (3 of 37), COPD inc_2 (4 of 12) and COPD inc_1 (6 of 12). All are "unknown versus accept".
- Perfect criteria: diabetes, bariatric surgery, gallbladder, biologics, other lung disease and cancer. Each was 37 of 37 or 53 of 53.

### Buckets

The reference bucket uses only the `code` criteria. Jev uses all criteria. So the two are not fully the same measure.

| Trial | Jev: candidate / review / not_match | Reference: candidate / review / not_match | Same bucket |
|---|---|---|---|
| Obesity | 37 / 0 / 16 | 33 / 0 / 20 | 49 of 53 |
| Asthma | 0 / 4 / 33 | 33 / 0 / 4 | 4 of 37 |
| COPD | 0 / 0 / 12 | 4 / 0 / 8 | 8 of 12 |
| NSCLC | 0 / 0 / 3 | 0 / 0 / 3 | 3 of 3 |

- When the reference said not_match, Jev also said not_match in 31 of 35 pairs.
- Jev said not_match in 33 pairs where the reference did not. 29 are asthma pairs and 4 are COPD pairs.
- Of the 29 asthma pairs, 5 are not_match only because of clearly wrong rejects. The other 24 have a reject on the inhaled-steroid dose or the asthma-attack history. Those rejects are possible but not checked.
- The 4 COPD pairs are correct rejects: the patients have no LAMA inhaler, so they do not have triple therapy.

### Unknown rate

| Trial | Answers that are unknown | Pairs with at least 1 unknown |
|---|---|---|
| Obesity | 0% (0 of 318) | 0 of 53 |
| Asthma | 33% (279 of 851) | 37 of 37 |
| COPD | 37% (58 of 156) | 12 of 12 |
| NSCLC | 26% (28 of 108) | 3 of 3 |
| All | 25.5% (365 of 1,433) | 52 of 105 |

Consent and screening-visit criteria were unknown for every patient. Examples: asthma consent (37 of 37), asthma biomarkers at screening (37 of 37), COPD CAT score and mucus score (12 of 12). So the current bucket rule cannot give a candidate for asthma, COPD or NSCLC.

### Option-order bias

Set: asthma trial, `--no-condition-jev`, first 14 Passaic patients. That gives 10 pairs and 230 answers. 2 of the patients have asthma.

| Order | accept | reject | unknown | Answers changed | Buckets changed |
|---|---|---|---|---|---|
| accept, reject, unknown | 148 | 37 | 45 | (baseline) | (baseline) |
| reject, accept, unknown | 144 | 36 | 50 | 15 (6.5%) | 0 of 10 |
| unknown, accept, reject | 140 | 35 | 55 | 16 (7.0%) | 0 of 10 |

- Putting `unknown` first increased unknown answers by 22%.
- Putting `reject` first did not increase rejects.
- The sample is small, so read these as early signals.

### Speed and cost

| Run | Calls | Wall time | p50 / p95 latency | Real cost |
|---|---|---|---|---|
| Hudson, 4 trials, 134 patients | 176 | 2.6 s | 184 / 288 ms | $0.0242 |
| Middlesex, 3 lung trials, 200 patients | 177 | 2.9 s | 171 / 280 ms | $0.0164 |
| Asthma only, 10 pairs, 23 criteria | 10 | 0.5 s | 260–376 / 293–431 ms | $0.0033 |

- Concurrency was 16.
- For the prefilter runs, the dry-run estimates were within 8% of the real cost.
- For the 10-pair asthma runs, the real cost was 23% less than the estimate.
- A linear estimate from Hudson for all 2,000 patients and 4 trials is about $0.36 and about 40 s.

### Splitter quality (78 criteria)

| Trial | Good | Merged wrongly | Split wrongly | Notes |
|---|---|---|---|---|
| Obesity (6) | 6 | 0 | 0 | The OR fix merged the two BMI items correctly. The end-of-list note is attached to exc_5. |
| Asthma (23) | 22 | 1 (inc_6 contains a sub-heading) | 0 | exc_3 ends with a stray footnote number "69". |
| COPD (13) | 12 | 1 (exc_3: oxygen and infection; the registry text has no line break) | 0 | The preamble "physician diagnosis of COPD" is dropped. The disclaimer is attached to exc_6. |
| NSCLC (36) | 29 | 2 (exc_4, exc_7) | 5 (inc_2, inc_3, inc_4, exc_5, exc_6) | See below. |
| **Total** | **69 (88%)** | **4** | **5** | |

NSCLC problems:

- inc_3 (lobectomy) and inc_4 (segmentectomy) are alternatives. The splitter made them two required criteria. The OR fix does not catch "any of the following:".
- exc_5 and exc_6 are items under "Exceptions:". The splitter made them exclusions, so their meaning is reversed.

## 4. What went wrong

1. **The prefilter cannot see BMI.** The condition state has diagnoses only. All 32 missed obesity patients had BMI 27.1–30.0 and no obesity diagnosis. Example: a man, 33, with BMI 27–30 was pruned. 19 of these 32 pass the full protocol BMI rule.
2. **Criteria that do not apply get `reject`.** Asthma inc_7 starts "Female participants...". Jev rejected 11 of 11 men on it. Example: a man, 39, became not_match only because of inc_7.
3. **Vague criteria get `reject` instead of `unknown`.** Asthma exc_14 is the whole text "Prohibited medication". Jev rejected it 10 times. Investigator-judgement items (exc_7, exc_9) were rejected 10 times. Example: a woman, 25, became not_match from exc_7, exc_12 and exc_14 only.
4. **Unknown is not the same as unsure.** An ex-smoker with no quit date got `reject` on "current or recent smoker" two times. Example: a man, 63, ex-smoker. The reference rule passes ex-smokers.
5. **False accept on BMI.** Jev accepted BMI 27–30 with no listed comorbidity 4 times. Example: a woman, 33, BMI 29.0, only chronic sinusitis.
6. **Wrong rejects have lower confidence.** The median reject probability is 0.56 for clearly wrong rejects and 0.86 for verified correct rejects. In this sample, a 0.6 threshold removes 19 of 35 wrong rejects and loses 3 of 43 correct ones.

## 5. What to fix first

1. **Use the code rules before Jev.** Age, BMI, diagnosis codes and smoking status are free and exact. Add BMI to the prefilter state, or skip the Jev prefilter when a code rule exists.
2. **Do not count consent or screening-visit criteria in the bucket.** Tag them as `review`, as `protocols/README.md` does. If you do not, asthma, COPD and NSCLC can never have a candidate.
3. **Change "not applicable" and "vague" to `accept` or `unknown` in the prompts.** Tell Jev that a female-only criterion is `accept` for a man. Tell Jev that a bare label such as "Prohibited medication" is `unknown`.
4. **Use a reject threshold.** If the reject probability is less than about 0.6, use `unknown`. Test this on a larger set first.
5. **Fix the splitter.** Handle "any of the following:" lists, "Exceptions:" headings and preamble sentences that state the diagnosis.
6. **Keep `accept` first in the option order.** Measure the order again on at least 50 pairs.

## 6. Limits of this test

- The reference is not perfect. It checks only `code` rules. It ignores NSCLC stage, and its comorbidity code list can miss some cases.
- We mapped the criteria by hand. Some mappings cover only part of a criterion.
- The sample is small: 49 lung-disease patients, 53 obesity pairs, 3 NSCLC pairs and 10 pairs for option order.
- The obesity test used only one practice (Hudson).
- The data is synthetic. Real records have free text, missing codes and more noise.
- We did not test the `jev` and `review` criteria against a human. Rejects on inhaled-steroid dose and attack history are not checked.
- We ran each order only one time. The repeat test covered the prefilter only.
