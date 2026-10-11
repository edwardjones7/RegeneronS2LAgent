import type { NavCounts } from '@/components/ui';
import { getPatientStats } from '@/lib/patients';
import { countOpenTrials } from '@/lib/trials';

/** Sidebar counts. Server-only: reads Supabase and the local patient file. */
export async function getNavCounts(): Promise<NavCounts> {
  return { trials: await countOpenTrials(), patients: getPatientStats().total };
}
