import { timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DEFAULT_TRIAL_SCOPE, isTrialScopeId, syncTrials, type SyncMode } from '@/lib/trials';
import { getEnv } from '@/lib/utils/envManager';

// A full sync of a large scope pages through ClinicalTrials.gov at ~50 req/min.
export const config = { maxDuration: 300 };

function isAuthorized(req: NextApiRequest): boolean {
  const expected = Buffer.from(`Bearer ${getEnv('CRON_SECRET')}`);
  const actual = Buffer.from(req.headers.authorization ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Pulls trials from ClinicalTrials.gov into Supabase.
 * Auth: `Authorization: Bearer $CRON_SECRET` (the header Vercel Cron sends).
 * Query: `scope` (default regeneron-interventional), `mode` = full | incremental
 * (default: incremental once a full sync has succeeded).
 * Emits only sync counts, no trial data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const scope = typeof req.query.scope === 'string' ? req.query.scope : DEFAULT_TRIAL_SCOPE;
  if (!isTrialScopeId(scope)) {
    return res.status(400).json({ success: false, error: `Unknown scope: ${scope}` });
  }

  const modeParam = req.query.mode;
  if (modeParam !== undefined && modeParam !== 'full' && modeParam !== 'incremental') {
    return res.status(400).json({ success: false, error: 'mode must be full or incremental' });
  }

  try {
    const result = await syncTrials(scope, { mode: modeParam as SyncMode | undefined });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[api/trials/sync] Sync failed:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return res.status(500).json({ success: false, error: message });
  }
}
