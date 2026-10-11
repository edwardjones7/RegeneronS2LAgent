-- Structured eligibility criteria on each trial.
--
-- site/scripts/preprocess-criteria.ts (or the trial sync job) asks a generative
-- model to split a trial's free-text eligibility_criteria into short,
-- record-answerable questions, once per trial version. The result lives on the
-- trial row because it is one document per trial, always read together with
-- the trial, and replaced as a whole when the registry text changes. A
-- per-criterion table would only pay off if criteria were edited or queried
-- one by one, which nothing does yet.
--
-- This is public registry data derived from ClinicalTrials.gov. No patient data.
--
-- The trials table is created by the sync job, not by an earlier migration here,
-- hence `if exists`.

alter table if exists trials
  -- The document: { schema_version, nct_id, source_version, prompt_version, model,
  -- status: 'llm' | 'fallback', generated_at, warnings[], criteria[] }.
  -- Each criterion: { id, kind, class, applies_to, question, sections, group,
  -- original_text, code_check }. See site/src/engine/preprocess/schema.ts.
  add column if not exists criteria_questions    jsonb,
  -- Skip key: '<last_update_post_date>/p<prompt version>', e.g. '2026-10-02/p1'.
  -- Unchanged key + status 'llm' means the trial is not sent to the model again.
  add column if not exists criteria_version      text,
  -- OpenRouter model slug that produced it, or 'naive-splitter' for the fallback.
  add column if not exists criteria_model        text,
  add column if not exists criteria_generated_at timestamptz;

do $$
begin
  if to_regclass('public.trials') is not null and not exists (
    select 1 from pg_constraint where conname = 'trials_criteria_questions_is_object'
  ) then
    alter table trials add constraint trials_criteria_questions_is_object
      check (criteria_questions is null or jsonb_typeof(criteria_questions) = 'object');
  end if;
end $$;
