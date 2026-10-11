import { DEMO_PRACTICE } from '@/lib/practice';
import { listOpenTrials } from '@/lib/trials';
import type { TherapeuticArea } from '@/lib/trials/areas';

/** Therapeutic area per trial, so outreach and the calendar use the same colors as the trial cards. */
export async function getTrialAreas(): Promise<Record<string, TherapeuticArea>> {
  try {
    const trials = await listOpenTrials(DEMO_PRACTICE.practiceId);
    return Object.fromEntries(trials.map((t) => [t.nctId, t.area]));
  } catch {
    return {};
  }
}
