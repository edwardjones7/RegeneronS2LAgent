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
  // On Vercel, CALLER_URL is the service binding (internal); the caller's dashboard is on this same domain.
  const publicUrl = getEnvOptional('CALLER_PUBLIC_URL')?.replace(/\/$/, '') ?? (process.env.VERCEL ? '' : url);
  return url && key ? { url, key, publicUrl } : null;
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

/* ————————— The Outreach tab ————————— */

export type OutreachStatus =
  | 'queued' | 'calling' | 'no_answer' | 'booked' | 'needs_human' | 'emergency' | 'chart_review'
  | 'not_a_fit' | 'closed' | 'opted_out' | 'dropped' | 'new';

export interface OutreachPatient {
  id: number;
  patientId: string;
  name: string;
  status: OutreachStatus;
  reason: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastActivity: { type: string; at: string } | null;
  texts: number;
  callbacks: number;
  verified: boolean;
  callWindow: string | null;
  simulated: boolean;
  /** Only for test patients on a teammate's real phone: the birth date they'll be asked for. */
  testBirthDate: string | null;
  nctId: string | null;
}

export interface OutreachVisit {
  leadId: number;
  name: string;
  startsAt: string;
  status: OutreachStatus;
}

export interface OutreachOverview {
  available: boolean;
  totals: { patients: number; called: number; reached: number; texted: number; booked: number; needsStaff: number; chartReview: number; inProgress: number };
  patients: OutreachPatient[];
  visits: OutreachVisit[];
  trials: { nctId: string; title: string; booked: number }[];
  dashboardUrl: string | null;
}

interface CallerRow {
  id: number;
  patient_id?: string;
  first_name: string;
  last_name: string;
  status: OutreachStatus;
  status_reason: string;
  flags: { type: string; detail: string }[];
  attempts: number;
  next_attempt_at: string | null;
  last_activity: { type: string; at: string } | null;
  texts: number;
  inbound_calls: number;
  identity_verified: boolean;
  call_window: string | null;
  simulated: boolean;
  test_birth_date: string | null;
  nct_id: string | null;
}

const toPatient = (r: CallerRow): OutreachPatient => ({
  id: r.id,
  patientId: r.patient_id ?? '',
  name: `${r.first_name} ${r.last_name}`.trim(),
  status: r.status,
  reason: r.flags.at(-1)?.detail || r.status_reason,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastActivity: r.last_activity,
  texts: r.texts,
  callbacks: r.inbound_calls,
  verified: r.identity_verified,
  callWindow: r.call_window,
  simulated: r.simulated,
  testBirthDate: r.test_birth_date,
  nctId: r.nct_id,
});

const EMPTY_TOTALS = { patients: 0, called: 0, reached: 0, texted: 0, booked: 0, needsStaff: 0, chartReview: 0, inProgress: 0 };

/** Everything the Outreach tab shows, for this practice only. Optionally one trial. */
export async function getOutreachOverview(nctId?: string): Promise<OutreachOverview> {
  const c = config();
  if (!c) return { available: false, totals: EMPTY_TOTALS, patients: [], visits: [], trials: [], dashboardUrl: null };
  try {
    const q = nctId ? `?nct_id=${encodeURIComponent(nctId)}` : '';
    const [overview, visits, trials] = await Promise.all([
      call<{ totals: Record<string, number>; patients: CallerRow[] }>(`/practices/${practice}/outreach${q}`),
      call<{ lead_id: number; first_name: string; last_name: string; starts_at_local: string; status: OutreachStatus }[]>(
        `/practices/${practice}/visits`
      ),
      call<(CallerTrial & { title: string })[]>(`/practices/${practice}/trials`),
    ]);
    const t = overview.totals;
    const patients = overview.patients.map(toPatient);
    const ids = new Set(patients.map((p) => p.id));
    return {
      available: true,
      totals: {
        patients: t.patients, called: t.called, reached: t.reached, texted: t.texted, booked: t.booked,
        needsStaff: t.needs_staff, chartReview: t.chart_review, inProgress: t.in_progress,
      },
      patients,
      visits: visits
        .filter((v) => ids.has(v.lead_id))
        .map((v) => ({ leadId: v.lead_id, name: `${v.first_name} ${v.last_name}`.trim(), startsAt: v.starts_at_local, status: v.status })),
      trials: trials
        .filter((x) => x.accepted)
        .map((x) => ({ nctId: x.nct_id, title: x.title, booked: overview.patients.filter((p) => p.nct_id === x.nct_id && p.status === 'booked').length })),
      dashboardUrl: `${c.publicUrl}/dashboard`,
    };
  } catch (err) {
    console.error('[caller] overview failed:', err);
    return { available: false, totals: EMPTY_TOTALS, patients: [], visits: [], trials: [], dashboardUrl: null };
  }
}

/** Accepted trials with their booked count, for the trial cards. Empty if the caller isn't running. */
export async function getAcceptedTrials(): Promise<Record<string, { booked: number; called: number }>> {
  if (!config()) return {};
  try {
    const overview = await call<{ patients: CallerRow[] }>(`/practices/${practice}/outreach`);
    const out: Record<string, { booked: number; called: number }> = {};
    for (const p of overview.patients) {
      if (!p.nct_id) continue;
      const t = (out[p.nct_id] ??= { booked: 0, called: 0 });
      if (p.status === 'booked') t.booked += 1;
      if (p.attempts > 0) t.called += 1;
    }
    return out;
  } catch {
    return {};
  }
}

export interface PatientOutreach {
  nctId: string | null;
  trialTitle: string | null;
  status: OutreachStatus;
  attempts: number;
  visit: string | null;
  timeline: { at: string; type: string; body: string | null }[];
}

/** One patient's outreach at this practice (empty if they aren't being contacted). */
export async function getPatientOutreach(patientId: string): Promise<PatientOutreach[]> {
  if (!config()) return [];
  try {
    const rows = await call<(CallerRow & { trial_title: string | null; visit: string | null; timeline: PatientOutreach['timeline'] })[]>(
      `/practices/${practice}/patients/${encodeURIComponent(patientId)}/outreach`
    );
    return rows.map((r) => ({ nctId: r.nct_id, trialTitle: r.trial_title, status: r.status, attempts: r.attempts, visit: r.visit, timeline: r.timeline }));
  } catch {
    return [];
  }
}

const STAFF_ACTIONS = ['restart', 'contacted', 'drop', 'clear', 'cancel-visit', 'reschedule'] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];
export const isStaffAction = (a: string): a is StaffAction => (STAFF_ACTIONS as readonly string[]).includes(a);

/** Office staff act on a patient Ava handed over (or a chart they checked). */
export async function staffAction(leadId: number, action: StaffAction, body: Record<string, unknown> = {}): Promise<void> {
  await call(`/leads/${leadId}/${action}`, { method: 'POST', body });
}

/** Audio of one call, for "Listen to the call". Only for this practice's patients (checked by the caller route). */
export async function fetchRecording(leadId: number, callId: number): Promise<Response | null> {
  const c = config();
  if (!c) return null;
  const res = await fetch(`${c.url}/leads/${leadId}/calls/${callId}/recording`, { headers: { 'X-API-Key': c.key } });
  return res.ok ? res : null;
}

/* ————————— The practice's visit calendar ————————— */

export interface CalendarSlot {
  slotId: number;
  /** Local time at the practice, no zone: "2026-10-14T09:30:00". */
  startsAt: string;
  minutes: number;
  booked: {
    leadId: number;
    patientId: string | null;
    name: string;
    trial: string | null;
    nctId: string | null;
    bookedBy: 'Ava' | 'text';
    bookedAt: string | null;
    /** A call with a recording, if any (simulated patients have none). */
    recordingCallId: number | null;
    simulated: boolean;
  } | null;
}

export interface PracticeCalendar {
  available: boolean;
  start: string;
  days: number;
  slots: CalendarSlot[];
}

/** One week of this practice's visit times, booked or open. The same calendar every trial books into. */
export async function getCalendar(start: string, days = 7): Promise<PracticeCalendar> {
  if (!config()) return { available: false, start, days, slots: [] };
  try {
    const r = await call<{
      start: string;
      days: number;
      slots: {
        slot_id: number;
        starts_at_local: string;
        minutes: number;
        booked: {
          lead_id: number; patient_id: string | null; name: string; trial: string | null; nct_id: string | null;
          booked_by: 'Ava' | 'text'; booked_at: string | null; recording_call_id: number | null; simulated: boolean;
        } | null;
      }[];
    }>(`/practices/${practice}/calendar?start=${encodeURIComponent(start)}&days=${days}`);
    return {
      available: true,
      start: r.start,
      days: r.days,
      slots: r.slots.map((x) => ({
        slotId: x.slot_id,
        startsAt: x.starts_at_local,
        minutes: x.minutes,
        booked: x.booked && {
          leadId: x.booked.lead_id,
          patientId: x.booked.patient_id,
          name: x.booked.name,
          trial: x.booked.trial,
          nctId: x.booked.nct_id,
          bookedBy: x.booked.booked_by,
          bookedAt: x.booked.booked_at,
          recordingCallId: x.booked.recording_call_id,
          simulated: x.booked.simulated,
        },
      })),
    };
  } catch (err) {
    console.error('[caller] calendar failed:', err);
    return { available: false, start, days, slots: [] };
  }
}

/** Monday of the week to show first: this week, or next week on a weekend. Local practice date. */
export function calendarWeekStart(now = new Date()): string {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = local.getDay();
  local.setDate(local.getDate() + (day === 0 ? 1 : day === 6 ? 2 : 1 - day));
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}
