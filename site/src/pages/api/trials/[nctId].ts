import type { NextApiRequest, NextApiResponse } from 'next';
import type { StructuredCriterion } from '@/engine/preprocess/schema';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getProtocol, type Protocol } from '@/lib/protocols';
import { getTrialCriteria, getTrialDetail, type TrialDetail } from '@/lib/trials';

export interface TrialDetailResponse {
  /** Includes this practice's pre-screen counts (`trial.prescreen`). */
  trial: TrialDetail;
  /** Structured criteria from `trials.criteria_questions`, the ones the matcher checks. */
  criteria: StructuredCriterion[] | null;
  /** Hand-authored demo protocol, only when there are no structured criteria. */
  protocol: Protocol | null;
}

/**
 * One trial's public registry record and criteria, for the trial modal.
 * Emits trial data and this practice's aggregate counts only; no patient data.
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
    const [trial, criteria] = await Promise.all([getTrialDetail(nctId, DEMO_PRACTICE.practiceId), getTrialCriteria(nctId)]);
    if (!trial) return res.status(404).json({ success: false, error: 'Trial not found' });
    const data: TrialDetailResponse = { trial, criteria, protocol: criteria ? null : getProtocol(nctId) };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[api/trials/${nctId}] failed:`, error);
    return res.status(500).json({ success: false, error: 'Could not load this trial' });
  }
}
