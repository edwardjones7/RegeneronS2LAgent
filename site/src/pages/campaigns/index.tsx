import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, Badge, type BadgeTone, Button, EmptyRow, PageIntro, StatCard, StatGrid, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { getOutreachOverview, type OutreachOverview, type OutreachPatient, type OutreachStatus } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

interface OutreachPageProps {
  nct: string | null;
  initial: OutreachOverview;
}

export const getServerSideProps: GetServerSideProps<OutreachPageProps> = async ({ query }) => {
  const nct = typeof query.nct === 'string' && /^NCT\d{8}$/.test(query.nct) ? query.nct : null;
  return { props: { nct, initial: await getOutreachOverview(nct ?? undefined) } };
};

const STATUS: Record<OutreachStatus, { label: string; tone: BadgeTone }> = {
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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const visitTime = (local: string) =>
  new Date(local).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
              'size-2.5 rounded-full border',
              i >= tries && 'border-dashed border-ink-3/40',
              i < tries && !last && 'border-accent/40 bg-accent-weak',
              last && p.status === 'booked' && 'border-pass bg-pass',
              last && p.status === 'calling' && 'animate-pulse border-accent bg-accent',
              last && (p.status === 'needs_human' || p.status === 'emergency') && 'border-unk bg-unk-bg',
              last && !['booked', 'calling', 'needs_human', 'emergency'].includes(p.status) && 'border-accent/60 bg-accent-weak'
            )}
          />
        );
      })}
    </span>
  );
}

function PatientLink({ p }: { p: OutreachPatient }) {
  return (
    <Link href={`/patients?patient=${encodeURIComponent(p.patientId)}`} className="font-medium hover:text-accent">
      {p.name}
    </Link>
  );
}

function QueueItem({ p, onDone }: { p: OutreachPatient; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: 'restart' | 'contacted' | 'drop' | 'clear') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/leads/${p.id}/${action}`, { method: 'POST' });
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
    <li className="border-b border-line-2 px-4 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <PatientLink p={p} />
        <span className="shrink-0 text-xs text-ink-3">{timeAgo(p.lastActivity?.at)}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{p.reason}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {review ? (
          <Button className="px-2.5 py-1" disabled={busy} onClick={() => act('clear')}>
            Chart checked, call
          </Button>
        ) : (
          <>
            {p.status !== 'emergency' && (
              <Button variant="secondary" className="px-2.5 py-1" disabled={busy} onClick={() => act('restart')}>
                Have Ava call again
              </Button>
            )}
            <Button variant="secondary" className="px-2.5 py-1" disabled={busy} onClick={() => act('contacted')}>
              I reached them
            </Button>
          </>
        )}
        <Button variant="secondary" className="px-2.5 py-1 text-ink-3" disabled={busy} onClick={() => act('drop')}>
          Drop
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}
    </li>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <h2 className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {title}
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'booked', label: 'Booked', match: (p: OutreachPatient) => p.status === 'booked' },
  { key: 'progress', label: 'In progress', match: (p: OutreachPatient) => ['calling', 'queued', 'no_answer'].includes(p.status) },
  { key: 'closed', label: 'Closed', match: (p: OutreachPatient) => ['closed', 'opted_out', 'dropped', 'not_a_fit'].includes(p.status) },
] as const;

export default function OutreachPage({ nct, initial }: OutreachPageProps) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const url = `/api/outreach${nct ? `?nct=${nct}` : ''}`;
  const refresh = () => fetchJson<OutreachOverview>(url).then(setData).catch(() => {});

  // Ava works in the background; keep the page live while it's open.
  useEffect(() => {
    const id = setInterval(() => !document.hidden && fetchJson<OutreachOverview>(url).then(setData).catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [url]);

  const t = data.totals;
  const staff = data.patients.filter((p) => p.status === 'needs_human' || p.status === 'emergency');
  const review = data.patients.filter((p) => p.status === 'chart_review');
  const tests = data.patients.filter((p) => p.testBirthDate);
  const now = new Date();
  const upcoming = data.visits.filter((v) => new Date(v.startsAt) >= new Date(now.getTime() - 3600_000)).slice(0, 8);
  const match = FILTERS.find((f) => f.key === filter)!.match;
  const rows = data.patients
    .filter(match)
    .sort((a, b) => (b.lastActivity?.at ?? '').localeCompare(a.lastActivity?.at ?? ''));

  return (
    <AppShell title="Campaigns" active="campaigns">
      <PageIntro
        title={
          data.trials.length > 0
            ? `Here’s how Ava is doing, ${DEMO_PRACTICE.doctor}.`
            : `Nothing running yet, ${DEMO_PRACTICE.doctor}.`
        }
        meta={
          data.trials.length > 0 ? `${data.trials.length} ${data.trials.length === 1 ? 'trial' : 'trials'} accepted` : undefined
        }
        description={
          data.trials.length > 0
            ? 'She calls your pre-screened patients and books their screening visits.'
            : 'Each trial you accept becomes a campaign. Ava calls its candidates from your office.'
        }
        tabs={
          data.trials.length > 0 ? (
            <Tabs
              active={nct ?? 'all'}
              items={[
                { key: 'all', label: 'All trials', href: '/campaigns' },
                ...data.trials.map((x) => ({ key: x.nctId, label: x.title, href: `/campaigns?nct=${x.nctId}`, count: x.booked })),
              ]}
            />
          ) : undefined
        }
      />

      {!data.available ? (
        <p className="mt-8 rounded-[10px] border border-line p-6 text-[13px] text-ink-3">
          The outreach caller isn&rsquo;t reachable right now. Calls already in progress keep going; this page will catch up when it&rsquo;s back.
        </p>
      ) : data.trials.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line-2 bg-surface px-8 py-12 text-center shadow-[0_1px_2px_rgba(30,36,48,0.04)]">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">No campaigns yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-2">
            Accept a trial and Ava starts calling its pre-screened patients from your office. There&rsquo;s nothing else to set up.
          </p>
          <Link
            href="/trials"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/85"
          >
            See recommended trials
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          {tests.length > 0 && (
            <div className="mt-5 rounded-lg border border-line border-l-[3px] border-l-accent bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">Test call.</span> When your phone rings, you&rsquo;re{' '}
              {tests.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ' or '}
                  <span className="font-semibold text-ink">{p.name}</span>, born {formatDate(p.testBirthDate!)}
                </span>
              ))}
              . Ava will ask you to confirm that birthday before she says anything about the study.
            </div>
          )}

          <div className="mt-6">
            <StatGrid>
              <StatCard label="Called" value={t.called} suffix={`/ ${t.patients}`} hint={`${t.inProgress} on a call now`} />
              <StatCard label="Reached" value={t.called ? `${Math.round((t.reached / t.called) * 100)}%` : '—'} hint={`${t.texted} texted after a missed call`} />
              <StatCard label="Booked" value={t.booked} hint="Screening visits here" selected />
              <StatCard label="Needs a person" value={t.needsStaff + t.chartReview} hint={`${t.chartReview} waiting on a chart check`} />
            </StatGrid>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <div className="mb-3 flex gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[12px] font-semibold',
                      filter === f.key ? 'border-accent-line bg-accent-weak text-accent' : 'border-line text-ink-2 hover:border-ink-3'
                    )}
                  >
                    {f.label} <span className="ml-0.5 tabular-nums text-ink-3">{data.patients.filter(f.match).length}</span>
                  </button>
                ))}
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Patient</Th>
                    <Th>Status</Th>
                    <Th>Tries</Th>
                    <Th>Last activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 150).map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <PatientLink p={p} />
                        <div className="text-xs text-ink-3">
                          {p.simulated ? 'Simulated' : 'Real phone'}
                          {p.callWindow ? ` · prefers ${p.callWindow}` : ''}
                          {p.callbacks ? ` · called back ${p.callbacks}×` : ''}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={STATUS[p.status]?.tone ?? 'neutral'}>{STATUS[p.status]?.label ?? p.status}</Badge>
                      </Td>
                      <Td>
                        <Tries p={p} />
                      </Td>
                      <Td className="text-ink-2">
                        {p.lastActivity ? (
                          <>
                            {ACTIVITY[p.lastActivity.type] ?? p.lastActivity.type.replaceAll('_', ' ')}{' '}
                            <span className="text-xs text-ink-3">· {timeAgo(p.lastActivity.at)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </Td>
                    </Tr>
                  ))}
                  {rows.length === 0 && <EmptyRow colSpan={4}>No patients here.</EmptyRow>}
                </tbody>
              </Table>
            </div>

            <div className="flex flex-col gap-5">
              {review.length > 0 && (
                <Panel title="Check these charts before Ava calls" count={review.length}>
                  <ul>
                    {review.map((p) => (
                      <QueueItem key={p.id} p={p} onDone={refresh} />
                    ))}
                  </ul>
                </Panel>
              )}
              <Panel title="Coming up" count={data.visits.length}>
                {upcoming.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-3">No visits booked yet.</p>
                ) : (
                  <ul>
                    {upcoming.map((v) => (
                      <li key={v.leadId} className="flex items-baseline justify-between gap-3 border-b border-line-2 px-4 py-2.5 text-[13px] last:border-b-0">
                        <span className="font-medium">{v.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-2">{visitTime(v.startsAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Needs a person" count={staff.length}>
                {staff.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-3">Nothing waiting. Ava hands patients over here.</p>
                ) : (
                  <ul>
                    {staff.map((p) => (
                      <QueueItem key={p.id} p={p} onDone={refresh} />
                    ))}
                  </ul>
                )}
              </Panel>


              {data.dashboardUrl && (
                <a href={data.dashboardUrl} target="_blank" rel="noreferrer" className="text-[12px] text-ink-3 hover:text-ink-2">
                  Call transcripts and recordings ↗
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
