import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { PatientDrawer, prefetchPatient, useOpenPatient } from '@/components/patients/PatientDrawer';
import { AREA_STYLES } from '@/components/trials/areaStyles';
import { AppShell, PageIntro } from '@/components/ui';
import {
  getOutreachOverview,
  getPatientOutreach,
  type OutreachOverview,
  type OutreachPatient,
  type OutreachStatus,
  type PatientOutreach,
} from '@/lib/caller';
import { getPatient, type PatientDetail } from '@/lib/patients';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getTrialAreas } from '@/lib/trialAreas';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

interface OutreachPageProps {
  nct: string | null;
  initial: OutreachOverview;
  areas: Record<string, TherapeuticArea>;
  /** The patient open in the drawer, if any, with Ava's outreach to them. */
  selected: PatientDetail | null;
  selectedOutreach: PatientOutreach[];
}

export const getServerSideProps: GetServerSideProps<OutreachPageProps> = async ({ query }) => {
  const nct = typeof query.nct === 'string' && /^NCT\d{8}$/.test(query.nct) ? query.nct : null;
  const patientId = typeof query.patient === 'string' ? query.patient : '';
  // Only this practice's patients (AGENTS.MD §5): the lookup is scoped to its county.
  const selected = patientId ? getPatient(patientId, DEMO_PRACTICE.county) : null;
  const [initial, areas, selectedOutreach] = await Promise.all([
    getOutreachOverview(nct ?? undefined),
    getTrialAreas(),
    selected ? getPatientOutreach(selected.id) : Promise.resolve([]),
  ]);
  return { props: { nct, initial, areas, selected, selectedOutreach } };
};

type Tone = 'pass' | 'accent' | 'unknown' | 'fail' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  pass: 'bg-pass-bg text-pass',
  accent: 'bg-accent-weak text-accent',
  unknown: 'bg-unk-bg text-unk',
  fail: 'bg-fail-bg text-fail',
  neutral: 'bg-surface-2 text-ink-2',
};

const STATUS: Record<OutreachStatus, { label: string; tone: Tone }> = {
  booked: { label: 'Booked', tone: 'pass' },
  calling: { label: 'On a call', tone: 'accent' },
  queued: { label: 'Up next', tone: 'neutral' },
  no_answer: { label: 'Trying again', tone: 'neutral' },
  needs_human: { label: 'Needs a person', tone: 'unknown' },
  emergency: { label: 'Urgent', tone: 'fail' },
  chart_review: { label: 'Chart review', tone: 'unknown' },
  not_a_fit: { label: 'Office follow-up', tone: 'neutral' },
  closed: { label: 'Not interested', tone: 'neutral' },
  opted_out: { label: 'Opted out', tone: 'neutral' },
  dropped: { label: 'Dropped', tone: 'neutral' },
  new: { label: 'New', tone: 'neutral' },
};

const ACTIVITY: Record<string, string> = {
  call_started: 'Ava called',
  call_ended: 'Call ended',
  sms_sent: 'Texted times',
  sms_received: 'Texted back',
  slots_offered: 'Texted times',
  visit_booked: 'Booked a visit',
  visit_confirmed: 'Confirmed the visit',
  visit_rescheduled: 'Rescheduled',
  retry_scheduled: 'Retry scheduled',
  identity_verified: 'Identity confirmed',
  inbound_call: 'Called back',
  call_window_set: 'Asked for a later time',
  lead_received: 'Added from the pre-screen',
  chart_review_cleared: 'Chart cleared',
  staff_contacted: 'Reached by staff',
  status: 'Updated',
};

// The current minute, only in the browser: relative times render after hydration, so the server's
// clock never disagrees with the client's.
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
};
const useMinute = () =>
  useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000),
    () => null
  );

function Ago({ iso }: { iso: string | null | undefined }) {
  const minute = useMinute();
  if (!iso || minute === null) return null;
  const min = Math.max(0, minute - Math.floor(new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime() / 60_000));
  if (min < 1) return <>just now</>;
  if (min < 60) return <>{min}m ago</>;
  const h = Math.round(min / 60);
  return <>{h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`}</>;
}

/** One dot per try (3 max); the last one shows where it ended. */
function Tries({ p }: { p: OutreachPatient }) {
  const tries = Math.min(p.attempts, 3);
  return (
    <span className="inline-flex gap-1" title={`${tries} of 3 tries`} aria-label={`${tries} of 3 tries`}>
      {[0, 1, 2].map((i) => {
        const last = i === tries - 1;
        return (
          <span
            key={i}
            className={cn(
              'size-2 rounded-full',
              i >= tries && 'bg-line',
              i < tries && !last && 'bg-ink-3/40',
              last && p.status === 'booked' && 'bg-pass',
              last && p.status === 'calling' && 'animate-pulse bg-accent',
              last && (p.status === 'needs_human' || p.status === 'emergency' || p.status === 'chart_review') && 'bg-unk',
              last && !['booked', 'calling', 'needs_human', 'emergency', 'chart_review'].includes(p.status) && 'bg-ink-3'
            )}
          />
        );
      })}
    </span>
  );
}

function StatusPill({ status }: { status: OutreachStatus }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', TONE_CLASS[s.tone])}>
      {status === 'calling' && <span className="size-1.5 animate-pulse rounded-full bg-accent" />}
      {s.label}
    </span>
  );
}

const CARD = 'rounded-2xl border border-line-2 bg-surface shadow-[0_1px_2px_rgba(30,36,48,0.04)]';
const PILL = 'flex h-8 items-center rounded-full px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50';
const PILL_DARK = cn(PILL, 'bg-ink text-white hover:bg-ink/85');
const PILL_SOFT = cn(PILL, 'border border-line bg-surface text-ink-2 hover:border-ink-3');

/** This page with the patient's drawer open; the list stays where it is. */
const campaignHref = (nct: string | null, patientId?: string) => {
  const params = new URLSearchParams();
  if (nct) params.set('nct', nct);
  if (patientId) params.set('patient', patientId);
  const qs = params.toString();
  return qs ? `/campaigns?${qs}` : '/campaigns';
};

/** The campaign at a glance: four numbers, and a bar showing where every patient stands. */
function Summary({ t, patients }: { t: OutreachOverview['totals']; patients: OutreachPatient[] }) {
  const count = (statuses: OutreachStatus[]) => patients.filter((p) => statuses.includes(p.status)).length;
  const segments = [
    { n: count(['booked']), className: 'bg-pass', label: 'Booked' },
    {
      n: count(['calling', 'queued', 'no_answer', 'new']),
      className: 'bg-accent/70',
      label: 'In progress',
    },
    {
      n: count(['needs_human', 'emergency', 'chart_review']),
      className: 'bg-unk/70',
      label: 'Needs a person',
    },
    {
      n: count(['closed', 'opted_out', 'dropped', 'not_a_fit']),
      className: 'bg-ink-3/40',
      label: 'Closed',
    },
  ];
  const total = Math.max(patients.length, 1);
  const stats: { value: string; label: ReactNode; tone?: string }[] = [
    {
      value: t.called.toLocaleString(),
      label: (
        <>
          of {t.patients} called
          {t.inProgress > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {t.inProgress} on a call
            </span>
          )}
        </>
      ),
    },
    {
      value: t.called ? `${Math.round((t.reached / t.called) * 100)}%` : '–',
      label: t.texted > 0 ? `picked up · ${t.texted} texted after a miss` : 'picked up',
    },
    {
      value: t.booked.toLocaleString(),
      label: 'screening visits booked',
      tone: 'text-pass',
    },
    {
      value: (t.needsStaff + t.chartReview).toLocaleString(),
      label: t.chartReview > 0 ? `need a person · ${t.chartReview} chart checks` : 'need a person',
      tone: t.needsStaff + t.chartReview > 0 ? 'text-unk' : undefined,
    },
  ];

  return (
    <div className={cn(CARD, 'p-5')}>
      <div className="grid grid-cols-2 gap-y-5 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={i} className={cn('min-w-0 px-1 lg:px-5', i > 0 && 'lg:border-l lg:border-line-2', i === 0 && 'lg:pl-0')}>
            <div className={cn('text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em]', s.tone ?? 'text-ink')}>
              {s.value}
            </div>
            <div className="mt-1.5 text-[13px] leading-snug text-ink-2">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-line-2">
        {segments
          .filter((seg) => seg.n > 0)
          .map((seg) => (
            <span
              key={seg.label}
              title={`${seg.label}: ${seg.n}`}
              className={cn('h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full', seg.className)}
              style={{ width: `${(seg.n / total) * 100}%` }}
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {segments.map((seg) => (
          <span key={seg.label} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', seg.className)} />
            {seg.label} <span className="tabular-nums text-ink-2">{seg.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const ROW_GRID = 'grid grid-cols-[minmax(180px,1.3fr)_140px_56px_minmax(0,1fr)_16px] items-center gap-4';

function PatientRow({ p, href, selected }: { p: OutreachPatient; href: string; selected: boolean }) {
  const detail = [
    p.simulated ? null : 'Real phone',
    p.callWindow && `Prefers ${p.callWindow}`,
    p.callbacks ? `Called back ${p.callbacks}×` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={href}
      scroll={false}
      shallow
      onMouseEnter={() => prefetchPatient(p.patientId)}
      className={cn(
        ROW_GRID,
        'border-t border-line-2 px-5 py-3 text-[13px] transition-colors first:border-t-0',
        selected ? 'bg-accent-weak/60' : 'hover:bg-surface-2/70'
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <PatientAvatar id={p.patientId} name={p.name} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{p.name}</span>
          {detail && <span className="block truncate text-[12px] text-ink-3">{detail}</span>}
        </span>
      </span>
      <span>
        <StatusPill status={p.status} />
      </span>
      <Tries p={p} />
      <span className="min-w-0 truncate text-ink-2">
        {p.lastActivity ? (
          <>
            {ACTIVITY[p.lastActivity.type] ?? p.lastActivity.type.replaceAll('_', ' ')}
            <span className="text-ink-3">
              {' · '}
              <Ago iso={p.lastActivity.at} />
            </span>
          </>
        ) : (
          <span className="text-ink-3">Not yet</span>
        )}
      </span>
      <svg className="size-4 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

function QueueItem({ p, href, onDone }: { p: OutreachPatient; href: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: 'restart' | 'contacted' | 'drop' | 'clear') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/leads/${p.id}/${action}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'That didn’t work');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, 'That didn’t work'));
    } finally {
      setBusy(false);
    }
  };
  const review = p.status === 'chart_review';
  return (
    <li className="border-t border-line-2 px-4 py-3.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <PatientAvatar id={p.patientId} name={p.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={href}
              scroll={false}
              shallow
              onMouseEnter={() => prefetchPatient(p.patientId)}
              className="truncate text-[14px] font-semibold hover:underline"
            >
              {p.name}
            </Link>
            <span className="shrink-0 text-[12px] text-ink-3">
              <Ago iso={p.lastActivity?.at} />
            </span>
          </div>
          {p.status === 'emergency' && <span className="text-[12px] font-semibold text-fail">Urgent</span>}
        </div>
      </div>
      {p.reason && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{p.reason.charAt(0).toUpperCase() + p.reason.slice(1)}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {review ? (
          <button type="button" className={PILL_DARK} disabled={busy} onClick={() => act('clear')}>
            Chart checked, call
          </button>
        ) : (
          <>
            <button type="button" className={PILL_DARK} disabled={busy} onClick={() => act('contacted')}>
              I reached them
            </button>
            {p.status !== 'emergency' && (
              <button type="button" className={PILL_SOFT} disabled={busy} onClick={() => act('restart')}>
                Have Ava call again
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="ml-auto h-8 rounded-full px-2 text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-fail disabled:opacity-50"
          disabled={busy}
          onClick={() => act('drop')}
        >
          Drop
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-fail">{error}</p>}
    </li>
  );
}

function Panel({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(CARD, 'overflow-hidden')}>
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-ink-2">{count}</span>
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A queue that shows a few at a time, so one long list doesn't push the others off the page. */
function Queue({
  patients,
  hrefFor,
  onDone,
}: {
  patients: OutreachPatient[];
  hrefFor: (p: OutreachPatient) => string;
  onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? patients : patients.slice(0, 3);
  return (
    <>
      <ul>
        {shown.map((p) => (
          <QueueItem key={p.id} p={p} href={hrefFor(p)} onDone={onDone} />
        ))}
      </ul>
      {patients.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full border-t border-line-2 px-4 py-2.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2/70 hover:text-ink"
        >
          Show all {patients.length}
        </button>
      )}
    </>
  );
}

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'booked',
    label: 'Booked',
    match: (p: OutreachPatient) => p.status === 'booked',
  },
  {
    key: 'progress',
    label: 'In progress',
    match: (p: OutreachPatient) => ['calling', 'queued', 'no_answer'].includes(p.status),
  },
  {
    key: 'closed',
    label: 'Closed',
    match: (p: OutreachPatient) => ['closed', 'opted_out', 'dropped', 'not_a_fit'].includes(p.status),
  },
] as const;

const chipClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3'
  );

export default function OutreachPage({ nct, initial, areas, selected, selectedOutreach }: OutreachPageProps) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const url = `/api/outreach${nct ? `?nct=${nct}` : ''}`;
  const refresh = () =>
    fetchJson<OutreachOverview>(url)
      .then(setData)
      .catch(() => {});

  // Ava works in the background; keep the page live while it's open.
  useEffect(() => {
    const id = setInterval(
      () =>
        !document.hidden &&
        fetchJson<OutreachOverview>(url)
          .then(setData)
          .catch(() => {}),
      4000
    );
    return () => clearInterval(id);
  }, [url]);

  const t = data.totals;
  const staff = data.patients.filter((p) => p.status === 'needs_human' || p.status === 'emergency');
  const review = data.patients.filter((p) => p.status === 'chart_review');
  const tests = data.patients.filter((p) => p.testBirthDate);
  const now = new Date();
  const upcoming = data.visits.filter((v) => new Date(v.startsAt) >= new Date(now.getTime() - 3600_000)).slice(0, 6);
  const match = FILTERS.find((f) => f.key === filter)!.match;
  const rows = data.patients.filter(match).sort((a, b) => (b.lastActivity?.at ?? '').localeCompare(a.lastActivity?.at ?? ''));
  const running = data.trials.length > 0;
  const hrefFor = (p: OutreachPatient) => campaignHref(nct, p.patientId);
  const openId = useOpenPatient();
  const openName = data.patients.find((p) => p.patientId === openId)?.name;

  return (
    <AppShell title="Campaigns" active="campaigns">
      <PageIntro
        title={running ? `Here’s how Ava is doing, ${DEMO_PRACTICE.doctor}.` : `Nothing running yet, ${DEMO_PRACTICE.doctor}.`}
        meta={running ? `${data.trials.length} ${data.trials.length === 1 ? 'trial' : 'trials'} accepted` : undefined}
        description={
          running
            ? 'She calls your pre-screened patients and books their screening visits.'
            : 'Each trial you accept becomes a campaign. Ava calls its candidates from your office.'
        }
      />

      {!data.available ? (
        <div className={cn(CARD, 'mt-8 px-6 py-5 text-[14px] leading-relaxed text-ink-2')}>
          Ava&rsquo;s caller isn&rsquo;t reachable right now. Calls already in progress keep going; this page catches up when it&rsquo;s
          back.
        </div>
      ) : !running ? (
        <div className={cn(CARD, 'mt-8 px-8 py-12 text-center')}>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">No campaigns yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-2">
            Accept a trial and Ava starts calling its pre-screened patients from your office. There&rsquo;s nothing else to set up.
          </p>
          <Link
            href="/trials"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/85"
          >
            See recommended trials
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          {data.trials.length > 1 && (
            <div className="mt-7 flex flex-wrap gap-2">
              <Link href="/campaigns" className={chipClass(!nct)}>
                All trials
              </Link>
              {data.trials.map((x) => (
                <Link key={x.nctId} href={`/campaigns?nct=${x.nctId}`} className={cn(chipClass(nct === x.nctId), 'capitalize')}>
                  <span className={cn('size-1.5 rounded-full', AREA_STYLES[areas[x.nctId] ?? 'other'].dot)} />
                  {x.title}
                  <span className="tabular-nums opacity-60">{x.booked}</span>
                </Link>
              ))}
            </div>
          )}

          {tests.length > 0 && (
            <div
              className={cn(
                CARD,
                'mt-6 flex items-start gap-3 border-accent-line/60 bg-accent-weak/50 px-5 py-4 text-[13.5px] leading-relaxed text-ink-2'
              )}
            >
              <svg
                className="mt-0.5 size-4 shrink-0 text-accent"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />
              </svg>
              <p>
                <span className="font-semibold text-ink">Test call.</span> When your phone rings, you&rsquo;re{' '}
                {tests.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ' or '}
                    <span className="font-semibold text-ink">{p.name}</span>, born {formatDate(p.testBirthDate!)}
                  </span>
                ))}
                . Ava confirms that birthday before she says anything about the study.
              </p>
            </div>
          )}

          <div className="mt-6">
            <Summary t={t} patients={data.patients} />
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0">
              <div className="mb-4 flex gap-2">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={chipClass(filter === f.key)}>
                    {f.label}
                    <span className="tabular-nums opacity-60">{data.patients.filter(f.match).length}</span>
                  </button>
                ))}
              </div>
              <div className={cn(CARD, 'overflow-hidden shadow-none')}>
                <div className={cn(ROW_GRID, 'border-b border-line-2 bg-surface-2/60 px-5 py-2.5 text-[11.5px] font-medium text-ink-3')}>
                  <span>Patient</span>
                  <span>Status</span>
                  <span>Tries</span>
                  <span>Last activity</span>
                  <span />
                </div>
                {rows.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[13px] text-ink-3">No patients here.</p>
                ) : (
                  rows.slice(0, 150).map((p) => <PatientRow key={p.id} p={p} href={hrefFor(p)} selected={openId === p.patientId} />)
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {review.length > 0 && (
                <Panel title="Check these charts" count={review.length}>
                  <Queue patients={review} hrefFor={hrefFor} onDone={refresh} />
                </Panel>
              )}

              <Panel title="Needs a person" count={staff.length}>
                {staff.length === 0 ? (
                  <p className="px-4 pb-5 pt-1 text-[13px] text-ink-3">Nothing waiting. Ava hands patients over here.</p>
                ) : (
                  <Queue patients={staff} hrefFor={hrefFor} onDone={refresh} />
                )}
              </Panel>

              <Panel
                title="Coming up"
                action={
                  <Link href="/calendar" className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">
                    Calendar →
                  </Link>
                }
              >
                {upcoming.length === 0 ? (
                  <p className="px-4 pb-5 pt-1 text-[13px] text-ink-3">No visits booked yet.</p>
                ) : (
                  <ul className="px-2 pb-2">
                    {upcoming.map((v) => {
                      const d = new Date(v.startsAt);
                      return (
                        <li key={v.leadId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                          <span className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1 leading-none">
                            <span className="text-[10px] font-semibold uppercase text-ink-3">
                              {d.toLocaleDateString('en-US', {
                                weekday: 'short',
                              })}
                            </span>
                            <span className="mt-0.5 text-[15px] font-semibold tabular-nums">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-semibold">{v.name}</span>
                            <span className="block text-[12px] text-ink-3">
                              {d.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              {data.dashboardUrl && (
                <a href={data.dashboardUrl} target="_blank" rel="noreferrer" className="px-1 text-[12.5px] text-ink-3 hover:text-ink-2">
                  Call transcripts and recordings ↗
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {openId && (
        <PatientDrawer
          patientId={openId}
          preview={openName ? { name: openName } : undefined}
          initial={selected && { patient: selected, outreach: selectedOutreach }}
          closeHref={campaignHref(nct)}
        />
      )}
    </AppShell>
  );
}
