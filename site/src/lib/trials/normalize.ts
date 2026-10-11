import type { CtgovStudy } from './ctgov';

/** Row shapes for public.trials / public.trial_locations (snake_case = column names). */
export interface TrialRow {
  nct_id: string;
  brief_title: string;
  official_title: string | null;
  overall_status: string;
  study_type: string | null;
  phases: string[];
  conditions: string[];
  keywords: string[];
  condition_meshes: { id: string; term: string }[];
  condition_mesh_ancestors: { id: string; term: string }[];
  interventions: { type: string | null; name: string | null; otherNames: string[] }[];
  lead_sponsor: string | null;
  lead_sponsor_class: string | null;
  brief_summary: string | null;
  eligibility_criteria: string | null;
  sex: string | null;
  minimum_age_years: number | null;
  maximum_age_years: number | null;
  healthy_volunteers: boolean | null;
  std_ages: string[];
  enrollment_count: number | null;
  start_date: string | null;
  primary_completion_date: string | null;
  last_update_post_date: string;
  raw: CtgovStudy;
  fetched_at: string;
}

export interface TrialLocationRow {
  nct_id: string;
  facility: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  contacts: { name: string | null; role: string | null; phone: string | null; email: string | null }[];
}

const UNIT_TO_YEARS: Record<string, number> = {
  year: 1,
  month: 1 / 12,
  week: 7 / 365.25,
  day: 1 / 365.25,
  hour: 1 / (365.25 * 24),
  minute: 1 / (365.25 * 24 * 60),
};

/**
 * "30 Years" → 30, "6 Months" → 0.5. Missing or unparseable → null, which the
 * schema treats as "no limit" (ClinicalTrials.gov omits the field when there is none).
 */
export function parseAgeYears(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s+([a-z]+?)s?$/i);
  if (!match) return null;
  const factor = UNIT_TO_YEARS[match[2].toLowerCase()];
  if (factor === undefined) return null;
  return Math.round(Number(match[1]) * factor * 100) / 100;
}

export function toTrialRow(study: CtgovStudy, fetchedAt: string): TrialRow {
  const p = study.protocolSection;
  const eligibility = p.eligibilityModule ?? {};
  const meshes = study.derivedSection?.conditionBrowseModule;
  const lastUpdate = p.statusModule.lastUpdatePostDateStruct?.date;
  if (!lastUpdate) {
    throw new Error(`Study ${p.identificationModule.nctId} has no lastUpdatePostDate`);
  }

  return {
    nct_id: p.identificationModule.nctId,
    brief_title: p.identificationModule.briefTitle ?? p.identificationModule.nctId,
    official_title: p.identificationModule.officialTitle ?? null,
    overall_status: p.statusModule.overallStatus,
    study_type: p.designModule?.studyType ?? null,
    phases: p.designModule?.phases ?? [],
    conditions: p.conditionsModule?.conditions ?? [],
    keywords: p.conditionsModule?.keywords ?? [],
    condition_meshes: (meshes?.meshes ?? []).map(({ id, term }) => ({ id, term })),
    condition_mesh_ancestors: (meshes?.ancestors ?? []).map(({ id, term }) => ({ id, term })),
    interventions: (p.armsInterventionsModule?.interventions ?? []).map((i) => ({
      type: i.type ?? null,
      name: i.name ?? null,
      otherNames: i.otherNames ?? [],
    })),
    lead_sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    lead_sponsor_class: p.sponsorCollaboratorsModule?.leadSponsor?.class ?? null,
    brief_summary: p.descriptionModule?.briefSummary ?? null,
    eligibility_criteria: eligibility.eligibilityCriteria ?? null,
    sex: eligibility.sex ?? null,
    minimum_age_years: parseAgeYears(eligibility.minimumAge),
    maximum_age_years: parseAgeYears(eligibility.maximumAge),
    healthy_volunteers: eligibility.healthyVolunteers ?? null,
    std_ages: eligibility.stdAges ?? [],
    enrollment_count: p.designModule?.enrollmentInfo?.count ?? null,
    start_date: p.statusModule.startDateStruct?.date ?? null,
    primary_completion_date: p.statusModule.primaryCompletionDateStruct?.date ?? null,
    last_update_post_date: lastUpdate,
    raw: study,
    fetched_at: fetchedAt,
  };
}

export function toLocationRows(study: CtgovStudy): TrialLocationRow[] {
  const nctId = study.protocolSection.identificationModule.nctId;
  const locations = study.protocolSection.contactsLocationsModule?.locations ?? [];

  return locations.map((loc) => ({
    nct_id: nctId,
    facility: loc.facility ?? null,
    status: loc.status ?? null,
    city: loc.city ?? null,
    state: loc.state ?? null,
    zip: loc.zip ?? null,
    country: loc.country ?? null,
    lat: loc.geoPoint?.lat ?? null,
    lon: loc.geoPoint?.lon ?? null,
    contacts: (loc.contacts ?? []).map((c) => ({
      name: c.name ?? null,
      role: c.role ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    })),
  }));
}
