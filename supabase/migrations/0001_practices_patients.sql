-- Practices and their patients.
--
-- In this demo the database stands in for each practice's own EHR. Every
-- patient belongs to exactly one practice, and row-level security means a
-- signed-in practice user can read only their own practice's patients.
-- Nothing here is pooled across practices; the sponsor side reads only the
-- de-identified counts function at the bottom.
--
-- Data is synthetic (Synthea). Practices are the county groups Synthea placed
-- patients in; no practice or doctor names are invented.

create table if not exists practices (
  id            text primary key,          -- slug, e.g. 'middlesex'
  name          text not null,             -- 'Middlesex County'
  state         text not null default 'NJ',
  created_at    timestamptz not null default now()
);

create table if not exists patients (
  id            uuid primary key,          -- Synthea patient ID
  practice_id   text not null references practices (id),
  name          text not null,
  birth_date    date not null,
  sex           text not null check (sex in ('M', 'F')),
  race          text,
  ethnicity     text,
  -- The clinical record, in the same shape as data/synthea-nj.json:
  -- conditions, medications, procedures, observations, weights, acuteVisits.
  record        jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists patients_practice_idx on patients (practice_id);

-- Display names for the SNOMED, RxNorm and LOINC codes used in records.
create table if not exists codes (
  system        text not null check (system in ('snomed', 'rxnorm', 'loinc')),
  code          text not null,
  description   text not null,
  primary key (system, code)
);

-- Which practice a signed-in user works at.
create table if not exists practice_members (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  practice_id   text not null references practices (id),
  created_at    timestamptz not null default now()
);

alter table practices        enable row level security;
alter table patients         enable row level security;
alter table codes            enable row level security;
alter table practice_members enable row level security;

-- A practice user sees their own practice and its patients, nothing else.
drop policy if exists "members read own practice" on practices;
create policy "members read own practice" on practices for select to authenticated
  using (id = (select practice_id from practice_members where user_id = auth.uid()));

drop policy if exists "members read own patients" on patients;
create policy "members read own patients" on patients for select to authenticated
  using (practice_id = (select practice_id from practice_members where user_id = auth.uid()));

drop policy if exists "members read own membership" on practice_members;
create policy "members read own membership" on practice_members for select to authenticated
  using (user_id = auth.uid());

-- Code names aren't patient data; any signed-in user can read them.
drop policy if exists "signed-in users read codes" on codes;
create policy "signed-in users read codes" on codes for select to authenticated using (true);

-- Patients per practice, the only thing that leaves a practice. Counts under 5
-- come back as null (small-cell suppression), because a tiny count can identify
-- someone. Emits aggregate counts only.
create or replace function practice_patient_counts()
returns table (practice_id text, practice_name text, patients bigint)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, case when count(x.id) < 5 then null else count(x.id) end
  from practices p
  left join patients x on x.practice_id = p.id
  group by p.id, p.name
  order by p.name;
$$;

revoke all on function practice_patient_counts() from public;
grant execute on function practice_patient_counts() to authenticated;
