import type { NextApiRequest, NextApiResponse } from 'next';
import { getPatientStats } from '@/lib/patients';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getProtocol, listProtocolIds, type CriterionCheck } from '@/lib/protocols';
import { listOpenTrials } from '@/lib/trials';
import type { TherapeuticArea } from '@/lib/trials/areas';

export interface WalkthroughTrial {
  nctId: string;
  indication: string;
  area: TherapeuticArea;
  hasProtocol: boolean;
}

export interface WalkthroughData {
  trialCount: number;
  /** A spread of open trials for the "fetching" scene, demo protocols first. */
  trials: WalkthroughTrial[];
  protocolCount: number;
  /** The protocol shown being matched. */
  protocol: { indication: string; drug: string | null; area: TherapeuticArea; criteria: { text: string; type: 'inclusion' | 'exclusion'; check: CriterionCheck }[] };
  patientCount: number;
}

/** Shown in the Jev scene: the asthma protocol reads best, else whichever exists. */
const FEATURED_PROTOCOL = 'NCT07309614';

/**
 * Inputs for the pipeline walkthrough animation. Emits public trial data and counts only;
 * the patient count is the practice's panel size, no patient records.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const trials = await listOpenTrials();
    const ids = listProtocolIds();
    const featuredId = ids.includes(FEATURED_PROTOCOL) ? FEATURED_PROTOCOL : ids[0];
    const protocol = featuredId ? getProtocol(featuredId) : null;
    const featured = trials.find((t) => t.nctId === featuredId);

    // Demo protocols first, then one trial per area in turn, so the stream looks varied.
    const rest = trials.filter((t) => !t.hasProtocol && t.area !== 'other');
    const byArea = new Map<string, typeof rest>();
    for (const t of rest) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
    const mixed: typeof rest = [];
    while (mixed.length < 14 && [...byArea.values()].some((l) => l.length)) {
      for (const list of byArea.values()) if (list.length && mixed.length < 14) mixed.push(list.shift()!);
    }
    const sample = [...trials.filter((t) => t.hasProtocol), ...mixed].slice(0, 18);

    const data: WalkthroughData = {
      trialCount: trials.length,
      trials: sample.map((t) => ({ nctId: t.nctId, indication: t.indication, area: t.area, hasProtocol: t.hasProtocol })),
      protocolCount: ids.length,
      protocol: {
        indication: featured?.indication ?? protocol?.shortTitle ?? 'Demo protocol',
        drug: featured?.drug ?? protocol?.drug ?? null,
        area: featured?.area ?? 'other',
        criteria: (protocol?.criteria ?? []).slice(0, 7).map((c) => ({ text: c.text, type: c.type, check: c.check })),
      },
      patientCount: getPatientStats(DEMO_PRACTICE.county).total,
    };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[api/walkthrough] failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load the walkthrough' });
  }
}
