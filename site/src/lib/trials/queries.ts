import supabase from '@/lib/utils/db/client';
import { listProtocolIds } from '@/lib/protocols';

/** Statuses a practice can still join or refer into. */
const OPEN_STATUSES = ['RECRUITING', 'NOT_YET_RECRUITING'];

/** The demo practices are in New Jersey. */
const HOME_STATE = 'New Jersey';

export interface TrialListItem {
  nctId: string;
  title: string;
  conditions: string[];
  drug: string | null;
  phases: string[];
  sponsor: string | null;
  enrollment: number | null;
  status: string;
  primaryCompletion: string | null;
  njLocations: number;
  njRecruiting: number;
  hasProtocol: boolean;
}

export interface TrialLocation {
  facility: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface TrialDetail extends TrialListItem {
  officialTitle: string | null;
  summary: string | null;
  eligibilityCriteria: string | null;
  sex: string | null;
  minimumAge: number | null;
  maximumAge: number | null;
  healthyVolunteers: boolean | null;
  startDate: string | null;
  lastUpdate: string;
  interventions: { type: string | null; name: string | null }[];
  locations: TrialLocation[];
}

interface TrialRowSubset {
  nct_id: string;
  brief_title: string;
  conditions: string[];
  interventions: { type: string | null; name: string | null }[];
  phases: string[];
  lead_sponsor: string | null;
  enrollment_count: number | null;
  overall_status: string;
  primary_completion_date: string | null;
}

const LIST_COLUMNS =
  'nct_id, brief_title, conditions, interventions, phases, lead_sponsor, enrollment_count, overall_status, primary_completion_date';

function toListItem(row: TrialRowSubset, nj: { total: number; recruiting: number }, protocolIds: Set<string>): TrialListItem {
  return {
    nctId: row.nct_id,
    title: row.brief_title,
    conditions: row.conditions,
    drug: row.interventions.find((i) => i.type !== 'OTHER')?.name ?? row.interventions[0]?.name ?? null,
    phases: row.phases,
    sponsor: row.lead_sponsor,
    enrollment: row.enrollment_count,
    status: row.overall_status,
    primaryCompletion: row.primary_completion_date,
    njLocations: nj.total,
    njRecruiting: nj.recruiting,
    hasProtocol: protocolIds.has(row.nct_id),
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

/** Open trials, demo protocols first, then most locations in New Jersey. */
export async function listOpenTrials(): Promise<TrialListItem[]> {
  const [{ data, error }, njCounts] = await Promise.all([
    supabase.from('trials').select(LIST_COLUMNS).in('overall_status', OPEN_STATUSES),
    getHomeStateLocationCounts(),
  ]);
  if (error) throw new Error(`Failed to load trials: ${error.message}`);

  const protocolIds = new Set(listProtocolIds());
  return (data as TrialRowSubset[])
    .map((row) => toListItem(row, njCounts.get(row.nct_id) ?? { total: 0, recruiting: 0 }, protocolIds))
    .sort(
      (a, b) =>
        Number(b.hasProtocol) - Number(a.hasProtocol) ||
        b.njRecruiting - a.njRecruiting ||
        a.title.localeCompare(b.title)
    );
}

export async function getTrialDetail(nctId: string): Promise<TrialDetail | null> {
  const [{ data: row, error }, { data: locations, error: locationsError }] = await Promise.all([
    supabase
      .from('trials')
      .select(
        `${LIST_COLUMNS}, official_title, brief_summary, eligibility_criteria, sex, minimum_age_years, maximum_age_years, healthy_volunteers, start_date, last_update_post_date`
      )
      .eq('nct_id', nctId)
      .maybeSingle(),
    supabase.from('trial_locations').select('facility, status, city, state, country').eq('nct_id', nctId),
  ]);
  if (error) throw new Error(`Failed to load trial: ${error.message}`);
  if (locationsError) throw new Error(`Failed to load trial locations: ${locationsError.message}`);
  if (!row) return null;

  const rank = (l: TrialLocation) => (l.state === HOME_STATE ? 0 : l.country === 'United States' ? 1 : 2);
  const sorted = [...locations].sort(
    (a, b) => rank(a) - rank(b) || (a.state ?? '').localeCompare(b.state ?? '') || (a.city ?? '').localeCompare(b.city ?? '')
  );
  const nj = sorted.filter((l) => l.state === HOME_STATE);

  return {
    ...toListItem(
      row as TrialRowSubset,
      { total: nj.length, recruiting: nj.filter((l) => l.status === 'RECRUITING').length },
      new Set(listProtocolIds())
    ),
    officialTitle: row.official_title,
    summary: row.brief_summary,
    eligibilityCriteria: row.eligibility_criteria,
    sex: row.sex,
    minimumAge: row.minimum_age_years,
    maximumAge: row.maximum_age_years,
    healthyVolunteers: row.healthy_volunteers,
    startDate: row.start_date,
    lastUpdate: row.last_update_post_date,
    interventions: (row.interventions as { type: string | null; name: string | null }[]).map(({ type, name }) => ({ type, name })),
    locations: sorted,
  };
}
