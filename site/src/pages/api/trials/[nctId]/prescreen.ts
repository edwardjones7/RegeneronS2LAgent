import type { NextApiRequest, NextApiResponse } from 'next';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getPrescreenDetail, type PrescreenDetail } from '@/lib/trials/prescreenPatients';

export type PrescreenResponse = PrescreenDetail;

/**
 * The signed-in practice's pre-screen results for one trial: its counts plus the candidate and
 * chart-review patients, with each criterion passed, failed or unknown.
 *
 * EMITS PATIENT DATA (names, ages, per-criterion results). It is served only to the practice
 * the patients belong to, for the doctor's own review, and stays inside the practice. Every
 * read is filtered to that practice's id. Nothing here goes to a sponsor; sponsors see counts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const nctId = String(req.query.nctId ?? '');
  if (!/^NCT\d{8}$/.test(nctId)) return res.status(400).json({ success: false, error: 'Invalid NCT number' });

  try {
    const data: PrescreenResponse = await getPrescreenDetail(DEMO_PRACTICE.practiceId, nctId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[api/trials/${nctId}/prescreen] failed:`, error);
    return res.status(500).json({ success: false, error: 'Could not load the pre-screen results' });
  }
}
