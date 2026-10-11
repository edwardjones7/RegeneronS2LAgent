import type { NextApiRequest, NextApiResponse } from 'next';
import { resetOutreach } from '@/lib/caller';

/**
 * POST: wipe the signed-in practice's campaigns (optionally ?nct=NCT… for one trial) so they can
 * start over. Scoped to this practice only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const nct = typeof req.query.nct === 'string' && /^NCT\d{8}$/.test(req.query.nct) ? req.query.nct : undefined;
  try {
    return res.status(200).json({ success: true, data: await resetOutreach(nct) });
  } catch (error) {
    console.error('[api/outreach/reset] failed:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Reset failed' });
  }
}
