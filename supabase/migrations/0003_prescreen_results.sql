-- Pre-screen results: one row per (patient, trial) the matcher evaluated.
--
-- Written by site/scripts/match.ts --write (server, secret key). Read by:
--   - the doctor app: trial cards count rows by bucket; the patient drill-down reads criteria
--   - the outreach caller (voice-agent/app/prescreen.py): calls this practice's candidates
-- so the number a doctor sees is the number that gets called.
--
-- These rows are patient data: they live with the practice's patients, under the
-- same row-level security. Only aggregate counts leave a practice.
-- Runs after 0001_practices_patients.sql (name order), so patients and practices exist.

-- Lets a result's practice_id be tied to its patient's practice (composite key below).
alter table public.patients drop constraint if exists patients_id_practice_key;
alter table public.patients add constraint patients_id_practice_key unique (id, practice_id);

create table if not exists public.prescreen_results (
  patient_id         uuid not null,
  nct_id             text not null references public.trials (nct_id) on delete cascade,
  -- Always the patient's own practice: RLS and the counts view filter on it.
  practice_id        text not null,
  -- Same names as the caller: candidate | chart_review | not_a_match.
  bucket             text not null check (bucket in ('candidate', 'chart_review', 'not_a_match')),
  -- Mean probability of 'accept' over the record criteria; ranks patients in a bucket.
  score              real not null,
  -- Why the patient matched the trial's disease, e.g. 'Pulmonary emphysema (disorder)' or 'bmi ≥ 30'.
  condition_match    text not null,
  -- Every criterion: { id, kind, answer, probabilities, decided_by: jev | code | not_applicable }.
  criteria           jsonb not null,
  -- Criteria no record can settle (screening tests, consent, subgroup items): confirm on the call.
  review_items       text[] not null default '{}',
  -- Jev's probability on its weakest answer; null when code decided everything.
  min_confidence     real,
  -- Jev answers under 0.75, e.g. 'inc_6 accept 0.62: Did the patient have ...'.
  uncertain_criteria text[] not null default '{}',
  -- Hash of the patient state + the trial's criteria version + model: unchanged means skip.
  input_hash         text not null,
  model              text not null,
  evaluated_at       timestamptz not null default now(),
  primary key (patient_id, nct_id),
  foreign key (patient_id, practice_id) references public.patients (id, practice_id) on delete cascade
);

-- Leads with nct_id so it also covers the trials foreign key.
create index if not exists prescreen_results_trial_practice_idx
  on public.prescreen_results (nct_id, practice_id, bucket);
create index if not exists prescreen_results_practice_idx
  on public.prescreen_results (practice_id);

alter table public.prescreen_results enable row level security;

-- A signed-in practice member reads only their own practice's results (same rule as patients).
-- No insert/update/delete policies: only the server (secret key) writes.
drop policy if exists "members read own prescreen results" on public.prescreen_results;
create policy "members read own prescreen results" on public.prescreen_results for select to authenticated
  using (practice_id = (select practice_id from public.practice_members where user_id = (select auth.uid())));

-- Per-trial counts for one practice's trial cards ("14 candidates, 6 need chart review").
-- Runs with the caller's rights, so RLS limits it to the member's own practice. A server
-- reader using the secret key bypasses RLS and must filter practice_id itself. No small-cell
-- suppression: never use this for a cross-practice (sponsor) view.
create or replace view public.prescreen_trial_counts
with (security_invoker = true) as
  select practice_id,
         nct_id,
         count(*) filter (where bucket = 'candidate')    as candidates,
         count(*) filter (where bucket = 'chart_review') as chart_review,
         count(*) filter (where bucket = 'not_a_match')  as not_a_match,
         max(evaluated_at)                               as evaluated_at
  from public.prescreen_results
  group by practice_id, nct_id;
