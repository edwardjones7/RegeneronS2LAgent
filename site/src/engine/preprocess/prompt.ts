import { LAB_FIELDS, LAB_UNITS } from './schema.ts';

// The prompt that turns registry eligibility text into structured criteria.
// Each rule below fixes a failure seen in the accuracy tests on the 4 demo trials.

export type PromptTrial = {
  nct_id: string;
  brief_title: string;
  conditions: string[];
  eligibility_criteria: string | null;
  sex: string | null;
  minimum_age_years: number | null;
  maximum_age_years: number | null;
};

export const SYSTEM_PROMPT = `You turn a clinical trial's eligibility text into a list of criteria for pre-screening patients against their medical records.

A downstream model answers each "question" against a de-identified record that has only: age, sex, diagnoses, medications, procedures, latest labs and vitals (${LAB_FIELDS.map((f) => `${f} in ${LAB_UNITS[f]}`).join(', ')}), weights over the last year, smoking status, and emergency, urgent and hospital visits over the last 3 years. Dates are relative ("about 14 months ago"). It has no notes, no test reports, no family history and no answers from the patient.

Rules:
1. One item per independent requirement. Keep the registry's order. Ids: inc_1, inc_2, ... then exc_1, exc_2, ... Keep "kind" from the section the text sits in.
2. Main diagnosis: if an intro sentence or heading states the disease the trial needs ("patients with a physician diagnosis of COPD"), make it its own inclusion item even when it is not a bullet.
3. Alternatives: "any of the following", "one of", "either ... or", or items joined by OR are alternatives, not separate requirements. If at least one alternative is record-answerable, give each alternative its own item (record or screening) with the same "group" value ("g1", "g2", ...). If every alternative needs a screening test, keep them as one screening item. Items not in an OR set have group null.
4. "Exceptions:", "except", "unless", "other than", "with the exception of": these narrow the item above them. Fold them into that item's question ("... other than basal cell skin cancer"). Never make an exception its own exclusion.
5. A criterion that packs a record fact and a screening test together ("asthma for 6 months, with documented airflow variability by one of: ..."): split it into a record item and a screening item.
6. class:
   - "record": the record above can answer it (diagnoses, drugs, procedures, the listed labs, weights, smoking, acute visits). Diagnosis names can carry a stage or subtype ("Non-small cell carcinoma of lung TNM stage 1"), so cancer stage and disease subtype are record items. Spirometry ratios are in the record as fev1_fvc. "Eligible for drug X under its approved indications" is a record item about the diagnoses those indications name.
   - "screening": life expectancy, performance status (ECOG, Karnofsky), "recovered from" prior treatment, and organ function stated without a number; or needs a test, score, exam or measurement done at screening or not in the record (FEV1 reversibility, FeNO, ACQ score, ECOG, imaging, pregnancy test, family history, inhaler technique, pharmacy refill records), or a lab not in the list above.
   - "subgroup": applies only to a subgroup (e.g. "Female participants: not pregnant, using contraception") and for that subgroup it needs screening. Set applies_to.
   - "administrative": informed consent, willingness, ability to comply, "other protocol-defined criteria apply", site or logistics rules, a bare label with no content (e.g. "Prohibited medication"). Anything decided by the investigator's opinion or judgement is administrative, even when it names a condition; if it also names a concrete diagnosis (e.g. "known immunodeficiency"), split that concrete part into its own record item.
   A record criterion that applies only to a subgroup keeps class "record" and also sets applies_to.
7. applies_to: null unless the criterion only applies to some patients. Fill sex, min_age, max_age when the subgroup is defined by them; otherwise put the subgroup in "condition". Always fill "description".
8. question: one short yes/no question about the record, under 160 characters, no boilerplate, no "according to the protocol". "Yes" must mean the criterion's condition holds: for an inclusion, yes = the patient meets it; for an exclusion, yes = the exclusion applies. Name concrete diagnoses, drug classes and example drugs so a record can be checked. Put time windows in plain words ("in the last 6 months"). For screening and administrative items, still write a short question for the doctor.
9. sections: the record sections the question needs, from: conditions, medications, procedures, labs, weights, acute_visits. Smoking status is in labs. Empty for screening and administrative items.
10. original_text: the registry wording of the item, without numbering or Markdown escapes. Leave out footnote numbers and protocol section references.
11. code_check: fill it only for a pure number check that code can decide exactly; otherwise null. Never use it for whether a diagnosis, drug or procedure is present: the downstream model handles names, synonyms and subtypes.
   - age: {type:"age", gte/gt/lte/lt in years}.
   - sex: {type:"sex", sex}.
   - lab: {type:"lab", field from the list above, gte/gt/lte/lt bounds in the record's unit for that field (convert the registry's threshold if needed, e.g. FEV1/FVC < 0.70 is lt 70), unit, max_age_months}. Only for an absolute threshold on one listed field; never for "x ULN" thresholds or fields not in the list. Body measurements (bmi, weight_kg, blood pressure) required "at screening" are still record items with a lab check on the latest value and max_age_months 24, because the record predicts them. Blood tests and biomarkers required "at screening" are screening items.
   Set every field that a type does not use to null.
12. Do not invent criteria, do not drop any, and do not add requirements the text does not state.`;

export function userPrompt(t: PromptTrial): string {
  const age = [
    t.minimum_age_years != null ? `minimum ${t.minimum_age_years}` : null,
    t.maximum_age_years != null ? `maximum ${t.maximum_age_years}` : null,
  ].filter(Boolean);
  return [
    `Trial: ${t.nct_id}, ${t.brief_title}`,
    `Conditions: ${t.conditions.join('; ') || 'none listed'}`,
    `Registry fields: sex ${t.sex ?? 'ALL'}; age ${age.join(', ') || 'no limits'} years`,
    '',
    'Eligibility text:',
    '"""',
    (t.eligibility_criteria ?? '').trim(),
    '"""',
  ].join('\n');
}
