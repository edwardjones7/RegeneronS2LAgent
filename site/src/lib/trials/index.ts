import supabase from '@/lib/utils/db/client';
import { fetchStudyPages, getDataTimestamp, type CtgovStudy } from './ctgov';
import { toLocationRows, toTrialRow } from './normalize';
import { TRIAL_SCOPES, type TrialScopeId } from './scopes';

export { TRIAL_SCOPES, DEFAULT_TRIAL_SCOPE, isTrialScopeId, type TrialScopeId } from './scopes';

export type SyncMode = 'full' | 'incremental';

export interface SyncResult {
  scope: TrialScopeId;
  mode: SyncMode;
  since: string | null;
  ctgovDataTimestamp: string;
  studiesUpserted: number;
  skipped: boolean;
}

/** Statuses a doctor can still refer patients into. */
const OPEN_STATUSES = 'RECRUITING,NOT_YET_RECRUITING';

/** Rows per write. Also keeps `.in('nct_id', …)` URLs short. */
const BATCH_SIZE = 200;

/** Re-fetch a day of overlap so studies posted during the last run aren't missed. */
const INCREMENTAL_OVERLAP_DAYS = 1;

interface LastRun {
  started_at: string;
  ctgov_data_timestamp: string | null;
}

async function getLastSuccessfulRun(scope: TrialScopeId): Promise<LastRun | null> {
  const { data, error } = await supabase
    .from('trial_sync_runs')
    .select('started_at, ctgov_data_timestamp')
    .eq('scope', scope)
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read last sync run: ${error.message}`);
  return data;
}

function daysBefore(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Full sync: every open trial in the scope.
 * Incremental: every trial in the scope updated since the last successful run,
 * whatever its status, so trials that closed get their new status written.
 */
function buildQuery(scope: TrialScopeId, mode: SyncMode, since: string | null): Record<string, string> {
  const { params, advanced } = TRIAL_SCOPES[scope];
  const filters = [...advanced];
  const query: Record<string, string> = { ...params };

  if (mode === 'full') {
    query['filter.overallStatus'] = OPEN_STATUSES;
  } else {
    filters.push(`AREA[LastUpdatePostDate]RANGE[${since},MAX]`);
  }
  if (filters.length) query['filter.advanced'] = filters.join(' AND ');
  return query;
}

async function writeBatch(studies: CtgovStudy[], fetchedAt: string): Promise<void> {
  const trialRows = studies.map((s) => toTrialRow(s, fetchedAt));
  const nctIds = trialRows.map((t) => t.nct_id);

  const { error: trialError } = await supabase.from('trials').upsert(trialRows, { onConflict: 'nct_id' });
  if (trialError) throw new Error(`Failed to upsert trials: ${trialError.message}`);

  // Locations have no stable ID upstream, so replace them per trial.
  const { error: deleteError } = await supabase.from('trial_locations').delete().in('nct_id', nctIds);
  if (deleteError) throw new Error(`Failed to clear trial locations: ${deleteError.message}`);

  const locationRows = studies.flatMap(toLocationRows);
  for (let i = 0; i < locationRows.length; i += 1000) {
    const { error } = await supabase.from('trial_locations').insert(locationRows.slice(i, i + 1000));
    if (error) throw new Error(`Failed to insert trial locations: ${error.message}`);
  }
}

/**
 * Pulls trials for `scope` from ClinicalTrials.gov into public.trials and
 * public.trial_locations. Defaults to incremental when a previous run succeeded.
 */
export async function syncTrials(scope: TrialScopeId, opts: { mode?: SyncMode } = {}): Promise<SyncResult> {
  const lastRun = await getLastSuccessfulRun(scope);
  const mode: SyncMode = opts.mode ?? (lastRun ? 'incremental' : 'full');
  if (mode === 'incremental' && !lastRun) {
    throw new Error(`No successful sync for scope "${scope}" yet; run a full sync first`);
  }
  const since = mode === 'incremental' && lastRun ? daysBefore(lastRun.started_at, INCREMENTAL_OVERLAP_DAYS) : null;

  const ctgovDataTimestamp = await getDataTimestamp();
  if (mode === 'incremental' && lastRun?.ctgov_data_timestamp === ctgovDataTimestamp) {
    return { scope, mode, since, ctgovDataTimestamp, studiesUpserted: 0, skipped: true };
  }

  const { data: run, error: runError } = await supabase
    .from('trial_sync_runs')
    .insert({ scope, mode, since, ctgov_data_timestamp: ctgovDataTimestamp })
    .select('id')
    .single();
  if (runError) throw new Error(`Failed to start sync run: ${runError.message}`);

  const fetchedAt = new Date().toISOString();
  let studiesUpserted = 0;

  try {
    for await (const page of fetchStudyPages(buildQuery(scope, mode, since))) {
      for (let i = 0; i < page.length; i += BATCH_SIZE) {
        const batch = page.slice(i, i + BATCH_SIZE);
        await writeBatch(batch, fetchedAt);
        studiesUpserted += batch.length;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('trial_sync_runs')
      .update({ status: 'failed', error: message, studies_upserted: studiesUpserted, finished_at: new Date().toISOString() })
      .eq('id', run.id);
    throw error;
  }

  const { error: finishError } = await supabase
    .from('trial_sync_runs')
    .update({ status: 'succeeded', studies_upserted: studiesUpserted, finished_at: new Date().toISOString() })
    .eq('id', run.id);
  if (finishError) throw new Error(`Failed to finish sync run: ${finishError.message}`);

  return { scope, mode, since, ctgovDataTimestamp, studiesUpserted, skipped: false };
}

export { countOpenTrials, getTrialDetail, listOpenTrials, type TrialArm, type TrialDetail, type TrialListItem, type TrialLocation } from './queries';
export { AREA_LABELS, AREA_ORDER, isTherapeuticArea, type TherapeuticArea } from './areas';
