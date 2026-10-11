-- Structured eligibility criteria on each trial.
--
-- site/scripts/preprocess-criteria.ts (or the trial sync job) asks Gemini to split
-- a trial's free-text eligibility_criteria into short criteria, once per trial
-- version: class (record / screening / subgroup / administrative), who it applies
-- to, OR groups, a question for Jev, and number-only code checks. Shape:
-- site/src/engine/preprocess/schema.ts (TrialCriteria).
--
-- Stored on the trial row because it is one document per trial, always read with
-- the trial, and replaced whole when the registry text changes.
--
-- Public registry data derived from ClinicalTrials.gov. No patient data.
-- Runs after 00001_trials.sql (name order), so trials exists.

alter table public.trials
  add column if not exists criteria_questions    jsonb,
  -- Skip key: '<last_update_post_date>/p<prompt version>', e.g. '2026-10-02/p3'.
  -- Same key and status 'llm' means the trial is not sent to Gemini again.
  add column if not exists criteria_version      text,
  -- 'gemini-3.5-flash-lite', or 'naive-splitter' when the model output failed validation.
  add column if not exists criteria_model        text,
  add column if not exists criteria_generated_at timestamptz;

alter table public.trials drop constraint if exists trials_criteria_questions_is_object;
alter table public.trials add constraint trials_criteria_questions_is_object
  check (criteria_questions is null or jsonb_typeof(criteria_questions) = 'object');
