-- trial_sites holds locations the sponsor has already activated (from ClinicalTrials.gov).
-- Renamed so it isn't confused with our own practices, which become candidate
-- sites only when a doctor accepts a trial.

alter table public.trial_sites rename to trial_locations;

alter table public.trial_locations rename constraint trial_sites_pkey to trial_locations_pkey;
alter table public.trial_locations rename constraint trial_sites_nct_id_fkey to trial_locations_nct_id_fkey;
alter sequence public.trial_sites_id_seq rename to trial_locations_id_seq;

alter index public.trial_sites_nct_id_idx rename to trial_locations_nct_id_idx;
alter index public.trial_sites_status_idx rename to trial_locations_status_idx;
