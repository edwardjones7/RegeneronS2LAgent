import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WeekCalendar } from '@/components/outreach/WeekCalendar';
import { AppShell, Button, LinkButton, PageHeader, Tabs } from '@/components/ui';
import { calendarWeekStart, getCalendar, getOutreachOverview, type OutreachOverview, type OutreachPatient, type PracticeCalendar } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { formatDate } from '@/lib/utils/format';

/**
 * The doctor's view of outreach: is it working, who's coming in, and does anything need them.
 * Everything else (every patient, every try) is one click away at /outreach/patients.
 */

interface OutreachPageProps {
  nct: string | null;
  initial: OutreachOverview;
  calendar: PracticeCalendar;
  /** The practice's local date, YYYY-MM-DD. */
  today: string;
}

export const getServerSideProps: GetServerSideProps<OutreachPageProps> = async ({ query }) => {
  const nct = typeof query.nct === 'string' && /^NCT\d{8}$/.test(query.nct) ? query.nct : null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [initial, calendar] = await Promise.all([getOutreachOverview(nct ?? undefined), getCalendar(calendarWeekStart(), 5)]);
  return { props: { nct, initial, calendar, today } };
};

const first = (name: string) => name.split(' ')[0];

/** What happened, in one plain sentence, for a patient Ava handed to the office. */
function whatHappened(p: OutreachPatient): string {
  const r = p.reason.trim();
  if (p.status === 'emergency') return `${p.name} mentioned something that could be an emergency. Ava told them to call 911.`;
  if (/^no answer after/.test(r)) return `${p.name} didn’t pick up after 3 tries.`;
  if (/requested a person/i.test(r)) return `${p.name} wants to talk to someone at the office.`;
  if (/^medical question:/i.test(r)) return `${p.name} has a medical question: “${r.replace(/^medical question:\s*/i, '')}”`;
  if (/^callback requested:/i.test(r)) return `${p.name} asked to be called back ${r.replace(/^callback requested:\s*/i, '')}.`;
  if (/identity/i.test(r) || /date of birth/i.test(r)) return `Ava couldn’t confirm she was talking to ${p.name}.`;
  if (/texted/i.test(r) || r.startsWith('"')) return `${p.name} texted back: ${r.replace(/^texted back; a person should reply$/i, 'a message for the office.')}`;
  if (/language/i.test(r)) return `${p.name} would rather talk in another language.`;
  if (/talk (it over )?(with|to) the doctor/i.test(r)) return `${p.name} wants to talk it over with you first.`;
  return `${p.name}: ${r.charAt(0).toLowerCase()}${r.slice(1)}.`.replace(/\.\.$/, '.');
}

function NeedsYouItem({ p, onDone }: { p: OutreachPatient; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: 'restart' | 'contacted') => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/leads/${p.id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'That didn’t work');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, 'That didn’t work'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="border-b border-line-2 py-3.5 last:border-b-0">
      <p className="text-[13.5px] leading-snug">{whatHappened(p)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button className="px-3 py-1.5" disabled={busy !== null} onClick={() => act('contacted')}>
          {busy === 'contacted' ? 'Saving…' : `I’ll call ${first(p.name)}`}
        </Button>
        {p.status !== 'emergency' && (
          <Button variant="secondary" className="px-3 py-1.5" disabled={busy !== null} onClick={() => act('restart')}>
            {busy === 'restart' ? 'Saving…' : 'Ava, try again'}
          </Button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}
    </li>
  );
}

export default function OutreachPage({ nct, initial, calendar, today }: OutreachPageProps) {
  const [data, setData] = useState(initial);
  const url = `/api/outreach${nct ? `?nct=${nct}` : ''}`;
  const load = () =>
    fetchJson<OutreachOverview>(url)
      .then(setData)
      .catch(() => {});
  const refresh = () => void load();

  // Ava works in the background; keep the page current while it's open.
  useEffect(() => {
    const tick = () =>
      !document.hidden &&
      fetchJson<OutreachOverview>(url)
        .then(setData)
        .catch(() => {});
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [url]);

  const t = data.totals;
  const trial = nct ? data.trials.find((x) => x.nctId === nct) : null;
  const callable = t.patients - t.chartReview;
  const needsYou = data.patients
    .filter((p) => p.status === 'needs_human' || p.status === 'emergency')
    .sort((a, b) => Number(b.status === 'emergency') - Number(a.status === 'emergency'));
  const charts = data.patients.filter((p) => p.status === 'chart_review');
  const tests = data.patients.filter((p) => p.testBirthDate);
  const everyone = `/outreach/patients${nct ? `?nct=${nct}` : ''}`;

  return (
    <AppShell title="Outreach" active="outreach">
      <PageHeader
        title={trial ? `Outreach · ${trial.title}` : 'Outreach'}
        tabs={
          data.trials.length > 1 ? (
            <Tabs
              active={nct ?? 'all'}
              items={[
                { key: 'all', label: 'All trials', href: '/outreach' },
                ...data.trials.map((x) => ({ key: x.nctId, label: x.title, href: `/outreach?nct=${x.nctId}` })),
              ]}
            />
          ) : undefined
        }
      />

      {!data.available ? (
        <p className="mt-8 rounded-[10px] border border-line p-6 text-[13px] text-ink-3">
          Can&rsquo;t reach Ava right now. Calls already underway keep going; this page catches up when she&rsquo;s back.
        </p>
      ) : data.trials.length === 0 ? (
        <div className="mt-8 rounded-[10px] border border-line p-8 text-center">
          <h2 className="text-base font-semibold">Nothing to follow yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-2">
            Accept a trial and Ava calls its pre-screened patients from your office and books them in. You don&rsquo;t need to do anything else.
          </p>
          <LinkButton href="/trials" className="mt-4">
            See recommended trials
          </LinkButton>
        </div>
      ) : (
        <>
          <section className="mt-6">
            <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em]">
              Ava has called {t.called} of your {callable} patients.{' '}
              <span className="text-pass">
                {t.booked} {t.booked === 1 ? 'is' : 'are'} coming in.
              </span>
            </p>
            <div className="mt-3 h-2 max-w-2xl overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${t.called} of ${callable} called, ${t.booked} booked`}>
              <div className="flex h-full">
                <div className="h-full bg-pass transition-[width] duration-700" style={{ width: `${callable ? (t.booked / callable) * 100 : 0}%` }} />
                <div className="h-full bg-accent/40 transition-[width] duration-700" style={{ width: `${callable ? (Math.max(0, t.called - t.booked) / callable) * 100 : 0}%` }} />
              </div>
            </div>
            {tests.length > 0 && (
              <p className="mt-3 text-[12.5px] text-ink-3">
                Test call: when your phone rings, you&rsquo;re {tests.map((p) => `${p.name}, born ${formatDate(p.testBirthDate!)}`).join(' or ')}.
              </p>
            )}
          </section>

          <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
            <WeekCalendar initial={calendar} today={today} />

            <section>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Needs you{needsYou.length + (charts.length ? 1 : 0) > 0 && ` · ${needsYou.length + (charts.length ? 1 : 0)}`}
              </h2>
              {needsYou.length === 0 && charts.length === 0 ? (
                <p className="mt-3 text-[13.5px] text-ink-3">Nothing needs you right now.</p>
              ) : (
                <ul className="mt-1">
                  {needsYou.slice(0, 6).map((p) => (
                    <NeedsYouItem key={p.id} p={p} onDone={refresh} />
                  ))}
                  {needsYou.length > 6 && (
                    <li className="border-b border-line-2 py-3 text-[13px] last:border-b-0">
                      <Link href={everyone} className="font-semibold text-accent hover:underline">
                        {needsYou.length - 6} more people need a call →
                      </Link>
                    </li>
                  )}
                  {charts.length > 0 && (
                    <li className="border-b border-line-2 py-3.5 last:border-b-0">
                      <p className="text-[13.5px] leading-snug">
                        {charts.length} {charts.length === 1 ? 'chart needs' : 'charts need'} a quick look before Ava calls. The records
                        couldn&rsquo;t settle everything.
                      </p>
                      <LinkButton href={`${everyone}${nct ? '&' : '?'}show=review`} variant="secondary" className="mt-2 px-3 py-1.5">
                        Check charts
                      </LinkButton>
                    </li>
                  )}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-10 flex items-center gap-5 border-t border-line pt-4 text-[13px]">
            <Link href={everyone} className="font-semibold text-accent hover:underline">
              See every patient →
            </Link>
            <span className="text-ink-3">Patients stay with {DEMO_PRACTICE.name}. Sponsors only see counts.</span>
          </div>
        </>
      )}
    </AppShell>
  );
}
