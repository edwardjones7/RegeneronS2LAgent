# Trial condition map

`trial_condition_codes.json` answers one question for the matcher: **does this patient have the disease this trial studies?** It's a plain lookup. No model is involved. Only patient–trial pairs that pass it go on to Jev's eligibility check.

## How a pair passes

A patient passes a trial when any of these is true:

- They have one of the trial's `matched_patient_codes`, which are SNOMED codes that actually occur in our patients.
- They meet one of its `measurement_rules`, e.g. `bmi >= 30` for obesity trials or `ldl >= 130` for hypercholesterolemia.
- The trial is flagged `healthy_volunteers_no_condition_filter`, so there's no disease to filter on.

Age and sex are checked separately, in code, from the trial's structured fields.

On the current 147 trials and 2,000 patients, about 5,900 of the 200,000 age- and sex-eligible pairs go to Jev.

## How the map is built

The source is `build/final_eval.py`. Run it offline with `python3 -I build/final_eval.py`.

1. **Trial MeSH terms to SNOMED.** Each trial's MeSH condition terms (Supabase `trials.condition_meshes`) are mapped to SNOMED CT through these cross-references:
   - [Mondo](https://github.com/monarch-initiative/mondo) (CC BY 4.0)
   - [Disease Ontology](https://github.com/DiseaseOntology/HumanDiseaseOntology) (CC0)
   - Wikidata (CC0)

   Only MeSH terms that match the trial's own condition text are used. Generic terms on a stoplist ("Neoplasms" and similar) are dropped. MeSH child terms are added, which is how COPD reaches chronic obstructive bronchitis.
2. **Matching patient codes.** A patient code matches when it is a target concept or one of its SNOMED descendants. The descendant check uses parent chains fetched once from tx.fhir.org and cached in `build/parents_cache.json` and `build/patient_ancestors.json`. tx.fhir.org is HL7's test server, so it is never called at match time.
3. **Word match.** A trial condition's words that all appear in a patient code's name also count. Only disorders and findings are used.
4. **Manual fixes.** `overrides.json` holds fixes where the crosswalks are wrong or missing: obesity coded as "BMI 30+", prevention trials, solid-tumour baskets, and others. Each fix has a `why`.

The Mondo and Disease Ontology downloads go in `build/dl_mondo/` and `build/dl_doid/`, which are gitignored. Fetch them from:

- `https://raw.githubusercontent.com/monarch-initiative/mondo/master/src/ontology/mappings/mondo_{exactmatch,hasdbxref}_{mesh,sctid}.sssom.tsv`, saved as `.tsv`
- `https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/main/src/ontology/doid.obo`

`build/fetch_trial_meta.py` refreshes `build/trial_meta.json` from Supabase. It's read-only and uses the keys in the root `.env`.

## Limits

- The map covers the trials in `build/trial_meta.json`. A new trial needs a rebuild, and sometimes a new override.
- Recall was checked on the same trials the overrides were written for, so it is optimistic. A holdout check on new trials is still to do.
- eGFR isn't used as a rule. In Synthea, 83 patients have eGFR under 15 but only 4 have an end-stage kidney disease code.
- 80 of the 145 disease trials match no patient. A keyword search found no missed synonyms, so these diseases aren't in the Synthea population.
