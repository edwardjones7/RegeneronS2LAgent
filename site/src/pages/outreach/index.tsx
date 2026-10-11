import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ActivityFeed } from '@/components/outreach/ActivityFeed';
import { OutreachHero } from '@/components/outreach/OutreachHero';
import { AppShell, Button, LinkButton, PageHeader, Tabs } from '@/components/ui';
import { type Activity, getActivity, getOutreachOverview, type OutreachOverview, type OutreachPatient } from '@/lib/caller';
import { DEMO_PRACTICE } from '@/lib/practice';
import { getTrialAreas } from '@/lib/trialAreas';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { fetchJson, getErrorMessage } from '@/lib/utils/api';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

/**
 * The doctor's view of outreach: how many are coming in, who's next, what needs them, and what Ava
 * is doing right now. Every patient and every try is one click away at /outreach/patients.
 */

interface OutreachPageProps {
  nct: string | null;
  initial: OutreachOverview;
  activity: Activity;
  areas: Record<string, TherapeuticArea>;
  /** The practice's local date, YYYY-MM-DD. */
  today: string;
}

export const getServerSideProps: GetServerSideProps<OutreachPageProps> = async ({ query }) => {
  const nct = typeof query.nct === 'string' && /^NCT\d{8}$/.test(query.nct) ? query.nct : null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [initial, activity, areas] = await Promise.all([getOutreachOverview(nct ?? undefined), getActivity(), getTrialAreas()]);
  return { props: { nct, initial, activity, areas, today } };
};

const first = (name: string) => name.split(' ')[0];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** What happened, in one plain sentence, for a patient Ava handed to the office. */
function whatHappened(p: OutreachPatient): string {
  const r = p.reason.trim();
  if (p.status === 'emergency') return `${p.name} mentioned something that could be an emergency. Ava told them to call 911.`;
  if (/^no answer after/.test(r)) return `${p.name} didn’t pick up after 3 tries.`;
  if (/requested a person/i.test(r)) return `${p.name} wants to talk to someone at the office.`;
  if (/^medical question:/i.test(r)) return `${p.name} has a medical question: “${r.replace(/^medical question:\s*/i, '')}”`;
  if (/^callback requested:/i.test(r)) return `${p.name} asked to be called back ${r.replace(/^callback requested:\s*/i, '')}.`;
  if (/identity/i.test(r) || /date of birth/i.test(r)) return `Ava couldn’t confirm she was talking to ${p.name}.`;
  if (/screening finished|ended before/i.test(r)) return `${p.name}’s call dropped partway through.`;
  if (/texted/i.test(r)) return `${p.name} texted back and is waiting on a reply.`;
  if (/language/i.test(r)) return `${p.name} would rather talk in another language.`;
  if (/talk (it over )?(with|to) the doctor/i.test(r)) return `${p.name} wants to talk it over with you first.`;
  return `${p.name}: ${r.charAt(0).toLowerCase()}${r.slice(1)}.`.replace(/\.\.$/, '.');
}

function NeedsYouCard({ p, onDone }: { p: OutreachPatient; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const urgent = p.status === 'emergency';
  const act = async (action: 'restart' | 'contacted' | 'drop') => {
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
    <li
      className={cn(
        'flex animate-slide-up gap-3 rounded-xl border border-line border-l-[3px] bg-surface p-3.5',
        urgent ? 'border-l-fail' : 'border-l-unk'
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
          urgent ? 'bg-fail-bg text-fail' : 'bg-unk-bg text-unk'
        )}
      >
        {initials(p.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug">{whatHappened(p)}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button className="px-3 py-1.5" disabled={busy !== null} onClick={() => act('contacted')}>
            {busy === 'contacted' ? 'Saving…' : `I’ll call ${first(p.name)}`}
          </Button>
          {!urgent && (
            <Button variant="secondary" className="px-3 py-1.5" disabled={busy !== null} onClick={() => act('restart')}>
              {busy === 'restart' ? 'Saving…' : 'Ava, try again'}
            </Button>
          )}
          {/* Remove them from the outreach: no more calls or texts, and off this list. */}
          {confirmDrop ? (
            <span className="flex items-center gap-1.5 text-[12.5px]">
              <Button variant="secondary" className="border-fail/40 px-3 py-1.5 text-fail" disabled={busy !== null} onClick={() => act('drop')}>
                {busy === 'drop' ? 'Removing…' : `Remove ${first(p.name)}`}
              </Button>
              <button className="text-ink-3 hover:text-ink-2" onClick={() => setConfirmDrop(false)} disabled={busy !== null}>
                Keep
              </button>
            </span>
          ) : (
            <button
              className="px-1.5 text-[12.5px] font-medium text-ink-3 hover:text-fail"
              disabled={busy !== null}
              onClick={() => setConfirmDrop(true)}
            >
              Don&rsquo;t follow up
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}
      </div>
    </li>
  );
}

function DateTile({ local, today }: { local: string; today: string }) {
  const d = new Date(local);
  const isToday = local.slice(0, 10) === today;
  return (
    <span
      className={cn(
        'grid w-11 shrink-0 place-items-center rounded-lg border py-1 leading-none',
        isToday ? 'border-accent-line bg-accent-weak text-accent' : 'border-line bg-surface'
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <span className="mt-0.5 text-[17px] font-semibold tabular-nums">{d.getDate()}</span>
    </span>
  );
}

const timeOf = (local: string) => new Date(local).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function OutreachPage({ nct, initial, activity, areas, today }: OutreachPageProps) {
  const [data, setData] = useState(initial);
  const url = `/api/outreach${nct ? `?nct=${nct}` : ''}`;
  const refresh = () => void fetchJson<OutreachOverview>(url).then(setData).catch(() => {});

  // Ava works in the background; keep the page current while it's open.
  useEffect(() => {
    const id = setInterval(() => !document.hidden && fetchJson<OutreachOverview>(url).then(setData).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [url]);

  const t = data.totals;
  const trial = nct ? data.trials.find((x) => x.nctId === nct) : null;
  const area = (nct && areas[nct]) || (data.trials.length === 1 ? areas[data.trials[0].nctId] : null) || null;
  const callable = t.patients - t.chartReview;
  const needsYou = data.patients
    .filter((p) => p.status === 'needs_human' || p.status === 'emergency')
    .sort((a, b) => Number(b.status === 'emergency') - Number(a.status === 'emergency'));
  const charts = data.patients.filter((p) => p.status === 'chart_review');
  const tests = data.patients.filter((p) => p.testBirthDate);
  const comingUp = data.visits.filter((v) => v.startsAt.slice(0, 10) >= today);
  const everyone = `/outreach/patients${nct ? `?nct=${nct}` : ''}`;
  const testLine = tests.length
    ? `Test call: when your phone rings, you’re ${tests.map((p) => `${p.name}, born ${formatDate(p.testBirthDate!)}`).join(' or ')}.`
    : null;

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
        <p className="mt-8 rounded-2xl border border-line p-6 text-[13px] text-ink-3">
          Can&rsquo;t reach Ava right now. Calls already underway keep going; this page catches up when she&rsquo;s back.
        </p>
      ) : data.trials.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line p-10 text-center">
          <h2 className="text-lg font-semibold">Nothing to follow yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-2">
            Accept a trial and Ava calls its pre-screened patients from your office and books them in. You don&rsquo;t need to do anything else.
          </p>
          <LinkButton href="/trials" className="mt-5">
            See recommended trials
          </LinkButton>
        </div>
      ) : (
        <>
          <OutreachHero booked={t.booked} called={t.called} total={callable} area={area} testLine={testLine} />

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <section>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Needs you{needsYou.length + (charts.length ? 1 : 0) > 0 && ` · ${needsYou.length + (charts.length ? 1 : 0)}`}
              </h2>
              {needsYou.length === 0 && charts.length === 0 ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-pass-bg/50 p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pass-bg text-pass">✓</span>
                  <p className="text-[13.5px]">
                    <span className="font-semibold">All caught up.</span> <span className="text-ink-2">Ava hands patients to you here when they need a person.</span>
                  </p>
                </div>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {needsYou.slice(0, 5).map((p) => (
                    <NeedsYouCard key={p.id} p={p} onDone={refresh} />
                  ))}
                  {needsYou.length > 5 && (
                    <li>
                      <Link href={everyone} className="text-[13px] font-semibold text-accent hover:underline">
                        {needsYou.length - 5} more people need a call →
                      </Link>
                    </li>
                  )}
                  {charts.length > 0 && (
                    <li className="flex gap-3 rounded-xl border border-line border-l-[3px] border-l-accent bg-surface p-3.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-weak text-[13px] font-semibold text-accent">
                        {charts.length}
                      </span>
                      <div>
                        <p className="text-[13.5px] leading-snug">
                          {charts.length === 1 ? 'A chart needs' : `${charts.length} charts need`} a quick look before Ava calls.
                        </p>
                        <LinkButton href={`${everyone}${nct ? '&' : '?'}show=review`} variant="secondary" className="mt-2.5 px-3 py-1.5">
                          Check charts
                        </LinkButton>
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">Coming up</h2>
              {comingUp.length === 0 ? (
                <p className="mt-3 text-[13.5px] text-ink-3">No one&rsquo;s booked yet. Ava is still calling.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {comingUp.slice(0, 5).map((v) => (
                    <li key={v.leadId} className="flex items-center gap-3">
                      <DateTile local={v.startsAt} today={today} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{v.name}</span>
                        <span className="block text-[12px] text-ink-3">{timeOf(v.startsAt)} · screening visit</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/calendar" className="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline">
                {comingUp.length > 5 ? `See all ${comingUp.length} on the calendar →` : 'Open the calendar →'}
              </Link>
            </section>

            <ActivityFeed initial={activity} />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13px]">
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
