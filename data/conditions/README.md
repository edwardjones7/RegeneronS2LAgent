# Trial condition map

`trial_conditions.json` answers one question for the matcher, in code: **does this patient have the disease this trial studies?** Only patient–trial pairs that pass go on to Jev.

A patient passes a trial when they have one of its `codes` (patient SNOMED codes for the trial's disease), meet one of its `rules` (e.g. `bmi >= 30` for obesity trials), or the trial takes `healthy_volunteers`. Trials missing from the map are skipped.

Built once from the trials' MeSH condition terms: MeSH → SNOMED through the Mondo (CC BY 4.0), Disease Ontology and Wikidata cross-references, SNOMED descendants from tx.fhir.org, word matching, and hand fixes for known gaps (obesity coded as "BMI 30+", COPD as emphysema). It covers the 147 trials synced on 2026-10-11; new trials need it rebuilt.
