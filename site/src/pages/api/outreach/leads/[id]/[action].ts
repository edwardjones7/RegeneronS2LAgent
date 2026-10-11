import type { NextApiRequest, NextApiResponse } from 'next';
import { getOutreachOverview, isStaffAction, staffAction } from '@/lib/caller';

/**
 * POST: office staff act on a patient in the outreach (restart | contacted | drop | clear).
 * Only patients in this practice's own outreach can be acted on.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const id = Number(req.query.id);
  const action = String(req.query.action ?? '');
  if (!Number.isInteger(id) || !isStaffAction(action)) {
    return res.status(400).json({ success: false, error: 'Bad request' });
  }
  const overview = await getOutreachOverview();
  if (!overview.patients.some((p) => p.id === id)) {
    return res.status(404).json({ success: false, error: 'Not one of this practice’s patients' });
  }
  try {
    await staffAction(id, action);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[api/outreach] action failed:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Action failed' });
  }
}
