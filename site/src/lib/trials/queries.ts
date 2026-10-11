import type { StructuredCriterion, TrialCriteria } from '@/engine/preprocess/schema';
import supabase from '@/lib/utils/db/client';
import { classifyTrial, type TherapeuticArea } from './areas';
import type { PrescreenCounts } from './prescreen';

export { canFill, type PrescreenCounts } from './prescreen';

/** Statuses a practice can still join or refer into. */
const OPEN_STATUSES = ['RECRUITING', 'NOT_YET_RECRUITING'];

/** The demo practices are in New Jersey. */
const HOME_STATE = 'New Jersey';

export interface TrialListItem {
  nctId: string;
  title: string;
  /** Short display name: the first listed condition. */
  indication: string;
  area: TherapeuticArea;
  /** Start of the registry's brief summary, for the card. */
  blurb: string | null;
  conditions: string[];
  drug: string | null;
  phases: string[];
  sponsor: string | null;
  enrollment: number | null;
  minimumAge: number | null;
  maximumAge: number | null;
  /** ALL, FEMALE or MALE. */
  sex: string | null;
  status: string;
  primaryCompletion: string | null;
  njLocations: number;
  njRecruiting: number;
  /** This practice's pre-screen results for the trial; null until the matcher has run on it. */
  prescreen: PrescreenCounts | null;
}

export interface TrialLocation {
  facility: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface TrialArm {
  /** EXPERIMENTAL, PLACEBO_COMPARATOR, ACTIVE_COMPARATOR, NO_INTERVENTION, … */
  type: string | null;
  label: string;
  description: string | null;
}

export interface TrialDetail extends TrialListItem {
  officialTitle: string | null;
  summary: string | null;
  eligibilityCriteria: string | null;
  healthyVolunteers: boolean | null;
  startDate: string | null;
  lastUpdate: string;
  /** From the registry's design module, e.g. RANDOMIZED / NONE (open label) / TREATMENT. */
  design: { allocation: string | null; masking: string | null; purpose: string | null };
  arms: TrialArm[];
  primaryOutcomes: { measure: string; timeFrame: string | null }[];
  /** Collaborators other than the lead sponsor, e.g. Regeneron on an academic-led trial. */
  collaborators: string[];
  /** The registry's central contact, for a practice that wants to ask about joining. */
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  locations: TrialLocation[];
}

/** Registry modules pulled from `raw` for the detail view (ClinicalTrials.gov API v2 field names). */
interface RawDetail {
  design_info: { allocation?: string; maskingInfo?: { masking?: string }; primaryPurpose?: string } | null;
  arm_groups: { type?: string; label?: string; description?: string }[] | null;
  primary_outcomes: { measure?: string; timeFrame?: string }[] | null;
  collaborators: { name?: string }[] | null;
  central_contacts: { name?: string; email?: string; phone?: string }[] | null;
}

/** Columns selected for the detail view; Supabase can't infer types from the built-up select string. */
interface DetailRow extends TrialRowSubset, RawDetail {
  official_title: string | null;
  eligibility_criteria: string | null;
  healthy_volunteers: boolean | null;
  start_date: string | null;
  last_update_post_date: string;
}

const RAW_DETAIL_COLUMNS = [
  'design_info:raw->protocolSection->designModule->designInfo',
  'arm_groups:raw->protocolSection->armsInterventionsModule->armGroups',
  'primary_outcomes:raw->protocolSection->outcomesModule->primaryOutcomes',
  'collaborators:raw->protocolSection->sponsorCollaboratorsModule->collaborators',
  'central_contacts:raw->protocolSection->contactsLocationsModule->centralContacts',
].join(', ');

interface TrialRowSubset {
  nct_id: string;
  brief_title: string;
  conditions: string[];
  brief_summary: string | null;
  condition_meshes: { term: string }[] | null;
  condition_mesh_ancestors: { term: string }[] | null;
  interventions: { type: string | null; name: string | null }[];
  phases: string[];
  lead_sponsor: string | null;
  enrollment_count: number | null;
  minimum_age_years: number | null;
  maximum_age_years: number | null;
  sex: string | null;
  overall_status: string;
  primary_completion_date: string | null;
}

const LIST_COLUMNS =
  'nct_id, brief_title, brief_summary, conditions, condition_meshes, condition_mesh_ancestors, interventions, phases, lead_sponsor, enrollment_count, minimum_age_years, maximum_age_years, sex, overall_status, primary_completion_date';

/** Regeneron study drugs: antibodies (-mab), traps (-cept), siRNAs (-siran), peptides (-tide), or a REGN code. */
const STUDY_DRUG = /REGN|mab\b|cept\b|siran\b|tide\b/i;

/** The study drug rather than a comparator, background therapy, or procedure. */
function pickDrug(interventions: { type: string | null; name: string | null }[]): string | null {
  const drugs = interventions.filter((i) => i.name && ['DRUG', 'BIOLOGICAL', 'GENETIC', 'COMBINATION_PRODUCT'].includes(i.type ?? ''));
  const name = (drugs.find((i) => STUDY_DRUG.test(i.name!)) ?? drugs[0] ?? interventions[0])?.name ?? null;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

/** Collapses whitespace and cuts to a card-sized excerpt; the card clamps it further. */
function toBlurb(summary: string | null): string | null {
  if (!summary) return null;
  const text = summary.replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 320).replace(/\s\S*$/, '')}…` : text;
}

/** "Asthma (Moderate-to-Severe)" → "Asthma" */
const stripParenthetical = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

function toListItem(
  row: TrialRowSubset,
  nj: { total: number; recruiting: number },
  prescreen: PrescreenCounts | null
): TrialListItem {
  const meshTerms = [...(row.condition_meshes ?? []), ...(row.condition_mesh_ancestors ?? [])].map((m) => m.term);
  return {
    nctId: row.nct_id,
    title: row.brief_title,
    indication: row.conditions[0] ? stripParenthetical(row.conditions[0]) : row.brief_title,
    area: classifyTrial(row.conditions, meshTerms),
    blurb: toBlurb(row.brief_summary),
    conditions: row.conditions,
    drug: pickDrug(row.interventions),
    phases: row.phases,
    sponsor: row.lead_sponsor,
    enrollment: row.enrollment_count,
    minimumAge: row.minimum_age_years,
    maximumAge: row.maximum_age_years,
    sex: row.sex,
    status: row.overall_status,
    primaryCompletion: row.primary_completion_date,
    njLocations: nj.total,
    njRecruiting: nj.recruiting,
    prescreen,
  };
}

async function getHomeStateLocationCounts(): Promise<Map<string, { total: number; recruiting: number }>> {
  const { data, error } = await supabase.from('trial_locations').select('nct_id, status').eq('state', HOME_STATE);
  if (error) throw new Error(`Failed to load trial locations: ${error.message}`);

  const counts = new Map<string, { total: number; recruiting: number }>();
  for (const { nct_id, status } of data) {
    const entry = counts.get(nct_id) ?? { total: 0, recruiting: 0 };
    entry.total += 1;
    if (status === 'RECRUITING') entry.recruiting += 1;
    counts.set(nct_id, entry);
  }
  return counts;
}

export async function countOpenTrials(): Promise<number> {
  const { count, error } = await supabase
    .from('trials')
    .select('nct_id', { count: 'exact', head: true })
    .in('overall_status', OPEN_STATUSES);
  if (error) throw new Error(`Failed to count trials: ${error.message}`);
  return count ?? 0;
}

interface CountRow {
  nct_id: string;
  candidates: number;
  chart_review: number;
  not_a_match: number;
  evaluated_at: string;
}

const PAGE = 1000;

/**
 * One practice's pre-screen counts per trial, from the `prescreen_trial_counts` view.
 * The server client bypasses RLS, so the practice filter here is the only thing keeping
 * one practice's counts from another's. Emits aggregate counts only.
 */
export async function getPrescreenCounts(practiceId: string, nctId?: string): Promise<Map<string, PrescreenCounts>> {
  const counts = new Map<string, PrescreenCounts>();
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('prescreen_trial_counts')
      .select('nct_id, candidates, chart_review, not_a_match, evaluated_at')
      .eq('practice_id', practiceId);
    if (nctId) query = query.eq('nct_id', nctId);
    const { data, error } = await query.order('nct_id').range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load pre-screen counts: ${error.message}`);
    for (const r of data as CountRow[]) {
      counts.set(r.nct_id, {
        candidates: Number(r.candidates),
        review: Number(r.chart_review),
        notAMatch: Number(r.not_a_match),
        evaluatedAt: r.evaluated_at,
      });
    }
    if (data.length < PAGE) return counts;
  }
}

/** Most candidates first, then most chart-review patients, then most recruiting NJ sites. */
function byFit(a: TrialListItem, b: TrialListItem): number {
  return (
    (b.prescreen?.candidates ?? 0) - (a.prescreen?.candidates ?? 0) ||
    (b.prescreen?.review ?? 0) - (a.prescreen?.review ?? 0) ||
    b.njRecruiting - a.njRecruiting ||
    a.title.localeCompare(b.title)
  );
}

/** Open trials with this practice's pre-screen counts, ranked by how many of its patients fit. */
export async function listOpenTrials(practiceId: string): Promise<TrialListItem[]> {
  const [{ data, error }, njCounts, prescreen] = await Promise.all([
    supabase.from('trials').select(LIST_COLUMNS).in('overall_status', OPEN_STATUSES),
    getHomeStateLocationCounts(),
    getPrescreenCounts(practiceId),
  ]);
  if (error) throw new Error(`Failed to load trials: ${error.message}`);

  return (data as TrialRowSubset[])
    .map((row) => toListItem(row, njCounts.get(row.nct_id) ?? { total: 0, recruiting: 0 }, prescreen.get(row.nct_id) ?? null))
    .sort(byFit);
}

/** The trial's structured criteria (`trials.criteria_questions`), or null if not built yet. Trial data only. */
export async function getTrialCriteria(nctId: string): Promise<StructuredCriterion[] | null> {
  const { data, error } = await supabase.from('trials').select('criteria_questions').eq('nct_id', nctId).maybeSingle();
  if (error) throw new Error(`Failed to load trial criteria: ${error.message}`);
  const doc = data?.criteria_questions as TrialCriteria | null | undefined;
  return doc?.criteria?.length ? doc.criteria : null;
}

/** One trial's registry record, with `practiceId`'s pre-screen counts when given. */
export async function getTrialDetail(nctId: string, practiceId?: string): Promise<TrialDetail | null> {
  const [{ data, error }, { data: locations, error: locationsError }] = await Promise.all([
    supabase
      .from('trials')
      .select(
        `${LIST_COLUMNS}, official_title, eligibility_criteria, healthy_volunteers, start_date, last_update_post_date, ${RAW_DETAIL_COLUMNS}`
      )
      .eq('nct_id', nctId)
      .maybeSingle(),
    supabase.from('trial_locations').select('facility, status, city, state, country').eq('nct_id', nctId),
  ]);
  if (error) throw new Error(`Failed to load trial: ${error.message}`);
  const prescreen = practiceId ? ((await getPrescreenCounts(practiceId, nctId)).get(nctId) ?? null) : null;
  if (locationsError) throw new Error(`Failed to load trial locations: ${locationsError.message}`);
  if (!data) return null;
  const row = data as unknown as DetailRow;

  const rank = (l: TrialLocation) => (l.state === HOME_STATE ? 0 : l.country === 'United States' ? 1 : 2);
  const sorted = [...locations].sort(
    (a, b) => rank(a) - rank(b) || (a.state ?? '').localeCompare(b.state ?? '') || (a.city ?? '').localeCompare(b.city ?? '')
  );
  const nj = sorted.filter((l) => l.state === HOME_STATE);
  const contact = row.central_contacts?.[0];

  return {
    ...toListItem(
      row,
      { total: nj.length, recruiting: nj.filter((l) => l.status === 'RECRUITING').length },
      prescreen
    ),
    officialTitle: row.official_title,
    summary: row.brief_summary,
    eligibilityCriteria: row.eligibility_criteria,
    healthyVolunteers: row.healthy_volunteers,
    startDate: row.start_date,
    lastUpdate: row.last_update_post_date,
    design: {
      allocation: row.design_info?.allocation ?? null,
      masking: row.design_info?.maskingInfo?.masking ?? null,
      purpose: row.design_info?.primaryPurpose ?? null,
    },
    arms: (row.arm_groups ?? []).map((a) => ({ type: a.type ?? null, label: a.label ?? 'Arm', description: a.description ?? null })),
    primaryOutcomes: (row.primary_outcomes ?? [])
      .filter((o) => o.measure)
      .map((o) => ({ measure: o.measure!, timeFrame: o.timeFrame ?? null })),
    collaborators: (row.collaborators ?? []).map((c) => c.name).filter((n): n is string => Boolean(n)),
    contact: contact ? { name: contact.name ?? null, email: contact.email ?? null, phone: contact.phone ?? null } : null,
    locations: sorted,
  };
}
