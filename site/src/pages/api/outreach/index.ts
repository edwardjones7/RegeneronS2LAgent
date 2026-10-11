import type { NextApiRequest, NextApiResponse } from 'next';
import { getOutreachOverview } from '@/lib/caller';

/**
 * GET: the Outreach tab's data for the signed-in practice (optionally ?nct=NCT…).
 * Emits this practice's own patients only; never another practice's.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const nct = typeof req.query.nct === 'string' && /^NCT\d{8}$/.test(req.query.nct) ? req.query.nct : undefined;
  return res.status(200).json({ success: true, data: await getOutreachOverview(nct) });
}
