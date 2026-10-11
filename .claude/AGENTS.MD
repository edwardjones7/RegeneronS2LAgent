# AGENTS.md

Context file for coding agents working on this repo. Read this before writing code.
Humans: this doubles as the project brief.

**Project name:** TODO, fill in the name the team picked.
**Event:** HackRU 2026, Rutgers. Regeneron sponsored challenge.
**Team:** Eddie (front end, design, demo), Yusuf (engine, ML), Safa (data, integrations, docs).
**Status:** built at a hackathon, intended to keep going after it.

---

## 1. What this is, in three sentences

Clinical trials fail mostly because sites cannot enroll patients, and the industry attacks that by advertising to patients. The real upstream bottleneck is finding the *doctor* who both wants to run the trial and already has patients who qualify. This product computes, inside a practice's own data, how many of that practice's patients match a given trial protocol, shows the doctor only the trials they can actually fill, and then runs outbound to those pre-matched patients.

**Pitch line:** trials come to doctors with the patients already found.

**Validated by:** a Regeneron clinical operations rep on 2026-10-10. His words, paraphrased tight: you have to convince doctors more than patients, you need the combination of facility and investigator, and only then do you earn the right to think about recruiting patients. He said that is what most startups miss.

---

## 2. Vocabulary

An agent working here will get this wrong without the terms. Use these words in code, in UI copy, and in commits.

| Term | Meaning |
|---|---|
| **Sponsor** | The pharma company running the trial (e.g. Regeneron). |
| **Site** | The physical place a trial runs: a practice, clinic, or hospital. |
| **Investigator / PI** | The doctor responsible for the trial at a site. The person we are selling to. |
| **Study feasibility** | The existing process of surveying candidate sites to ask whether they could enroll. It is a questionnaire, and roughly half of sites never return it. **This is the process we replace.** |
| **Pre-screening** | Checking a patient against criteria without a clinic visit: chart review, phone call. What our engine automates. |
| **Screening** | The real qualification visit. Involves labs and exams. Cannot be done remotely. |
| **Screen failure** | A patient who reached screening and did not qualify. Pure burned cost. **Reducing this is our ROI claim.** |
| **Eligibility criteria** | Inclusion and exclusion rules in the protocol. Some are computable, most are not. See section 6. |
| **EHR / EMR** | Electronic health record. Where the practice's patient data lives. |
| **CTMS** | Clinical Trial Management System. Site-side operational software. Integration target, not a hackathon scope item. |
| **EDC** | Electronic Data Capture. Where trial data gets entered. Same, later. |
| **KOL** | Key Opinion Leader. The famous senior investigator everyone chases. We deliberately do *not* target these. |
| **Medical affairs** | The pharma team that owns investigator relationships. Thin budget for upcoming trials, per the rep. Relevant to who buys this. |

**Never** use the word "qualify" for what the engine does. The engine **pre-screens**. Patients are not qualified until a human screens them. Getting this wrong in UI copy is the fastest way to lose a clinical judge.

---

## 3. The three layers

Keep these separate in the codebase. They have different owners, different risk profiles, and different value.

```
┌─────────────────────────────────────────────┐
│  MATCHING ENGINE        runs inside practice │  ← the IP
│  patient records × protocol criteria         │
│  outputs: match list (local) + counts (out)  │
└─────────────────────────────────────────────┘
                    ↓ de-identified counts only
┌─────────────────────────────────────────────┐
│  DOCTOR APP             the surface          │  ← the product
│  "you can fill 14 of these. pick one."       │
└─────────────────────────────────────────────┘
                    ↓ doctor accepts a trial
┌─────────────────────────────────────────────┐
│  OUTBOUND AGENT         the activation       │  ← the differentiator vs incumbents
│  calls the doctor's OWN pre-matched patients │
└─────────────────────────────────────────────┘
```

- **Engine** is the defensible part. Everything else is a wrapper.
- **App** is what gets demoed and what the doctor touches.
- **Outbound** is strictly better than any generic recruitment dialer because it calls warm, pre-matched patients under the doctor's own name. It is *not* the thing we claim as novel. See section 10, competitors.

---

## 4. Who the user is

**Primary:** a newly attending physician in a private or community practice, roughly 2 to 8 years post-fellowship, who wants to build academic standing.

Their motivation is **publication and academic notoriety**, not money. Investigator payments exist and are not the hook. The rep described old Regeneron thinking about "moneyball for doctors": find the junior All-Star instead of chasing the senior KOL who is about to retire. That is exactly this user.

**Implications for UI copy, enforce these:**

1. A trial card leads with indication, time commitment, and publication or authorship potential. Financial terms are secondary and may be omitted entirely in the demo.
2. The doctor's standing fear is losing their patients to an academic medical center. The app must visibly state that the patient stays with the referring physician and that patient data never leaves the practice. This is a card in the UI, not a footnote in a privacy policy.
3. No marketing-speak. Clinicians read it as noise.

---

## 5. Architecture and the hard privacy rule

**Hard rule, non-negotiable, applies to every commit: identifiable patient data never leaves the practice.**

The engine runs where the data is. Only de-identified aggregate counts cross the network boundary. If a function signature sends a patient identifier, a name, a DOB, or an MRN outward, it is wrong. Small-cell suppression applies: do not emit a count below a threshold (default 5) because a count of 1 in a rare indication is re-identifiable.

For the hackathon, **the Supabase `patients` table stands in for each practice's own EHR.** Decided by the team on 2026-10-10, replacing the earlier browser-only plan.

- Every patient row belongs to one practice (`practice_id`). Row-level security means a signed-in practice user reads only their own practice's patients. Records are never pooled or queried across practices.
- The matching engine runs per practice, against that practice's patients only.
- What leaves a practice is de-identified counts: `practice_patient_counts()` and per-trial match counts, with counts under 5 suppressed.
- The Jev evaluation model gets a de-identified summary per patient (no name, ID, birth date or location; dates as relative time). See `protocols/README.md`.
- Server code uses the secret key, which bypasses row-level security, so every API route must scope its queries to one practice. See `site/src/lib/utils/db/client.ts`.
- TypeScript, React, Next.js. Deploy to Vercel so the README has a live link.

Say it in the demo: in production this table is the practice's own EHR (via FHIR), and the only thing that ever crosses to the sponsor is a count.

```
/engine          matching logic, pure functions, no DOM, no fetch
/engine/criteria one module per criterion type, each returns MATCH | NO_MATCH | UNKNOWN
/app             UI
/data            local de-identified dataset
/docs            README, limits, data provenance
```

`/engine` must stay pure and importable with zero side effects. It is the part that gets tested and the part that eventually ships into a real EHR context.

---

## 6. Eligibility: computable vs human judgment

The engine returns **three** states per criterion, never two. `UNKNOWN` is a first-class result and must surface in the UI.

**Computable from structured data:**
- Age and sex
- Diagnosis codes (ICD-10)
- Lab values against protocol thresholds (e.g. ALT, bilirubin, eGFR, HbA1c)
- Medication history and prior lines of therapy
- Date windows (diagnosis within N months, washout periods)

**Not computable, needs a human:**
- Anything with a vague clinical qualifier: "adequate renal function", "clinically significant", "life expectancy greater than 6 months"
- Performance status unless explicitly recorded
- Willingness and ability to comply with the protocol
- Investigator judgment clauses

**Rule:** a patient is `PRE-SCREEN CANDIDATE` only when every computable criterion passes. Any `UNKNOWN` is displayed to the doctor as a review item, not silently ignored and not silently counted as a pass. The UI must show, per trial, a split like `14 candidates, 6 need chart review`. Hiding the UNKNOWN bucket is the dishonest version of this product and a judge who does this for a living will find it in thirty seconds.

---

## 7. Data

**Source:** https://github.com/cdisc-org/sdtm-adam-pilot-project

CDISC SDTM and ADaM pilot dataset. Real-shaped, de-identified, built for exactly this kind of educational use.

⚠️ **License: educational use. It is NOT MIT and must NOT be committed into this repo under our license.** Fetch it at setup time via a script, keep it gitignored, and document the provenance in `/docs`. Our own code is MIT. The data is not ours to relicense.

Relevant SDTM shapes an agent will need:
- `DM` demographics: `USUBJID`, `AGE`, `SEX`
- `LB` labs: `LBTESTCD`, `LBSTRESN` (result), `LBSTNRHI` (upper limit of normal)
- `CM` concomitant medications
- `MH` medical history

Worked example, Hy's Law style liver signal, from the sponsor's own starter material:

```
ALT_ratio  = LBSTRESN / LBSTNRHI   where LBTESTCD = 'ALT'
BILI_ratio = LBSTRESN / LBSTNRHI   where LBTESTCD = 'BILI'
flag       = ALT_ratio > 3 AND BILI_ratio > 2
```

That pattern, a lab value normalized against its own reference limit, is the template for every lab criterion. Write it once, generically, and parameterize it.

**Protocol criteria input:** hand-author 3 to 5 trial protocols as JSON for the demo. Do not build a protocol parser. Optionally prefill from the ClinicalTrials.gov v2 API by NCT number if there is time, which ticks the "real public data" box, but it is a COULD not a MUST.

---

## 8. Claims discipline

**Every number in the UI, the README, and the deck traces to a source. No number gets invented or rounded up.**

Figures below are from Regeneron's own challenge materials and are safe to cite:

| Claim | Figure |
|---|---|
| Median trial cost | $19.0M |
| Cost per patient | $41,117 |
| Cost per visit | $3,562 |
| Sites that enroll zero patients | 11% |
| Sites that under-enroll | 37% |
| Study start-up duration | 31.4 weeks, 61% administrative |
| Protocol amendments | 57% of protocols, 45% avoidable |

**The ROI sentence is about screen failures and site selection, not generic "time saved."** A patient who reaches a screening visit and fails burns visit cost and returns nothing. Site-level: 11% of sites enroll zero, which is a selection failure our counts prevent before a contract is signed.

Do not claim the product saves lives. Do not claim accuracy we have not measured. Do not claim we qualify patients.

---

## 9. Scope ladder

**MUST** (build first, then freeze)
Engine evaluates a hand-authored protocol against the local dataset. Three-state results. Doctor view listing trials with candidate counts and review counts. Deployed. README written.

**SHOULD**
Per-trial drill-down showing which criteria each candidate passed, failed, or is unknown on. The privacy card. Trial card copy leading with publication potential. Small-cell suppression on emitted counts.

**COULD**
Outbound queue view (the call list, generated, not actually dialing). Sponsor-side rollup map of de-identified counts by practice. NCT number prefill. Inbound line and per-patient call-window scheduling.

**Hard stop with 2 hours left.** Nothing new gets built after that. Last two hours are demo recording, README, deck. The single most common way a hackathon team loses is having working code and no demo.

One person owns the demo script from the halfway mark, not the last hour.

---

## 10. Competitors, say this out loud

**Grove AI.** Two Stanford founders, CTMS-integrated, handling the recruitment calls and load-balancing them across a 24-hour window. They are good and they are real.

If we pitch "AI calls patients," we are pitching their product with less infrastructure. Our wedge is **upstream of the call**: the patients have to be found before anyone picks up a phone. Say it in the demo, roughly: others are solving the last mile, the patients still have to be found first, that is us.

**Dead framings, remove them from every artifact:**
- Anything about ads or ad targeting. The rep said they barely run ads, the CTR is poor, and ad tech in this space is abysmally bad.
- "Tinder for clinical trials" and any swipe-a-deck metaphor. Swiping implies browsing and volume. The product's whole value is that the doctor sees *only* trials they can fill, ranked by match count. Fewer cards, every one a plausible yes.

---

## 11. Demo script, three minutes

- **0:00 to 0:20** The problem, said by a person. Trials fail because sites cannot enroll. The industry advertises to patients. The actual bottleneck is finding the doctor who already has the patients.
- **0:20 to 0:45** Here is a practice's data. It stays scoped to this practice; nothing about these patients is pooled or shared.
- **0:45 to 1:45** Run the match. Here are five trials. You can fill two of them. Fourteen candidates, six need chart review. **Open one.** Here is exactly which criteria each patient passed and which need a human. This is the money shot, do not rush it.
- **1:45 to 2:15** The doctor accepts. Here is the call list, their own patients, under their own name. The patient stays with this practice.
- **2:15 to 2:40** What crosses the wire: a count. Here is what a sponsor sees, a map of which practices can fill which trial. Site selection from the other end.
- **2:40 to 3:00** Open source, MIT, live link, runs from a clean clone. Here is what we are building next.

---

## 12. Honest limits, put these in the README

Judges trust teams that state their own limits. It reads as competence.

- Runs on synthetic patients from Synthea (2,000 in New Jersey, seed 42), not a live EHR. Real deployment needs FHIR or a direct EHR integration and that is not built.
- "Practices" are the county groups Synthea placed patients in, not real practices. No practice or doctor names are invented.
- Synthea leaves gaps that show up as chart review, not as failures: no LAMA inhalers, no FeNO, eosinophils and lung function on few patients, weight recorded about once a year, no family history.
- Structured criteria are checked by code. Judgment criteria go to the Jev evaluation model as de-identified summaries. Jev's answers have not been checked against a clinician's.
- Protocols are hand-authored JSON covering each trial's key criteria only, simplified from the real protocols. No protocol parser.
- For exclusions, a missing record counts as a pass: no diabetes diagnosis on file is read as not diabetic.
- Not validated against a site's actual pre-screening output. Next step is benchmarking candidate lists against a real coordinator's manual review.
- No HIPAA or 21 CFR Part 11 compliance work has been done. The Jev summaries follow the Safe Harbor de-identification approach, but there's been no expert determination and no BAA with Vercel or TypeSafe AI. The architecture is designed to make compliance reachable, not to claim it.

---

## 13. Open questions

Unresolved, worth answering with a sponsor contact rather than guessing.

1. **Whose budget buys this?** Site identification and feasibility, or patient recruitment? The rep noted medical affairs is thin on budget for upcoming trials, so the wrong budget line kills the deal regardless of product quality.
2. **Which criteria would a clinical ops person trust a machine to evaluate?** Our list in section 6 is a guess from the outside. Get it cut and added to.
3. **Who signs, the practice or the sponsor?** Changes the entire product surface.

---

## 14. Working conventions

- MIT license. Public repo from the first commit. The sponsor asked for this explicitly.
- `/engine` stays pure: no `fetch`, no DOM, no side effects, importable and testable alone.
- Any function that moves data outward gets a comment naming what it emits and confirming it is aggregate only.
- Tests on the criteria modules. Each one needs a MATCH, a NO_MATCH, and an UNKNOWN case. These are cheap and they are what lets you say "tested" without lying.
- Commit messages in plain English. The repo is part of the submission and gets read.
- Do not add dependencies for things the standard library does.