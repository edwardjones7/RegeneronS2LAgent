import { useRouter } from 'next/router';
import { type ReactNode, useEffect, useState } from 'react';
import { ConditionChip } from '@/components/patients/ConditionChip';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { Drawer, DrawerSection } from '@/components/ui';
import type { PatientOutreach } from '@/lib/caller';
import type { PatientDetail } from '@/lib/patients';
import type { PatientDetailResponse } from '@/pages/api/patients/[id]';
import { fetchJson } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

export const SEX_LABELS = { F: 'Female', M: 'Male' } as const;

/* ————————— Values with a gentle flag when out of range ————————— */

export type Flag = 'high' | 'borderline' | null;

const FLAG_CLASS: Record<Exclude<Flag, null>, string> = { high: 'text-fail', borderline: 'text-unk' };

export function bmiFlag(bmi: number | null): Flag {
  if (bmi === null) return null;
  return bmi >= 30 ? 'borderline' : null;
}

export function a1cFlag(a1c: number | null): Flag {
  if (a1c === null) return null;
  return a1c >= 6.5 ? 'high' : a1c >= 5.7 ? 'borderline' : null;
}

export function bpFlag(bp: string | null): Flag {
  if (!bp) return null;
  const [sys, dia] = bp.split('/').map(Number);
  return sys >= 140 || dia >= 90 ? 'high' : sys >= 130 || dia >= 80 ? 'borderline' : null;
}

export function Value({ value, flag }: { value: string | null; flag: Flag }) {
  return (
    <span className={cn('tabular-nums', value === null ? 'text-ink-3' : flag ? FLAG_CLASS[flag] : 'text-ink')}>
      {value ?? '—'}
    </span>
  );
}

const HIDDEN_TILES = new Set(['height_cm', 'weight_kg', 'systolic_bp', 'diastolic_bp']);

interface TileProps {
  label: string;
  value: string;
  unit?: string | null;
  date: string;
  flag?: Flag;
}

function Tile({ label, value, unit, date, flag = null }: TileProps) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="truncate text-[11px] font-medium text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('text-[17px] font-semibold tabular-nums tracking-[-0.01em]', flag && FLAG_CLASS[flag])}>{value}</span>
        {unit && <span className="truncate text-[11px] text-ink-3">{unit}</span>}
      </div>
      <div className="text-[11px] text-ink-3">{formatDate(date)}</div>
    </div>
  );
}

/** Weight over time as a small line, oldest on the left. */
function WeightTrend({ weights }: { weights: PatientDetail['weights'] }) {
  const points = [...weights].reverse().slice(-16);
  const latest = points[points.length - 1];
  const first = points[0];
  if (!latest) return null;
  const kgs = points.map((w) => w.kg);
  const lo = Math.min(...kgs);
  const span = Math.max(...kgs) - lo || 1;
  const line = points
    .map((w, i) => `${(i / Math.max(points.length - 1, 1)) * 100},${36 - ((w.kg - lo) / span) * 32}`)
    .join(' ');
  const change = latest.kg - first.kg;

  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span>
          <span className="text-[17px] font-semibold tabular-nums">{latest.kg}</span>
          <span className="ml-1 text-[11px] text-ink-3">kg · {formatDate(latest.date)}</span>
        </span>
        {points.length > 1 && (
          <span className="text-[11px] text-ink-3">
            {change >= 0 ? '+' : '−'}
            {Math.abs(change).toFixed(1)} kg since {first.date.slice(0, 4)}
          </span>
        )}
      </div>
      {points.length > 1 && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full text-accent">
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

function Collapsible({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="group mt-6 rounded-xl border border-line-2">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <svg
          className="size-4 text-ink-3 transition-transform group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="border-t border-line-2 px-3 py-2.5">{children}</div>
    </details>
  );
}

function DatedList({ items }: { items: { name: string; date: string }[] }) {
  return (
    <ul className="space-y-1.5 text-[13px]">
      {items.map((item, idx) => (
        <li key={`${item.name}-${idx}`} className="flex justify-between gap-3 text-ink-2">
          <span className="truncate">{item.name}</span>
          <span className="shrink-0 text-[11.5px] text-ink-3">{formatDate(item.date)}</span>
        </li>
      ))}
    </ul>
  );
}

const OUTREACH_EVENTS: Record<string, string> = {
  call_started: 'Ava called',
  call_ended: 'Call ended',
  sms_sent: 'Texted',
  sms_received: 'Replied',
  visit_booked: 'Booked a screening visit',
  visit_confirmed: 'Confirmed the visit',
  visit_rescheduled: 'Rescheduled',
  identity_verified: 'Confirmed their identity',
  inbound_call: 'Called the office back',
  call_window_set: 'Asked for a later time',
  staff_contacted: 'Reached by staff',
  chart_review_cleared: 'Chart checked',
};

const OUTREACH_STATUS_CLASS: Record<string, string> = {
  booked: 'bg-pass-bg text-pass',
  needs_human: 'bg-unk-bg text-unk',
  chart_review: 'bg-unk-bg text-unk',
};

/** Ava's calls and texts to this patient, per trial the practice accepted. */
function OutreachSection({ outreach }: { outreach: PatientOutreach[] }) {
  if (!outreach.length) return null;
  return (
    <DrawerSection title="Outreach">
      <div className="space-y-2">
        {outreach.map((o) => (
          <div key={o.nctId ?? o.trialTitle} className="rounded-xl border border-line-2 p-3">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="truncate font-semibold capitalize">{o.trialTitle} study</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                  OUTREACH_STATUS_CLASS[o.status] ?? 'bg-surface-2 text-ink-2'
                )}
              >
                {o.status === 'booked' && o.visit
                  ? `Visit ${new Date(o.visit).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : o.status.replaceAll('_', ' ')}
              </span>
            </div>
            <ol className="mt-2 space-y-1">
              {o.timeline.slice(-8).map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-2 text-[12.5px]">
                  <span className="w-20 shrink-0 tabular-nums text-ink-3">{formatDate(e.at.slice(0, 10))}</span>
                  <span className="min-w-0 text-ink-2">
                    {OUTREACH_EVENTS[e.type] ?? e.type.replaceAll('_', ' ')}
                    {e.body && (
                      <span className="mt-1 mb-1 block rounded-xl rounded-tl-sm bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
                        {e.body}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </DrawerSection>
  );
}

function PatientChart({ patient, outreach }: PatientDetailResponse) {
  const clinical = patient.activeConditions.filter((c) => c.clinical);
  const other = patient.activeConditions.filter((c) => !c.clinical);
  const obs = Object.fromEntries(patient.observations.map((o) => [o.key, o]));
  const shown = patient.observations.filter((o) => !HIDDEN_TILES.has(o.key));
  const tiles = shown.filter((o) => !Number.isNaN(Number(o.value)));
  const notes = shown.filter((o) => Number.isNaN(Number(o.value)));
  const bp =
    obs.systolic_bp && obs.diastolic_bp
      ? `${Math.round(Number(obs.systolic_bp.value))}/${Math.round(Number(obs.diastolic_bp.value))}`
      : null;

  return (
    <>
      <OutreachSection outreach={outreach} />
      <DrawerSection title={`Active conditions · ${clinical.length}`}>
        {clinical.length === 0 ? (
          <p className="text-[13px] text-ink-3">None on file.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {clinical.map((c) => (
              <span key={`${c.name}-${c.since}`} title={`Since ${formatDate(c.since)}`}>
                <ConditionChip name={c.name} />
              </span>
            ))}
          </div>
        )}
        {other.length > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">Also recorded: {other.map((c) => c.name).join(', ')}.</p>
        )}
      </DrawerSection>

      <DrawerSection title="Vitals and labs">
        <div className="grid grid-cols-3 gap-2">
          {bp && obs.systolic_bp && <Tile label="Blood pressure" value={bp} unit="mmHg" date={obs.systolic_bp.date} flag={bpFlag(bp)} />}
          {tiles.map((o) => (
            <Tile
              key={o.key}
              label={o.label}
              value={o.value}
              unit={o.unit}
              date={o.date}
              flag={o.key === 'hba1c' ? a1cFlag(Number(o.value)) : o.key === 'bmi' ? bmiFlag(Number(o.value)) : null}
            />
          ))}
        </div>
        {notes.map((o) => (
          <p key={o.key} className="mt-2 text-[12.5px] text-ink-2">
            <span className="text-ink-3">{o.label}:</span> {o.value}
          </p>
        ))}
      </DrawerSection>

      {patient.weights.length > 0 && (
        <DrawerSection title="Weight">
          <WeightTrend weights={patient.weights} />
        </DrawerSection>
      )}

      <DrawerSection title={`Medications · ${patient.activeMedications.length}`}>
        {patient.activeMedications.length === 0 ? (
          <p className="text-[13px] text-ink-3">None active.</p>
        ) : (
          <ul className="divide-y divide-line-2 rounded-xl border border-line-2">
            {patient.activeMedications.map((m) => (
              <li key={`${m.name}-${m.since}`} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="line-clamp-2">{m.name}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3">since {m.since.slice(0, 4)}</span>
              </li>
            ))}
          </ul>
        )}
        {patient.pastMedicationCount > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">{patient.pastMedicationCount} past prescriptions not shown.</p>
        )}
      </DrawerSection>

      {patient.acuteVisits.length > 0 && (
        <DrawerSection title={`Urgent and emergency visits · ${patient.acuteVisits.length}`}>
          <ul className="space-y-1.5">
            {patient.acuteVisits.slice(0, 6).map((v, idx) => (
              <li key={`${v.date}-${idx}`} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      v.kind === 'emergency' ? 'bg-fail-bg text-fail' : 'bg-unk-bg text-unk'
                    )}
                  >
                    {v.kind === 'emergency' ? 'ER' : 'Urgent care'}
                  </span>
                  <span className="truncate text-ink-2">{v.reason ?? 'No reason recorded'}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-ink-3">{formatDate(v.date)}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {patient.pastConditions.length > 0 && (
        <Collapsible title={`Resolved conditions · ${patient.pastConditions.length}`}>
          <DatedList items={patient.pastConditions.slice(0, 15).map((c) => ({ name: c.name, date: c.end }))} />
        </Collapsible>
      )}

      {patient.recentProcedures.length > 0 && (
        <Collapsible title="Recent procedures">
          <DatedList items={patient.recentProcedures} />
        </Collapsible>
      )}
    </>
  );
}

/* ————————— Loading ————————— */

// Charts already fetched (or on their way), so reopening or hovering first makes the drawer instant.
// Entries go stale after a short while because Ava's outreach timeline keeps moving.
const FRESH_MS = 15_000;
const cache = new Map<string, { at: number; promise: Promise<PatientDetailResponse> }>();

export function loadPatient(id: string): Promise<PatientDetailResponse> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
  const promise = fetchJson<PatientDetailResponse>(`/api/patients/${encodeURIComponent(id)}`);
  promise.catch(() => cache.delete(id));
  cache.set(id, { at: Date.now(), promise });
  return promise;
}

/** Start loading a patient's chart before it's opened, e.g. on hover. */
export const prefetchPatient = (id: string) => void loadPatient(id).catch(() => {});

function ChartSkeleton() {
  return (
    <div className="mt-1 animate-pulse">
      <div className="h-3.5 w-32 rounded-full bg-surface-2" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-6 w-28 rounded-full bg-surface-2" />
        <div className="h-6 w-24 rounded-full bg-surface-2" />
        <div className="h-6 w-20 rounded-full bg-surface-2" />
      </div>
      <div className="mt-8 h-3.5 w-28 rounded-full bg-surface-2" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[74px] rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="mt-8 h-3.5 w-24 rounded-full bg-surface-2" />
      <div className="mt-3 h-28 rounded-xl bg-surface-2" />
    </div>
  );
}

interface PatientDrawerProps {
  patientId: string;
  /** What the list already knows, so the header shows straight away. */
  preview?: { name: string; subtitle?: string };
  /** Server-rendered chart when the page was loaded with the drawer open. */
  initial?: PatientDetailResponse | null;
  closeHref: string;
}

/**
 * A patient's chart in the right-hand drawer, used on Patients and Campaigns. It opens at once with
 * the name from the list and fills in when the chart arrives, so opening never waits on a page load.
 */
export function PatientDrawer({ patientId, preview, initial, closeHref }: PatientDrawerProps) {
  const [loaded, setLoaded] = useState<{ id: string; data: PatientDetailResponse } | null>(
    initial?.patient.id === patientId ? { id: patientId, data: initial } : null
  );
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPatient(patientId)
      .then((data) => alive && setLoaded({ id: patientId, data }))
      .catch(() => alive && setFailed(patientId));
    return () => {
      alive = false;
    };
  }, [patientId]);

  const data = loaded?.id === patientId ? loaded.data : null;
  const p = data?.patient;
  const name = p?.name ?? preview?.name ?? '';

  return (
    <Drawer
      title={name}
      leading={<PatientAvatar id={patientId} name={name} size="lg" />}
      subtitle={p ? `${p.age} · ${SEX_LABELS[p.sex]} · born ${formatDate(p.birthDate)}` : (preview?.subtitle ?? '\u00a0')}
      closeHref={closeHref}
    >
      {data ? (
        <div className="motion-safe:animate-fade-in">
          <PatientChart patient={data.patient} outreach={data.outreach} />
        </div>
      ) : failed === patientId ? (
        <p className="mt-2 text-[13px] text-ink-3">This chart couldn&rsquo;t be loaded. Close and try again.</p>
      ) : (
        <ChartSkeleton />
      )}
    </Drawer>
  );
}

/** The patient open in the drawer, read from the URL so it works with shallow routing. */
export function useOpenPatient(): string | null {
  const { query } = useRouter();
  return typeof query.patient === 'string' && query.patient ? query.patient : null;
}
