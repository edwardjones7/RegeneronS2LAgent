/**
 * Which slice of ClinicalTrials.gov we ingest. Each scope is a set of API v2
 * query params; the sync adds the status and date filters itself.
 *
 * Sizes checked 2026-10-10 (recruiting + not yet recruiting, interventional):
 * Regeneron (lead or collaborator) 147, within 50 mi of New Brunswick NJ 4,034, all US 20,656.
 * At ~20 KB of raw JSON per study, all-US would crowd a free Supabase project.
 */
export interface TrialScope {
  description: string;
  params: Record<string, string>;
  /** AREA[...] expressions ANDed into filter.advanced. */
  advanced: string[];
}

export const TRIAL_SCOPES = {
  'regeneron-interventional': {
    description: 'Interventional trials with Regeneron as lead sponsor or collaborator',
    params: { 'query.spons': 'Regeneron' },
    advanced: ['AREA[StudyType]INTERVENTIONAL'],
  },
} satisfies Record<string, TrialScope>;

export type TrialScopeId = keyof typeof TRIAL_SCOPES;

export const DEFAULT_TRIAL_SCOPE: TrialScopeId = 'regeneron-interventional';

export function isTrialScopeId(value: string): value is TrialScopeId {
  return value in TRIAL_SCOPES;
}
