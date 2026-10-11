import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptTrial, getTrialOutreach } from '@/lib/caller';

const NCT = /^NCT\d{8}$/;

/** Shown to the doctor when the outreach caller can't be reached; the raw error goes to the log. */
const CALLER_DOWN = 'We couldn’t reach the outreach caller, so no calls were started. Try again in a minute.';

/**
 * GET: this practice's outreach status for a trial (candidate counts, accepted, call totals).
 * POST: the doctor accepts the trial; the outreach caller starts calling their pre-screened patients.
 * Emits counts only, no patient data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const nctId = String(req.query.nctId ?? '');
  if (!NCT.test(nctId)) return res.status(400).json({ success: false, error: 'Bad trial id' });

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, data: await getTrialOutreach(nctId) });
  }
  if (req.method === 'POST') {
    try {
      await acceptTrial(nctId);
      return res.status(200).json({ success: true, data: await getTrialOutreach(nctId) });
    } catch (error) {
      console.error('[api/trials/outreach] accept failed:', error);
      return res.status(502).json({ success: false, error: CALLER_DOWN });
    }
  }
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
