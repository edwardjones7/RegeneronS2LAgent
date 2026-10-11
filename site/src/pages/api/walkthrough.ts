import type { NextApiRequest, NextApiResponse } from 'next';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE } from '@/lib/practice';
import { canFill, listOpenTrials, type TrialListItem } from '@/lib/trials';
import type { TherapeuticArea } from '@/lib/trials/areas';

export interface WalkthroughTrial {
  nctId: string;
  indication: string;
  drug: string | null;
  area: TherapeuticArea;
}

export interface WalkthroughData {
  trialCount: number;
  /** A spread of open trials, the ones that fit first, for the fetch scene's stream. */
  trials: WalkthroughTrial[];
  /** Trials the practice's patients fit, most candidates first, with their real pre-screen counts. */
  matched: TrialListItem[];
  /** Open trials the matcher has run on for this practice. */
  screened: number;
  /** When the matcher last ran for this practice, if ever. */
  evaluatedAt: string | null;
  patientCount: number;
}

/**
 * Inputs for the pipeline walkthrough animation. Emits public trial data and this practice's
 * aggregate pre-screen counts only; the patient count is the panel size, no patient records.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const trials = await listOpenTrials(DEMO_PRACTICE.practiceId);
    const matched = trials.filter((t) => canFill(t.prescreen));
    // Trials that fit first, then one trial per area in turn, so the stream looks varied.
    const rest = trials.filter((t) => !canFill(t.prescreen) && t.area !== 'other');
    const byArea = new Map<string, typeof rest>();
    for (const t of rest) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
    const mixed: typeof rest = [];
    while (mixed.length < 20 && [...byArea.values()].some((l) => l.length)) {
      for (const list of byArea.values()) if (list.length && mixed.length < 20) mixed.push(list.shift()!);
    }
    const sample = [...matched.slice(0, 4), ...mixed].slice(0, 24);
    const evaluated = trials.map((t) => t.prescreen?.evaluatedAt).filter((d): d is string => Boolean(d));

    const data: WalkthroughData = {
      trialCount: trials.length,
      trials: (sample.length ? sample : trials.slice(0, 24)).map((t) => ({ nctId: t.nctId, indication: t.indication, drug: t.drug, area: t.area })),
      matched,
      screened: evaluated.length,
      evaluatedAt: evaluated.length ? evaluated.reduce((a, b) => (a > b ? a : b)) : null,
      patientCount: getPatientStats(DEMO_PRACTICE.county).total,
    };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[api/walkthrough] failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load the walkthrough' });
  }
}
