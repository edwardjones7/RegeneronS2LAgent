import type { NextApiRequest, NextApiResponse } from 'next';
import { getProtocol, type Protocol } from '@/lib/protocols';
import { getTrialDetail, type TrialDetail } from '@/lib/trials';

export interface TrialDetailResponse {
  trial: TrialDetail;
  protocol: Protocol | null;
}

/**
 * One trial's public registry record plus its demo protocol, for the trial modal.
 * Emits trial data only; no patient data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const nctId = String(req.query.nctId ?? '');
  if (!/^NCT\d{8}$/.test(nctId)) {
    return res.status(400).json({ success: false, error: 'Invalid NCT number' });
  }

  try {
    const trial = await getTrialDetail(nctId);
    if (!trial) return res.status(404).json({ success: false, error: 'Trial not found' });
    const data: TrialDetailResponse = { trial, protocol: getProtocol(nctId) };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[api/trials/${nctId}] failed:`, error);
    return res.status(500).json({ success: false, error: 'Could not load this trial' });
  }
}
