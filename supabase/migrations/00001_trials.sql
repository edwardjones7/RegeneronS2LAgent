-- Trials pulled from the ClinicalTrials.gov API v2.
-- See .claude/context/clinical-trials-ingestion.md.
--
-- RLS is enabled with no policies: only the backend (secret key) can read or
-- write these tables. Public registry data only, no patient data.

create table public.trials (
  nct_id                  text primary key,
  brief_title             text not null,
  official_title          text,
  overall_status          text not null,
  study_type              text,
  phases                  text[] not null default '{}',
  conditions              text[] not null default '{}',
  keywords                text[] not null default '{}',
  -- MeSH terms from derivedSection.conditionBrowseModule: [{ id, term }]
  condition_meshes        jsonb not null default '[]',
  condition_mesh_ancestors jsonb not null default '[]',
  -- [{ type, name, otherNames }]
  interventions           jsonb not null default '[]',
  lead_sponsor            text,
  lead_sponsor_class      text,
  brief_summary           text,
  eligibility_criteria    text,
  sex                     text,            -- ALL | FEMALE | MALE
  minimum_age_years       numeric,         -- null = no minimum
  maximum_age_years       numeric,         -- null = no maximum
  healthy_volunteers      boolean,
  std_ages                text[] not null default '{}',
  enrollment_count        integer,
  -- ClinicalTrials.gov dates can be partial ("2026-05"), so kept as text.
  start_date              text,
  primary_completion_date text,
  last_update_post_date   date not null,
  raw                     jsonb not null,
  fetched_at              timestamptz not null default now()
);

create index trials_overall_status_idx on public.trials (overall_status);
create index trials_lead_sponsor_idx on public.trials (lead_sponsor);
create index trials_conditions_idx on public.trials using gin (conditions);

-- One row per trial location. Replaced wholesale on each sync of its trial.
create table public.trial_sites (
  id         bigint generated always as identity primary key,
  nct_id     text not null references public.trials (nct_id) on delete cascade,
  facility   text,
  status     text,                         -- per-site status, can differ from the trial's
  city       text,
  state      text,
  zip        text,
  country    text,
  lat        double precision,
  lon        double precision,
  contacts   jsonb not null default '[]'   -- [{ name, role, phone, email }]
);

create index trial_sites_nct_id_idx on public.trial_sites (nct_id);
create index trial_sites_status_idx on public.trial_sites (status);

-- One row per sync run; the last successful run per scope drives incremental syncs.
create table public.trial_sync_runs (
  id               bigint generated always as identity primary key,
  scope            text not null,
  mode             text not null check (mode in ('full', 'incremental')),
  since            date,
  status           text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  ctgov_data_timestamp text,
  studies_upserted integer not null default 0,
  error            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index trial_sync_runs_scope_idx on public.trial_sync_runs (scope, status, started_at desc);

alter table public.trials enable row level security;
alter table public.trial_sites enable row level security;
alter table public.trial_sync_runs enable row level security;
