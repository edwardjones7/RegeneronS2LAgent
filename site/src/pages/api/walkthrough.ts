import type { NextApiRequest, NextApiResponse } from 'next';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE } from '@/lib/practice';
import { listOpenTrials } from '@/lib/trials';
import type { TherapeuticArea } from '@/lib/trials/areas';

export interface WalkthroughTrial {
  nctId: string;
  indication: string;
  drug: string | null;
  area: TherapeuticArea;
  hasProtocol: boolean;
}

export interface WalkthroughData {
  trialCount: number;
  /** A spread of open trials, demo protocols (the ones that can be matched) first. */
  trials: WalkthroughTrial[];
  patientCount: number;
}

/**
 * Inputs for the pipeline walkthrough animation. Emits public trial data and counts only;
 * the patient count is the practice's panel size, no patient records.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const trials = await listOpenTrials();
    // Demo protocols first, then one trial per area in turn, so the stream looks varied.
    const rest = trials.filter((t) => !t.hasProtocol && t.area !== 'other');
    const byArea = new Map<string, typeof rest>();
    for (const t of rest) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
    const mixed: typeof rest = [];
    while (mixed.length < 20 && [...byArea.values()].some((l) => l.length)) {
      for (const list of byArea.values()) if (list.length && mixed.length < 20) mixed.push(list.shift()!);
    }
    const sample = [...trials.filter((t) => t.hasProtocol), ...mixed].slice(0, 24);

    const data: WalkthroughData = {
      trialCount: trials.length,
      trials: sample.map((t) => ({ nctId: t.nctId, indication: t.indication, drug: t.drug, area: t.area, hasProtocol: t.hasProtocol })),
      patientCount: getPatientStats(DEMO_PRACTICE.county).total,
    };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[api/walkthrough] failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load the walkthrough' });
  }
}
