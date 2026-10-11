import { DEMO_PRACTICE } from '@/lib/practice';
import { getEnvOptional } from '@/lib/utils/envManager';

/**
 * Server-only client for the outreach caller (voice-agent/, "Ava"). When a doctor accepts a
 * trial, the caller calls that practice's pre-screened patients from the doctor's office.
 *
 * The caller's API key stays on this server: the browser talks to /api/trials/[nctId]/outreach.
 * Sends only a practice id, a trial id and the doctor's name; patient records never cross.
 */

export interface TrialOutreach {
  /** False when the caller isn't configured or not running. */
  available: boolean;
  /** The caller has a call script for this trial. */
  callable: boolean;
  candidates: number;
  chartReview: number;
  accepted: boolean;
  acceptedBy: string | null;
  acceptedAt: string | null;
  totals: { patients: number; called: number; reached: number; booked: number; needsStaff: number } | null;
  /** The office dashboard, where staff follow the outreach. */
  dashboardUrl: string | null;
}

const UNAVAILABLE: TrialOutreach = {
  available: false, callable: false, candidates: 0, chartReview: 0, accepted: false,
  acceptedBy: null, acceptedAt: null, totals: null, dashboardUrl: null,
};

function config() {
  const url = getEnvOptional('CALLER_URL')?.replace(/\/$/, '');
  const key = getEnvOptional('CALLER_API_KEY');
  return url && key ? { url, key, publicUrl: getEnvOptional('CALLER_PUBLIC_URL')?.replace(/\/$/, '') ?? url } : null;
}

async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const c = config();
  if (!c) throw new Error('Caller not configured');
  const res = await fetch(`${c.url}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'X-API-Key': c.key, 'Content-Type': 'application/json' },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Caller returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface CallerTrial {
  nct_id: string;
  callable: boolean;
  candidates: number;
  chart_review: number;
  accepted: boolean;
  accepted_by: string | null;
  accepted_at: string | null;
}

interface CallerOverview {
  totals: { patients: number; called: number; reached: number; booked: number; needs_staff: number };
}

const practice = encodeURIComponent(DEMO_PRACTICE.practiceId);

export async function getTrialOutreach(nctId: string): Promise<TrialOutreach> {
  const c = config();
  if (!c) return UNAVAILABLE;
  try {
    const trials = await call<CallerTrial[]>(`/practices/${practice}/trials`);
    const t = trials.find((x) => x.nct_id === nctId);
    if (!t) return { ...UNAVAILABLE, available: true };
    const overview = t.accepted
      ? await call<CallerOverview>(`/practices/${practice}/outreach?nct_id=${encodeURIComponent(nctId)}`)
      : null;
    return {
      available: true,
      callable: t.callable,
      candidates: t.candidates,
      chartReview: t.chart_review,
      accepted: t.accepted,
      acceptedBy: t.accepted_by,
      acceptedAt: t.accepted_at,
      totals: overview && {
        patients: overview.totals.patients,
        called: overview.totals.called,
        reached: overview.totals.reached,
        booked: overview.totals.booked,
        needsStaff: overview.totals.needs_staff,
      },
      dashboardUrl: `${c.publicUrl}/dashboard`,
    };
  } catch (err) {
    console.error('[caller] status failed:', err);
    return UNAVAILABLE;
  }
}

/** The doctor said yes: the caller starts calling this practice's pre-screen candidates. */
export async function acceptTrial(nctId: string): Promise<void> {
  const doctor = DEMO_PRACTICE.doctor.replace(/^Dr\.?\s+/i, '');
  await call(`/practices/${practice}/trials/${encodeURIComponent(nctId)}/accept`, {
    method: 'POST',
    body: { doctor_name: doctor },
  });
}
